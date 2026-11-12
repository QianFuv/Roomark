package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"roomark/internal/domain"
	"roomark/internal/rules"
	"roomark/internal/store"
)

type testClient struct {
	testing            *testing.T
	service            *Service
	handler            http.Handler
	session, roomToken string
}

func newTestClient(t *testing.T) *testClient {
	t.Helper()
	service, err := Open(context.Background(), Config{Database: filepath.Join(t.TempDir(), "test.db"), PublicURL: "https://rooms.example.com", AdminName: "管理员", AdminPasscode: "123456"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 12, 9, 0, 0, 0, rules.Shanghai)
	service.now = func() time.Time { return now }
	t.Cleanup(func() {
		if err := service.Close(); err != nil {
			t.Error(err)
		}
	})
	client := &testClient{testing: t, service: service, handler: service.Handler()}
	var session domain.Session
	client.call("POST", "/api/sessions", Login{Name: "管理员", Passcode: "123456"}, 200, &session)
	client.session = session.Token
	var room domain.AdminRoom
	client.call("POST", "/api/admin/rooms", RoomInput{Slug: "9070", Name: "讨论室"}, 201, &room)
	client.roomToken = room.Code
	return client
}

func (c *testClient) call(method, path string, body any, status int, result any) *httptest.ResponseRecorder {
	c.testing.Helper()
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			c.testing.Fatal(err)
		}
		reader = bytes.NewReader(data)
	}
	request := httptest.NewRequest(method, path, reader)
	request.RemoteAddr = "127.0.0.1:1234"
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if c.session != "" {
		request.Header.Set("Authorization", "Bearer "+c.session)
	}
	if c.roomToken != "" {
		request.Header.Set("X-Room-Token", c.roomToken)
	}
	response := httptest.NewRecorder()
	c.handler.ServeHTTP(response, request)
	if response.Code != status {
		c.testing.Fatalf("%s %s = %d, want %d: %s", method, path, response.Code, status, response.Body.String())
	}
	if result != nil {
		if err := json.Unmarshal(response.Body.Bytes(), result); err != nil {
			c.testing.Fatalf("decode %s: %v: %s", path, err, response.Body.String())
		}
	}
	return response
}

func bookingBody(start, end string) CreateBooking {
	parse := func(clock string) time.Time {
		value, err := rules.At(time.Date(2026, 11, 13, 0, 0, 0, 0, rules.Shanghai), clock)
		if err != nil {
			panic(err)
		}
		return value
	}
	return CreateBooking{TimeRange: TimeRange{Start: parse(start), End: parse(end)}, Title: "讨论"}
}

// TestBookingHTTPFlow verifies the named behavioral regression.
func TestBookingHTTPFlow(t *testing.T) {
	c := newTestClient(t)
	var preset domain.Person
	c.call("POST", "/api/admin/people", PresetPerson{Name: "张三", Role: "student"}, 201, &preset)
	admin := c.session
	c.session = ""
	var session domain.Session
	c.call("POST", fmt.Sprintf("/api/people/%d/claim", preset.ID), Passcode{Passcode: "123456"}, 200, &session)
	c.session = session.Token
	var booking domain.Booking
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, &booking)
	var conflict Problem
	response := c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 409, &conflict)
	if conflict.Code != "booking_conflict" || conflict.Conflict == nil || len(conflict.Suggestions) != 5 || conflict.ConflictEventID == 0 || !strings.Contains(response.Header().Get("Content-Type"), "application/problem+json") {
		t.Fatalf("conflict=%s", response.Body)
	}
	suggestion := conflict.Suggestions[0]
	c.call("POST", "/api/rooms/9070/bookings", CreateBooking{TimeRange: TimeRange{Start: suggestion.Start, End: suggestion.End}, ConflictEventID: conflict.ConflictEventID, Title: "讨论"}, 201, nil)
	var preview domain.Preview
	rule := domain.SeriesRule{Freq: "weekly", Weekdays: []int{5}, StartDate: "2026-11-13", Count: 3, StartTime: "16:00", EndTime: "17:00"}
	c.call("POST", "/api/rooms/9070/series/preview", RuleInput{Rule: rule}, 200, &preview)
	if len(preview.Occurrences) != 3 || preview.Occurrences[0].Status != "ok" {
		t.Fatalf("preview=%+v", preview)
	}
	var series domain.SeriesResult
	c.call("POST", "/api/rooms/9070/series", CreateSeries{Title: "讨论", RuleInput: RuleInput{Rule: rule}, Overrides: []domain.Override{}}, 201, &series)
	if len(series.Created) != 3 {
		t.Fatalf("series=%+v", series)
	}
	c.call("POST", fmt.Sprintf("/api/bookings/%d/cancel", series.Created[1].ID), Scope{Scope: "following"}, 200, nil)
	var mine domain.MyBookings
	c.call("GET", "/api/me/bookings", nil, 200, &mine)
	if len(mine.Series) != 1 || mine.Series[0].Remaining != 1 {
		t.Fatalf("mine=%+v", mine)
	}
	c.session = admin
	var stats domain.Stats
	c.call("GET", "/api/admin/stats?room=9070&from=2026-11-12&to=2026-12-12", nil, 200, &stats)
	if stats.Overview.Bookings != 3 || stats.DemandGap.ConflictCount != 1 || stats.DemandGap.SuggestionAcceptanceRate != 1 {
		t.Fatalf("stats=%+v", stats)
	}
	csv := c.call("GET", "/api/admin/stats/export.csv?room=9070&from=2026-11-12&to=2026-12-12", nil, 200, nil)
	if !strings.Contains(csv.Body.String(), "讨论") {
		t.Fatalf("CSV=%s", csv.Body)
	}
	calendar := c.call("GET", "/ical/9070.ics?k="+c.roomToken, nil, 200, nil)
	if !strings.Contains(calendar.Body.String(), "BEGIN:VCALENDAR") || !strings.Contains(calendar.Body.String(), "STATUS:CANCELLED") {
		t.Fatalf("iCal=%s", calendar.Body)
	}
}

