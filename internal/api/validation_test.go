package api

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
	"roomark/internal/domain"
	"roomark/internal/store"
)

// TestSixDigitPasscodes enforces the same passcode rule at every identity boundary.
func TestSixDigitPasscodes(t *testing.T) {
	for _, passcode := range []string{"", "1234", "12345", "1234567", "abcdef", "１２３４５６", " 123456"} {
		t.Run(passcode, func(t *testing.T) {
			c := newTestClient(t)
			var preset domain.Person
			c.call("POST", "/api/admin/people", PresetPerson{Name: "待认领", Role: "student"}, 201, &preset)
			for _, target := range []struct {
				method, path string
				body         any
			}{
				{"POST", fmt.Sprintf("/api/people/%d/claim", preset.ID), Passcode{Passcode: passcode}},
				{"POST", "/api/people", SelfPerson{Name: "自助", Passcode: Passcode{Passcode: passcode}}},
				{"PUT", "/api/me/passcode", ChangePasscode{Current: "123456", Next: passcode}},
			} {
				var failure Problem
				c.call(target.method, target.path, target.body, 422, &failure)
				if failure.Code != "invalid_passcode" || failure.Detail != "口令要用 6 位数字" {
					t.Fatalf("%s: %+v", target.path, failure)
				}
			}
			var failure Problem
			c.call("POST", "/api/sessions", Login{Name: "管理员", Passcode: passcode}, 401, &failure)
			if failure.Code != "invalid_passcode" {
				t.Fatalf("login: %+v", failure)
			}
			service, err := Open(context.Background(), Config{Database: filepath.Join(t.TempDir(), "bootstrap.db"), AdminName: "管理员", AdminPasscode: passcode})
			if err == nil {
				if closeErr := service.Close(); closeErr != nil {
					t.Fatal(closeErr)
				}
				t.Fatal("bootstrap accepted an invalid passcode")
			}
			if !strings.Contains(err.Error(), "ROOMARK_ADMIN_PASSCODE") || !strings.Contains(err.Error(), "口令要用 6 位数字") {
				t.Fatalf("bootstrap: %v", err)
			}
		})
	}
}

