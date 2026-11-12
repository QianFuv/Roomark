package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"io/fs"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pressly/goose/v3"
	"roomark/db"
	"roomark/internal/domain"
	"roomark/internal/roomcode"
	"roomark/internal/store"
)

// TestRoomCodesAreUniqueAndFixed verifies the code format, database uniqueness and administrative contract.
func TestRoomCodesAreUniqueAndFixed(t *testing.T) {
	c := newTestClient(t)
	codes := map[string]bool{c.roomToken: true}
	for index := range 24 {
		var room domain.AdminRoom
		response := c.call("POST", "/api/admin/rooms", RoomInput{Slug: fmt.Sprintf("room-%d", index), Name: "新房间"}, 201, &room)
		if len(room.Code) != 6 || strings.Trim(room.Code, roomcode.Alphabet) != "" || codes[room.Code] {
			t.Fatalf("invalid or duplicate code: %q", room.Code)
		}
		if strings.Contains(response.Body.String(), "accessToken") || strings.Contains(response.Body.String(), "tokenRotatedAt") {
			t.Fatalf("legacy room fields: %s", response.Body)
		}
		codes[room.Code] = true
	}
	var edited domain.AdminRoom
	name := "改名后的房间"
	c.call("PATCH", "/api/admin/rooms/1", EditRoom{Name: &name}, 200, &edited)
	if edited.Code != c.roomToken {
		t.Fatalf("room edit changed code: %q", edited.Code)
	}
	var rooms []domain.AdminRoom
	c.call("GET", "/api/admin/rooms", nil, 200, &rooms)
	if len(rooms) != len(codes) {
		t.Fatalf("rooms=%d codes=%d", len(rooms), len(codes))
	}
	var qr QR
	response := c.call("GET", "/api/admin/rooms/1/qr", nil, 200, &qr)
	if qr.Code != c.roomToken || qr.URL != "https://rooms.example.com/r/9070?k="+c.roomToken || strings.Contains(response.Body.String(), "tokenRotatedAt") {
		t.Fatalf("QR=%s", response.Body)
	}
	c.call("POST", "/api/admin/rooms/1/rotate-token", nil, 404, nil)
	if _, err := c.service.db.ExecContext(context.Background(), "UPDATE rooms SET access_token=? WHERE slug='room-0'", c.roomToken); err == nil {
		t.Fatal("database allowed duplicate room codes")
	}
}

// TestRoomCreationRetriesCodeCollisions forces a duplicate candidate before a unique code.
func TestRoomCreationRetriesCodeCollisions(t *testing.T) {
	c := newTestClient(t)
	if _, err := c.service.db.ExecContext(context.Background(), "UPDATE rooms SET access_token='AAAAAA' WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	originalReader := rand.Reader
	rand.Reader = bytes.NewReader(append(bytes.Repeat([]byte{0}, 6), bytes.Repeat([]byte{1}, 6)...))
	t.Cleanup(func() { rand.Reader = originalReader })
	var room domain.AdminRoom
	c.call("POST", "/api/admin/rooms", RoomInput{Slug: "second", Name: "第二间"}, 201, &room)
	if room.Code != "BBBBBB" {
		t.Fatalf("code=%q, want collision retry BBBBBB", room.Code)
	}
}

// TestRoomCodesNormalizeAtEveryEntry checks typed codes, room headers, identity binding and both iCal inputs.
func TestRoomCodesNormalizeAtEveryEntry(t *testing.T) {
	c := newTestClient(t)
	if _, err := c.service.db.ExecContext(context.Background(), "UPDATE rooms SET access_token='K7M2XQ' WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	c.roomToken = "K7M2XQ"
	c.session = ""
	c.roomToken = "  " + strings.ToLower(c.roomToken) + "  "
	var resolved ResolvedRoom
	c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: c.roomToken}, 200, &resolved)
	if resolved.Slug != "9070" || resolved.Name != "讨论室" {
		t.Fatalf("resolved=%+v", resolved)
	}
	c.call("GET", "/api/rooms/9070", nil, 200, nil)
	c.call("GET", "/api/people?room=9070", nil, 200, nil)
	c.call("GET", "/ical/9070.ics?k="+url.QueryEscape(c.roomToken), nil, 200, nil)
	c.call("GET", "/ical/9070.ics", nil, 200, nil)
	c.call("POST", "/api/people", SelfPerson{Passcode: Passcode{Passcode: "123456"}, Name: "绑定人"}, 201, nil)
	for _, code := range []string{"WRONG", "", "old-long-token", "ABC0IL"} {
		var failure Problem
		c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: code}, 404, &failure)
		if failure.Code != "room_code_invalid" || failure.Detail != "房间码不正确" {
			t.Fatalf("failure=%+v", failure)
		}
	}
}