// TestSuggestedFromAttribution counts live-check suggestions once per original range.
func TestSuggestedFromAttribution(t *testing.T) {
	for _, testCase := range []struct {
		name      string
		bookings  int
		openEvent bool
	}{
		{name: "live check", bookings: 1},
		{name: "second slot within 24 hours", bookings: 2},
		{name: "reuse open conflict", bookings: 1, openEvent: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			c := newTestClient(t)
			origin := bookingBody("14:00", "15:00")
			c.call("POST", "/api/rooms/9070/bookings", origin, 201, nil)
			var originalEventID int64
			if testCase.openEvent {
				var failure Problem
				c.call("POST", "/api/rooms/9070/bookings", origin, 409, &failure)
				originalEventID = failure.ConflictEventID
			}
			var firstBookingID int64
			for attempt := 0; attempt < testCase.bookings; attempt++ {
				var check domain.CheckResult
				c.call("POST", "/api/rooms/9070/check", CheckRange{TimeRange: origin.TimeRange}, 200, &check)
				if check.OK || check.Conflict == nil || check.Conflict.ConflictEventID != 0 || len(check.Conflict.Suggestions) == 0 {
					t.Fatalf("live check=%+v", check)
				}
				if attempt == 0 && !testCase.openEvent {
					var stats domain.Stats
					c.call("GET", "/api/admin/stats?room=9070&from=2026-11-12&to=2026-12-12", nil, 200, &stats)
					if stats.DemandGap.ConflictCount != 0 {
						t.Fatalf("live check recorded a conflict: %+v", stats.DemandGap)
					}
				}
				suggestion := check.Conflict.Suggestions[0]
				body := CreateBooking{TimeRange: TimeRange{Start: suggestion.Start, End: suggestion.End}, Title: "Discussion", SuggestedFrom: &origin.TimeRange}
				var booking domain.Booking
				c.call("POST", "/api/rooms/9070/bookings", body, 201, &booking)
				if attempt == 0 {
					firstBookingID = booking.ID
				}
				var stats domain.Stats
				c.call("GET", "/api/admin/stats?room=9070&from=2026-11-12&to=2026-12-12", nil, 200, &stats)
				if stats.DemandGap.ConflictCount != 1 || stats.DemandGap.SuggestionAcceptanceRate != 1 {
					t.Fatalf("attempt %d demand gap=%+v", attempt, stats.DemandGap)
				}
			}
			events, err := store.New(c.service.db).ListConflictEvents(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if len(events) != 1 || events[0].Source != "single" || events[0].RequestedStart != origin.Start.Unix() || events[0].RequestedEnd != origin.End.Unix() || !events[0].AcceptedBookingID.Valid || events[0].AcceptedBookingID.Int64 != firstBookingID || originalEventID != 0 && events[0].ID != originalEventID {
				t.Fatalf("events=%+v", events)
			}
		})
	}
}