// TestPasscodeChangeAndLegacyLogin verifies valid changes and rejects old four-digit hashes.
func TestPasscodeChangeAndLegacyLogin(t *testing.T) {
	c := newTestClient(t)
	var preset domain.Person
	c.call("POST", "/api/admin/people", PresetPerson{Name: "待认领", Role: "student"}, 201, &preset)
	c.call("POST", fmt.Sprintf("/api/people/%d/claim", preset.ID), Passcode{Passcode: "012345"}, 200, nil)
	c.call("PUT", "/api/me/passcode", ChangePasscode{Current: "123456", Next: "654321"}, 200, nil)
	c.call("POST", "/api/sessions", Login{Name: "管理员", Passcode: "123456"}, 401, nil)
	c.call("POST", "/api/sessions", Login{Name: "管理员", Passcode: "654321"}, 200, nil)
	hash, err := bcrypt.GenerateFromPassword([]byte("1234"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.New(c.service.db).SetPasscode(context.Background(), store.SetPasscodeParams{ID: preset.ID, PasscodeHash: string(hash)}); err != nil {
		t.Fatal(err)
	}
	c.call("POST", "/api/sessions", Login{PersonID: preset.ID, Passcode: "1234"}, 401, nil)
}

// TestBookingTitlesRequired checks all creation paths, trimming and Unicode length boundaries.
func TestBookingTitlesRequired(t *testing.T) {
	for _, kind := range []string{"single", "quick", "series", "block", "on behalf", "block series", "on behalf series"} {
		t.Run(kind, func(t *testing.T) {
			c := newTestClient(t)
			rule := domain.SeriesRule{Freq: "weekly", Weekdays: []int{5}, StartDate: "2026-11-13", Count: 2, StartTime: "14:00", EndTime: "15:00"}
			path := "/api/rooms/9070/bookings"
			body := map[string]any{"start": bookingBody("14:00", "15:00").Start, "end": bookingBody("14:00", "15:00").End}
			if strings.Contains(kind, "series") {
				path = "/api/rooms/9070/series"
				body = map[string]any{"rule": rule, "overrides": []domain.Override{}}
			}
			if kind == "quick" {
				path = "/api/rooms/9070/quick"
				body = map[string]any{"minutes": 30}
			}
			if strings.Contains(kind, "block") {
				body["kind"] = "block"
			}
			if strings.Contains(kind, "on behalf") {
				var preset domain.Person
				c.call("POST", "/api/admin/people", PresetPerson{Name: "代约人", Role: "student"}, 201, &preset)
				body["onBehalfOf"] = preset.ID
			}
			for _, title := range []*string{nil, new(string), new(" \t\n　 "), new(strings.Repeat("用", 201))} {
				if title != nil {
					body["title"] = *title
				}
				var failure Problem
				c.call("POST", path, body, 422, &failure)
				if failure.Code != "title_required" || len(failure.Violations) != 1 || failure.Violations[0].Code != "title_required" || failure.Detail != "请填写用途（最多 200 字）" || failure.Violations[0].Message != failure.Detail {
					t.Fatalf("title %v: %+v", title, failure)
				}
			}
			body["title"] = nil
			var nullFailure Problem
			c.call("POST", path, body, 422, &nullFailure)
			if nullFailure.Code != "title_required" {
				t.Fatalf("null title: %+v", nullFailure)
			}
			body["title"] = " \t" + strings.Repeat("用", 200) + "　 "
			if strings.Contains(kind, "series") {
				preview := RuleInput{Rule: rule}
				if value, ok := body["kind"].(string); ok {
					preview.Kind = value
				}
				if value, ok := body["onBehalfOf"].(int64); ok {
					preview.OnBehalfOf = value
				}
				c.call("POST", "/api/rooms/9070/series/preview", preview, 200, nil)
				var created domain.SeriesResult
				c.call("POST", path, body, 201, &created)
				if len(created.Created) != 2 || created.Created[0].Title != strings.Repeat("用", 200) {
					t.Fatalf("series: %+v", created)
				}
			} else {
				var created domain.Booking
				c.call("POST", path, body, 201, &created)
				if created.Title != strings.Repeat("用", 200) {
					t.Fatalf("booking title: %q", created.Title)
				}
			}
		})
	}
}

// TestEditTitleAndLegacyBookings preserves untitled rows while validating explicitly supplied titles.
func TestEditTitleAndLegacyBookings(t *testing.T) {
	c := newTestClient(t)
	var booking domain.Booking
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, &booking)
	if _, err := c.service.db.ExecContext(context.Background(), "UPDATE bookings SET title = '' WHERE id = ?", booking.ID); err != nil {
		t.Fatal(err)
	}
	var mine domain.MyBookings
	c.call("GET", "/api/me/bookings", nil, 200, &mine)
	if len(mine.Singles) != 1 || mine.Singles[0].Title != "" {
		t.Fatalf("legacy booking: %+v", mine)
	}
	start, end := booking.Start.Add(time.Hour), booking.End.Add(time.Hour)
	var edited domain.Booking
	path := fmt.Sprintf("/api/bookings/%d", booking.ID)
	c.call("PATCH", path, EditBooking{Start: &start, End: &end}, 200, &edited)
	if edited.Title != "" || !edited.Start.Equal(start) {
		t.Fatalf("legacy edit: %+v", edited)
	}
	for _, title := range []string{"", " \t　 ", strings.Repeat("用", 201)} {
		var failure Problem
		c.call("PATCH", path, EditBooking{Title: &title}, 422, &failure)
		if failure.Code != "title_required" || len(failure.Violations) != 1 || failure.Violations[0].Code != "title_required" {
			t.Fatalf("edit: %+v", failure)
		}
	}
	var nullFailure Problem
	c.call("PATCH", path, map[string]any{"title": nil}, 422, &nullFailure)
	if nullFailure.Code != "title_required" {
		t.Fatalf("null title: %+v", nullFailure)
	}
	title := "  用途　 "
	c.call("PATCH", path, EditBooking{Title: &title}, 200, &edited)
	if edited.Title != "用途" {
		t.Fatalf("trimmed title: %q", edited.Title)
	}
	c.call("POST", path+"/cancel", Scope{}, 200, nil)
	var quick domain.Booking
	c.call("POST", "/api/rooms/9070/quick", Quick{Minutes: 30, Title: "用"}, 201, &quick)
	if _, err := c.service.db.ExecContext(context.Background(), "UPDATE bookings SET title = '' WHERE id = ?", quick.ID); err != nil {
		t.Fatal(err)
	}
	path = fmt.Sprintf("/api/bookings/%d", quick.ID)
	c.call("POST", path+"/extend", Extend{Minutes: 30}, 200, &edited)
	if edited.Title != "" {
		t.Fatalf("legacy extension: %+v", edited)
	}
	now := c.service.now().Add(10 * time.Minute)
	c.service.now = func() time.Time { return now }
	c.call("POST", path+"/end", nil, 200, &edited)
	if edited.Title != "" || edited.ReleasedMinutes != 50 {
		t.Fatalf("legacy early end: %+v", edited)
	}
}

// TestImportPeopleOptionalAdmin accepts the spec's minimal roster and explicit admin flags.
func TestImportPeopleOptionalAdmin(t *testing.T) {
	c := newTestClient(t)
	var people []domain.Person
	c.call("POST", "/api/admin/people/import", map[string]any{"people": []map[string]any{
		{"name": "教师", "role": "teacher"},
		{"name": "学生", "role": "student", "isAdmin": false},
		{"name": "管理员二", "role": "other", "isAdmin": true},
	}}, 201, &people)
	if len(people) != 3 || people[0].IsAdmin || people[1].IsAdmin || !people[2].IsAdmin {
		t.Fatalf("import: %+v", people)
	}
	var saved []domain.Person
	c.call("GET", "/api/admin/people", nil, 200, &saved)
	if len(saved) != 4 {
		t.Fatalf("saved roster: %+v", saved)
	}
}