// TestArchivedRoomCodeIsInvalid denies discovery and access while retaining the room's fixed code.
func TestArchivedRoomCodeIsInvalid(t *testing.T) {
	c := newTestClient(t)
	archived := true
	c.call("PATCH", "/api/admin/rooms/1", EditRoom{Archived: &archived}, 200, nil)
	c.session = ""
	var failure Problem
	c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: c.roomToken}, 404, &failure)
	if failure.Code != "room_code_invalid" || failure.Detail != "房间码不正确" {
		t.Fatalf("failure=%+v", failure)
	}
	c.call("GET", "/api/rooms/9070", nil, 403, nil)
	c.call("GET", "/ical/9070.ics?k="+c.roomToken, nil, 403, nil)
	if _, err := c.service.db.ExecContext(context.Background(), "UPDATE rooms SET archived_at=NULL WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: c.roomToken}, 200, nil)
}

// TestRoomCodeFailuresShareRateLimit verifies all checking paths share a sliding window and successes stay usable.
func TestRoomCodeFailuresShareRateLimit(t *testing.T) {
	c := newTestClient(t)
	admin := c.session
	var preset domain.Person
	c.call("POST", "/api/admin/people", PresetPerson{Name: "待绑定", Role: "student"}, 201, &preset)
	code := c.roomToken
	c.session = ""
	for range 15 {
		c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: code}, 200, nil)
		c.call("GET", "/api/rooms/9070", nil, 200, nil)
	}
	for range 2 {
		c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: "WRONG"}, 404, nil)
		c.roomToken = "WRONG"
		c.call("GET", "/api/rooms/9070", nil, 403, nil)
		c.call("GET", "/ical/9070.ics?k=WRONG", nil, 403, nil)
		c.call("POST", "/api/people", SelfPerson{Passcode: Passcode{Passcode: "123456"}, Name: "失败"}, 403, nil)
		c.call("POST", fmt.Sprintf("/api/people/%d/claim", preset.ID), Passcode{Passcode: "123456"}, 403, nil)
	}
	var failure Problem
	c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: "WRONG"}, 429, &failure)
	if failure.Code != "rate_limited" {
		t.Fatalf("failure=%+v", failure)
	}
	c.call("GET", "/api/rooms/9070", nil, 429, nil)
	c.call("GET", "/api/people?room=9070", nil, 429, nil)
	c.call("GET", "/api/rooms/missing", nil, 429, nil)
	c.call("GET", "/ical/9070.ics?k=WRONG", nil, 429, nil)
	c.call("POST", "/api/people", SelfPerson{Passcode: Passcode{Passcode: "123456"}, Name: "失败"}, 429, nil)
	c.call("POST", fmt.Sprintf("/api/people/%d/claim", preset.ID), Passcode{Passcode: "123456"}, 429, nil)
	c.roomToken = ""
	c.call("GET", "/api/rooms/9070", nil, 403, &failure)
	if failure.Code != "room_token_required" {
		t.Fatalf("missing code=%+v", failure)
	}
	c.roomToken = code
	c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: code}, 200, nil)
	c.call("GET", "/api/rooms/9070", nil, 200, nil)
	c.call("GET", "/ical/9070.ics?k="+code, nil, 200, nil)
	c.call("POST", fmt.Sprintf("/api/people/%d/claim", preset.ID), Passcode{Passcode: "123456"}, 200, nil)
	c.call("POST", "/api/people", SelfPerson{Passcode: Passcode{Passcode: "123456"}, Name: "成功"}, 201, nil)
	c.session = admin
	c.roomToken = "WRONG"
	c.call("GET", "/api/rooms/9070", nil, 200, nil)
	now := c.service.now().Add(9 * time.Minute)
	c.service.now = func() time.Time { return now }
	c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: "WRONG"}, 429, nil)
	now = now.Add(time.Minute)
	c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: "WRONG"}, 404, nil)
}