// TestSuggestedFromIgnored preserves bookings when the origin does not explain the slot.
func TestSuggestedFromIgnored(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		conflict bool
		start    string
		end      string
	}{
		{name: "slot is not a suggestion", conflict: true, start: "16:00", end: "17:00"},
		{name: "origin is not conflicting", start: "13:00", end: "14:00"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			c := newTestClient(t)
			origin := bookingBody("14:00", "15:00")
			if testCase.conflict {
				c.call("POST", "/api/rooms/9070/bookings", origin, 201, nil)
			}
			body := bookingBody(testCase.start, testCase.end)
			body.SuggestedFrom = &origin.TimeRange
			c.call("POST", "/api/rooms/9070/bookings", body, 201, nil)
			var stats domain.Stats
			c.call("GET", "/api/admin/stats?room=9070&from=2026-11-12&to=2026-12-12", nil, 200, &stats)
			if stats.DemandGap.ConflictCount != 0 || stats.DemandGap.SuggestionAcceptanceRate != 0 {
				t.Fatalf("demand gap=%+v", stats.DemandGap)
			}
		})
	}
}

// TestSuggestedFromInvalidRange rejects invalid origins without creating a booking.
func TestSuggestedFromInvalidRange(t *testing.T) {
	for _, testCase := range []struct {
		name       string
		rangeValue TimeRange
	}{
		{name: "equal endpoints", rangeValue: bookingBody("14:00", "14:00").TimeRange},
		{name: "end before start", rangeValue: bookingBody("15:00", "14:00").TimeRange},
		{name: "different local days", rangeValue: TimeRange{Start: bookingBody("14:00", "15:00").Start, End: bookingBody("14:00", "15:00").End.AddDate(0, 0, 1)}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			c := newTestClient(t)
			body := bookingBody("16:00", "17:00")
			body.SuggestedFrom = &testCase.rangeValue
			var failure Problem
			c.call("POST", "/api/rooms/9070/bookings", body, 422, &failure)
			if failure.Code != "invalid_range" {
				t.Fatalf("failure=%+v", failure)
			}
			var stats domain.Stats
			c.call("GET", "/api/admin/stats?room=9070&from=2026-11-12&to=2026-12-12", nil, 200, &stats)
			if stats.Overview.Bookings != 0 || stats.DemandGap.ConflictCount != 0 {
				t.Fatalf("invalid origin persisted data: %+v", stats)
			}
		})
	}
}

// TestConflictEventTakesPrecedence ignores suggestedFrom when an event ID is provided.
func TestConflictEventTakesPrecedence(t *testing.T) {
	c := newTestClient(t)
	origin := bookingBody("14:00", "15:00")
	c.call("POST", "/api/rooms/9070/bookings", origin, 201, nil)
	var failure Problem
	c.call("POST", "/api/rooms/9070/bookings", origin, 409, &failure)
	suggestion := failure.Suggestions[0]
	invalidOrigin := bookingBody("15:00", "14:00").TimeRange
	body := CreateBooking{TimeRange: TimeRange{Start: suggestion.Start, End: suggestion.End}, Title: "Discussion", ConflictEventID: failure.ConflictEventID, SuggestedFrom: &invalidOrigin}
	c.call("POST", "/api/rooms/9070/bookings", body, 201, nil)
	var stats domain.Stats
	c.call("GET", "/api/admin/stats?room=9070&from=2026-11-12&to=2026-12-12", nil, 200, &stats)
	if stats.DemandGap.ConflictCount != 1 || stats.DemandGap.SuggestionAcceptanceRate != 1 {
		t.Fatalf("demand gap=%+v", stats.DemandGap)
	}
}

// TestAuthorizationLockoutAndRevocation verifies the named behavioral regression.
func TestAuthorizationLockoutAndRevocation(t *testing.T) {
	c := newTestClient(t)
	admin := c.session
	c.session = ""
	savedToken := c.roomToken
	c.roomToken = ""
	c.call("GET", "/api/rooms/9070", nil, 403, nil)
	c.roomToken = "wrong"
	c.call("GET", "/api/rooms/9070", nil, 403, nil)
	c.roomToken = savedToken
	var first domain.Session
	c.call("POST", "/api/people", SelfPerson{Passcode: Passcode{Passcode: "123456"}, Name: "李四"}, 201, &first)
	for attempt := 0; attempt < 5; attempt++ {
		expected := 401
		if attempt == 4 {
			expected = 423
		}
		c.call("POST", "/api/sessions", Login{PersonID: first.Person.ID, Passcode: "000000"}, expected, nil)
	}
	c.call("POST", "/api/sessions", Login{PersonID: first.Person.ID, Passcode: "123456"}, 423, nil)
	now := c.service.now().Add(16 * time.Minute)
	c.service.now = func() time.Time { return now }
	var second domain.Session
	c.call("POST", "/api/sessions", Login{PersonID: first.Person.ID, Passcode: "123456"}, 200, &second)
	c.session = admin
	c.call("POST", fmt.Sprintf("/api/admin/people/%d/reset-passcode", first.Person.ID), nil, 200, nil)
	c.session = second.Token
	c.call("GET", "/api/me", nil, 401, nil)
	c.session = ""
	c.call("POST", "/api/sessions", Login{PersonID: first.Person.ID, Passcode: "123456"}, 409, nil)
	c.session = admin
	c.call("POST", "/api/admin/rooms/1/rotate-token", nil, 404, nil)
	c.session = ""
	c.call("GET", "/api/rooms/9070", nil, 200, nil)
}

// TestConcurrentBookingIsAtomic verifies the named behavioral regression.
func TestConcurrentBookingIsAtomic(t *testing.T) {
	c := newTestClient(t)
	body, err := json.Marshal(bookingBody("10:00", "11:00"))
	if err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	statuses := make(chan int, 2)
	for range 2 {
		group.Go(func() {
			request := httptest.NewRequest("POST", "/api/rooms/9070/bookings", bytes.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Authorization", "Bearer "+c.session)
			response := httptest.NewRecorder()
			c.handler.ServeHTTP(response, request)
			statuses <- response.Code
		})
	}
	group.Wait()
	close(statuses)
	counts := map[int]int{}
	for status := range statuses {
		counts[status]++
	}
	if counts[201] != 1 || counts[409] != 1 {
		t.Fatalf("statuses=%v", counts)
	}
}

// TestSeriesChangedPreviewAndOverrides verifies the named behavioral regression.
func TestSeriesChangedPreviewAndOverrides(t *testing.T) {
	c := newTestClient(t)
	rule := domain.SeriesRule{Freq: "weekly", Weekdays: []int{5}, StartDate: "2026-11-13", Count: 3, StartTime: "14:00", EndTime: "15:00"}
	c.call("POST", "/api/rooms/9070/series/preview", RuleInput{Rule: rule}, 200, nil)
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, nil)
	body := CreateSeries{Title: "讨论", RuleInput: RuleInput{Rule: rule}, Overrides: []domain.Override{}}
	var fresh Problem
	c.call("POST", "/api/rooms/9070/series", body, 409, &fresh)
	if fresh.Code != "preview_changed" || fresh.Occurrences[0].Status != "conflict" {
		t.Fatalf("fresh=%+v", fresh)
	}
	move := bookingBody("16:00", "17:00")
	body.Overrides = []domain.Override{{Date: "2026-11-13", Action: "move", Start: &move.Start, End: &move.End}, {Date: "2026-11-20", Action: "skip"}}
	var created domain.SeriesResult
	c.call("POST", "/api/rooms/9070/series", body, 201, &created)
	if len(created.Created) != 2 || len(created.Skipped) != 1 || created.Created[0].Start.Hour() != 16 {
		t.Fatalf("result=%+v", created)
	}
}

// TestCORSAndCheckDoesNotWrite verifies the named behavioral regression.
func TestCORSAndCheckDoesNotWrite(t *testing.T) {
	c := newTestClient(t)
	for _, origin := range []string{"http://wails.localhost", "https://wails.localhost", "https://untrusted.example"} {
		request := httptest.NewRequest("OPTIONS", "/api/rooms/9070", nil)
		request.Header.Set("Origin", origin)
		request.Header.Set("Access-Control-Request-Method", "GET")
		request.Header.Set("Access-Control-Request-Headers", "authorization,x-room-token")
		response := httptest.NewRecorder()
		c.handler.ServeHTTP(response, request)
		allowed := response.Header().Get("Access-Control-Allow-Origin")
		if origin == "https://untrusted.example" && allowed != "" || origin != "https://untrusted.example" && allowed != origin {
			t.Fatalf("CORS %s=%q", origin, allowed)
		}
	}
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, nil)
	c.session = ""
	var check domain.CheckResult
	c.call("POST", "/api/rooms/9070/check", bookingBody("14:00", "15:00").TimeRange, 200, &check)
	if check.OK || check.Conflict == nil || check.Conflict.ConflictEventID != 0 {
		t.Fatalf("check=%+v", check)
	}
}