// TestRoomCodeLimitUsesTrustedClientIP checks shared proxy addresses and ignores spoofed forwarding headers.
func TestRoomCodeLimitUsesTrustedClientIP(t *testing.T) {
	c := newTestClient(t)
	c.service.config.TrustedProxies = []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")}
	check := func(remote, forwarded string, status int) {
		t.Helper()
		request := httptest.NewRequest("POST", "/api/room-codes/resolve", strings.NewReader(`{"code":"WRONG"}`))
		request.RemoteAddr = remote
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Real-IP", forwarded)
		response := httptest.NewRecorder()
		c.handler.ServeHTTP(response, request)
		if response.Code != status {
			t.Fatalf("remote=%s forwarded=%s status=%d: %s", remote, forwarded, response.Code, response.Body)
		}
	}
	for range 10 {
		check("10.0.0.1:1234", "203.0.113.1", 404)
	}
	check("10.0.0.2:1234", "203.0.113.1", 429)
	check("10.0.0.1:1234", "203.0.113.2", 404)
	for range 10 {
		check("198.51.100.1:1234", "203.0.113.2", 404)
	}
	check("198.51.100.1:1234", "203.0.113.3", 429)
}

// TestLegacyRoomCodeMigration preserves room and booking data, retries collisions and persists codes across reopen.
func TestLegacyRoomCodeMigration(t *testing.T) {
	ctx := context.Background()
	databasePath := filepath.Join(t.TempDir(), "legacy.db")
	database, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatal(err)
	}
	database.SetMaxOpenConns(1)
	t.Cleanup(func() {
		if err := database.Close(); err != nil {
			t.Error(err)
		}
	})
	migrations, err := fs.Sub(db.Migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	provider, err := goose.NewProvider(goose.DialectSQLite3, database, migrations, goose.WithGoMigrations(db.RoomCodeMigration()))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.UpTo(ctx, 1); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		"INSERT INTO rooms(id,slug,name,access_token,token_rotated_at,created_at) VALUES(1,'demo','演示室','legacy-long-secret-token',123,456)",
		"INSERT INTO rooms(id,slug,name,access_token,token_rotated_at,archived_at,created_at) VALUES(2,'archived','归档室','AAAAAA',123,789,456)",
		"INSERT INTO bookings(room_id,kind,title,start_at,end_at,planned_end_at,created_at,updated_at) VALUES(1,'block','旧预约',100,200,200,50,50)",
	} {
		if _, err := database.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
	originalReader := rand.Reader
	rand.Reader = bytes.NewReader(append(append(bytes.Repeat([]byte{0}, 6), bytes.Repeat([]byte{1}, 6)...), bytes.Repeat([]byte{2}, 6)...))
	t.Cleanup(func() { rand.Reader = originalReader })
	service, err := Open(ctx, Config{Database: databasePath})
	rand.Reader = originalReader
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := service.Close(); err != nil {
			t.Error(err)
		}
	})
	rooms, err := store.New(service.db).ListRooms(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(rooms) != 2 || rooms[0].AccessToken != "CCCCCC" || rooms[1].AccessToken != "BBBBBB" || !rooms[0].ArchivedAt.Valid || rooms[1].CreatedAt != 456 {
		t.Fatalf("migrated rooms=%+v", rooms)
	}
	if _, err := service.db.ExecContext(ctx, "SELECT token_rotated_at FROM rooms"); err == nil {
		t.Fatal("migration retained token_rotated_at")
	}
	var violations int
	if err := service.db.QueryRowContext(ctx, "SELECT count(*) FROM pragma_foreign_key_check").Scan(&violations); err != nil || violations != 0 {
		t.Fatalf("foreign key violations=%d err=%v", violations, err)
	}
	bookings, err := store.New(service.db).ListBookings(ctx)
	if err != nil || len(bookings) != 1 || bookings[0].RoomID != 1 || bookings[0].Title != "旧预约" {
		t.Fatalf("migrated bookings=%+v err=%v", bookings, err)
	}
	c := &testClient{testing: t, service: service, handler: service.Handler(), roomToken: " bbbbbb "}
	c.call("GET", "/api/rooms/demo", nil, 200, nil)
	c.call("GET", "/ical/demo.ics?k=bbbbbb", nil, 200, nil)
	c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: "BBBBBB"}, 200, nil)
	c.call("POST", "/api/room-codes/resolve", ResolveRoomCode{Code: "legacy-long-secret-token"}, 404, nil)
	if err := service.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, Config{Database: databasePath})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := reopened.Close(); err != nil {
			t.Error(err)
		}
	}()
	room, err := store.New(reopened.db).RoomBySlug(ctx, "demo")
	if err != nil || room.AccessToken != "BBBBBB" {
		t.Fatalf("reopened room=%+v err=%v", room, err)
	}
}