// TestQuickExtendEndAndFollowingEdit exercises the complete mutation routes.
func TestQuickExtendEndAndFollowingEdit(t *testing.T) {
	c := newTestClient(t)
	var quick domain.Booking
	c.call("POST", "/api/rooms/9070/quick", map[string]any{"minutes": 30, "title": "讨论"}, 201, &quick)
	var extended domain.Booking
	c.call("POST", fmt.Sprintf("/api/bookings/%d/extend", quick.ID), Extend{Minutes: 30}, 200, &extended)
	if extended.End.Sub(quick.End) != 30*time.Minute {
		t.Fatalf("extension=%+v", extended)
	}
	c.call("POST", fmt.Sprintf("/api/bookings/%d/cancel", quick.ID), Scope{}, 422, nil)
	now := c.service.now().Add(10 * time.Minute)
	c.service.now = func() time.Time { return now }
	var ended domain.Booking
	c.call("POST", fmt.Sprintf("/api/bookings/%d/end", quick.ID), nil, 200, &ended)
	if ended.ReleasedMinutes != 50 || !ended.PlannedEnd.Equal(extended.End) {
		t.Fatalf("ended=%+v", ended)
	}
	rule := domain.SeriesRule{Freq: "weekly", Weekdays: []int{5}, StartDate: "2026-11-13", Count: 3, StartTime: "14:00", EndTime: "15:00"}
	c.call("POST", "/api/rooms/9070/series/preview", RuleInput{Rule: rule}, 200, nil)
	var series domain.SeriesResult
	c.call("POST", "/api/rooms/9070/series", CreateSeries{Title: "讨论", RuleInput: RuleInput{Rule: rule}, Overrides: []domain.Override{}}, 201, &series)
	start, end := series.Created[1].Start.Add(time.Hour), series.Created[1].End.Add(time.Hour)
	c.call("PATCH", fmt.Sprintf("/api/bookings/%d", series.Created[1].ID), EditBooking{Start: &start, End: &end, Scope: "following"}, 200, nil)
	var mine domain.MyBookings
	c.call("GET", "/api/me/bookings", nil, 200, &mine)
	if len(mine.Series) != 1 || mine.Series[0].Occurrences[0].Start.Hour() != 14 || mine.Series[0].Occurrences[1].Start.Hour() != 15 || mine.Series[0].Occurrences[2].Start.Hour() != 15 {
		t.Fatalf("following edit=%+v", mine)
	}
}

// TestActiveLimitCountsSeriesOnce checks active limits across concrete occurrences.
func TestActiveLimitCountsSeriesOnce(t *testing.T) {
	c := newTestClient(t)
	limits := domain.DefaultRules()
	limits.MaxActivePerPerson = 1
	c.call("PATCH", "/api/admin/rooms/1", EditRoom{Rules: &limits}, 200, nil)
	rule := domain.SeriesRule{Freq: "weekly", Weekdays: []int{5}, StartDate: "2026-11-13", Count: 3, StartTime: "14:00", EndTime: "15:00"}
	c.call("POST", "/api/rooms/9070/series/preview", RuleInput{Rule: rule}, 200, nil)
	var series domain.SeriesResult
	c.call("POST", "/api/rooms/9070/series", CreateSeries{Title: "讨论", RuleInput: RuleInput{Rule: rule}, Overrides: []domain.Override{}}, 201, &series)
	var failure Problem
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("16:00", "17:00"), 422, &failure)
	if failure.Code != "too_many_active" {
		t.Fatalf("failure=%+v", failure)
	}
	c.call("POST", fmt.Sprintf("/api/bookings/%d/cancel", series.Created[0].ID), Scope{Scope: "following"}, 200, nil)
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("16:00", "17:00"), 201, nil)
}

// TestSeriesPreviewConflictsAreSkipped checks conflict attribution and default skips.
func TestSeriesPreviewConflictsAreSkipped(t *testing.T) {
	c := newTestClient(t)
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, nil)
	rule := domain.SeriesRule{Freq: "weekly", Weekdays: []int{5}, StartDate: "2026-11-13", Count: 3, StartTime: "14:00", EndTime: "15:00"}
	var preview domain.Preview
	c.call("POST", "/api/rooms/9070/series/preview", RuleInput{Rule: rule}, 200, &preview)
	if preview.Occurrences[0].Conflict == nil || preview.Occurrences[0].Conflict.ConflictEventID == 0 {
		t.Fatalf("conflict=%+v", preview)
	}
	var created domain.SeriesResult
	c.call("POST", "/api/rooms/9070/series", CreateSeries{Title: "讨论", RuleInput: RuleInput{Rule: rule}, Overrides: []domain.Override{}}, 201, &created)
	if len(created.Created) != 2 || len(created.Skipped) != 1 || created.Skipped[0] != "2026-11-13" {
		t.Fatalf("result=%+v", created)
	}
}

// TestRepeatedPreviewReusesConflictEvent keeps demand-gap counts from inflating when a rule is previewed again.
func TestRepeatedPreviewReusesConflictEvent(t *testing.T) {
	c := newTestClient(t)
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, nil)
	rule := domain.SeriesRule{Freq: "weekly", Weekdays: []int{5}, StartDate: "2026-11-13", Count: 3, StartTime: "14:00", EndTime: "15:00"}
	var first, second domain.Preview
	c.call("POST", "/api/rooms/9070/series/preview", RuleInput{Rule: rule}, 200, &first)
	c.call("POST", "/api/rooms/9070/series/preview", RuleInput{Rule: rule}, 200, &second)
	if first.Occurrences[0].Conflict == nil || second.Occurrences[0].Conflict == nil || first.Occurrences[0].Conflict.ConflictEventID != second.Occurrences[0].Conflict.ConflictEventID {
		t.Fatalf("first=%+v second=%+v", first.Occurrences[0], second.Occurrences[0])
	}
}

// TestIPRateLimitAndOwnership verifies request throttling and owner authorization.
func TestIPRateLimitAndOwnership(t *testing.T) {
	c := newTestClient(t)
	var booking domain.Booking
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, &booking)
	c.session = ""
	var other domain.Session
	c.call("POST", "/api/people", SelfPerson{Passcode: Passcode{Passcode: "123456"}, Name: "其他人"}, 201, &other)
	c.session = other.Token
	c.call("POST", fmt.Sprintf("/api/bookings/%d/cancel", booking.ID), Scope{}, 403, nil)
	c.session = ""
	for range 8 {
		c.call("POST", "/api/sessions", Login{Name: "不存在", Passcode: "123456"}, 401, nil)
	}
	c.call("POST", "/api/sessions", Login{Name: "不存在", Passcode: "123456"}, 429, nil)
}

// TestCheckExcludesEditedBooking lets the edit form check a new time without colliding with the booking's own slot.
func TestCheckExcludesEditedBooking(t *testing.T) {
	c := newTestClient(t)
	var own domain.Booking
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, &own)
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("15:30", "16:30"), 201, nil)
	moved := bookingBody("14:30", "15:30").TimeRange
	var plain, excluded domain.CheckResult
	c.call("POST", "/api/rooms/9070/check", moved, 200, &plain)
	c.call("POST", "/api/rooms/9070/check", CheckRange{TimeRange: moved, ExcludeBookingID: own.ID}, 200, &excluded)
	if plain.OK || !excluded.OK {
		t.Fatalf("plain=%+v excluded=%+v", plain, excluded)
	}
	overlapping := bookingBody("14:30", "16:00").TimeRange
	var other domain.CheckResult
	c.call("POST", "/api/rooms/9070/check", CheckRange{TimeRange: overlapping, ExcludeBookingID: own.ID}, 200, &other)
	if other.OK || other.Conflict == nil || other.Conflict.ConflictWith.Start.Hour() != 15 {
		t.Fatalf("must still report the other booking: %+v", other)
	}
}

// TestOwnerManagesBookingWithoutRoomToken lets people manage their bookings from a device that never scanned the room code.
func TestOwnerManagesBookingWithoutRoomToken(t *testing.T) {
	c := newTestClient(t)
	c.session = ""
	var owner domain.Session
	c.call("POST", "/api/people", SelfPerson{Passcode: Passcode{Passcode: "123456"}, Name: "预约人"}, 201, &owner)
	c.session = owner.Token
	var booking domain.Booking
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, &booking)
	c.roomToken = ""
	c.call("POST", fmt.Sprintf("/api/bookings/%d/cancel", booking.ID), Scope{}, 200, nil)
}

// TestClientIPTrustsOnlyConfiguredProxies keeps per-client throttling behind a reverse proxy without letting direct clients spoof X-Real-IP.
func TestClientIPTrustsOnlyConfiguredProxies(t *testing.T) {
	proxies, err := ParseTrustedProxies("172.20.0.0/16, 10.0.0.5")
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{config: Config{TrustedProxies: proxies}}
	cases := []struct {
		name, remote, realIP, want string
	}{
		{"trusted network", "172.20.0.4:5123", "203.0.113.7", "203.0.113.7"},
		{"trusted single address", "10.0.0.5:80", "198.51.100.2", "198.51.100.2"},
		{"untrusted peer spoofing", "203.0.113.9:4000", "1.2.3.4", "203.0.113.9"},
		{"trusted peer without header", "172.20.0.4:5123", "", "172.20.0.4"},
		{"trusted peer with garbage header", "172.20.0.4:5123", "not-an-ip", "172.20.0.4"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest("GET", "/api/me", nil)
			request.RemoteAddr = testCase.remote
			if testCase.realIP != "" {
				request.Header.Set("X-Real-IP", testCase.realIP)
			}
			if got := service.clientIP(request); got != testCase.want {
				t.Fatalf("clientIP=%q want %q", got, testCase.want)
			}
		})
	}
	if _, err := ParseTrustedProxies("172.20.0.0/99"); err == nil {
		t.Fatal("invalid prefix must fail")
	}
}

// TestSeriesOverrideConflictReturnsOccurrences verifies the recurring conflict envelope.
func TestSeriesOverrideConflictReturnsOccurrences(t *testing.T) {
	c := newTestClient(t)
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("16:00", "17:00"), 201, nil)
	rule := domain.SeriesRule{Freq: "weekly", Weekdays: []int{5}, StartDate: "2026-11-13", Count: 3, StartTime: "14:00", EndTime: "15:00"}
	c.call("POST", "/api/rooms/9070/series/preview", RuleInput{Rule: rule}, 200, nil)
	move := bookingBody("16:00", "17:00")
	var failure Problem
	c.call("POST", "/api/rooms/9070/series", CreateSeries{Title: "讨论", RuleInput: RuleInput{Rule: rule}, Overrides: []domain.Override{{Date: "2026-11-13", Action: "move", Start: &move.Start, End: &move.End}}}, 409, &failure)
	if len(failure.Occurrences) != 3 || failure.Occurrences[0].Status != "conflict" || failure.Occurrences[0].Conflict == nil || failure.Occurrences[0].Conflict.ConflictEventID == 0 {
		t.Fatalf("recurring conflict must include fresh occurrences: %+v", failure)
	}
}

// TestPersonalFeedWithoutPublicURL verifies subscriptions with optional server configuration.
func TestPersonalFeedWithoutPublicURL(t *testing.T) {
	c := newTestClient(t)
	c.service.config.PublicURL = ""
	var feed Feed
	c.call("GET", "/api/me/feeds", nil, 200, &feed)
	if !strings.HasPrefix(feed.PersonFeedURL, "http://example.com/ical/person/") {
		t.Fatalf("personal subscription must be absolute: %s", feed.PersonFeedURL)
	}
}

// TestAdminCanCancelArchivedRoomBooking preserves administrative booking control.
func TestAdminCanCancelArchivedRoomBooking(t *testing.T) {
	c := newTestClient(t)
	var booking domain.Booking
	c.call("POST", "/api/rooms/9070/bookings", bookingBody("14:00", "15:00"), 201, &booking)
	archived := true
	c.call("PATCH", "/api/admin/rooms/1", EditRoom{Archived: &archived}, 200, nil)
	c.call("POST", fmt.Sprintf("/api/bookings/%d/cancel", booking.ID), Scope{}, 200, nil)
	c.session = ""
	c.call("GET", "/api/rooms/9070", nil, 403, nil)
}
