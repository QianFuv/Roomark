package api

import (
	"context"
	"net/url"
	"reflect"
	"testing"
	"time"

	"roomark/apps/roomark/internal/domain"
	"roomark/apps/roomark/internal/rules"
)

// TestRoomHeatmapWeekRange verifies Monday-first weeks and Shanghai default dates.
func TestRoomHeatmapWeekRange(t *testing.T) {
	c := newTestClient(t)
	c.session = ""
	for _, testCase := range []struct {
		name, week, start string
		now               time.Time
	}{
		{name: "current week", start: "2026-11-09"},
		{name: "Sunday", week: "2026-11-15", start: "2026-11-09"},
		{name: "Monday", week: "2026-11-16", start: "2026-11-16"},
		{name: "year boundary", week: "2027-01-03", start: "2026-12-28"},
		{name: "Shanghai Monday", start: "2026-11-16", now: time.Date(2026, 11, 15, 16, 15, 0, 0, time.UTC)},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			c.testing = t
			if !testCase.now.IsZero() {
				c.service.now = func() time.Time { return testCase.now }
			}
			var result struct {
				WeekStart string      `json:"weekStart"`
				Days      []string    `json:"days"`
				Hours     []int       `json:"hours"`
				Cells     [][]float64 `json:"cells"`
			}
			c.call("GET", "/api/rooms/9070/heatmap?week="+testCase.week, nil, 200, &result)
			if result.WeekStart != testCase.start || len(result.Days) != 7 || len(result.Cells) != 7 {
				t.Fatalf("week shape=%+v", result)
			}
			start, err := time.ParseInLocation("2006-01-02", testCase.start, rules.Shanghai)
			if err != nil {
				t.Fatal(err)
			}
			for day := range 7 {
				if result.Days[day] != start.AddDate(0, 0, day).Format("2006-01-02") || len(result.Cells[day]) != len(result.Hours) {
					t.Fatalf("day %d: %+v", day, result)
				}
			}
			if !reflect.DeepEqual(result.Hours, []int{8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21}) {
				t.Fatalf("hours=%v", result.Hours)
			}
		})
	}
}

// TestRoomHeatmapOccupancy counts confirmed bookings and blocks within open clock hours.
func TestRoomHeatmapOccupancy(t *testing.T) {
	c := newTestClient(t)
	limits := domain.DefaultRules()
	limits.OpenTime, limits.CloseTime = "06:30", "18:15"
	var room domain.AdminRoom
	c.call("PATCH", "/api/admin/rooms/1", EditRoom{Rules: &limits}, 200, &room)
	var other domain.AdminRoom
	c.call("POST", "/api/admin/rooms", RoomInput{Slug: "other", Name: "Other room"}, 201, &other)
	for _, booking := range []struct {
		date, start, end, kind, status string
		roomID                         int64
	}{
		{"2026-11-09", "06:00", "07:15", "normal", "confirmed", room.ID},
		{"2026-11-09", "08:15", "09:45", "block", "confirmed", room.ID},
		{"2026-11-09", "10:00", "11:00", "normal", "cancelled", room.ID},
		{"2026-11-09", "11:00", "12:00", "block", "cancelled", room.ID},
		{"2026-11-09", "15:00", "16:00", "normal", "confirmed", room.ID},
		{"2026-11-09", "15:15", "16:00", "block", "confirmed", room.ID},
		{"2026-11-09", "17:45", "19:00", "block", "confirmed", room.ID},
		{"2026-11-13", "12:00", "13:00", "normal", "confirmed", room.ID},
		{"2026-11-15", "17:00", "18:00", "normal", "confirmed", room.ID},
		{"2026-11-08", "12:00", "13:00", "normal", "confirmed", room.ID},
		{"2026-11-16", "12:00", "13:00", "normal", "confirmed", room.ID},
		{"2026-11-09", "14:00", "15:00", "normal", "confirmed", other.ID},
	} {
		start, err := time.ParseInLocation("2006-01-02 15:04", booking.date+" "+booking.start, rules.Shanghai)
		if err != nil {
			t.Fatal(err)
		}
		end, err := time.ParseInLocation("2006-01-02 15:04", booking.date+" "+booking.end, rules.Shanghai)
		if err != nil {
			t.Fatal(err)
		}
		_, err = c.service.db.ExecContext(context.Background(), `INSERT INTO bookings
			(room_id, kind, status, start_at, end_at, planned_end_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, booking.roomID, booking.kind, booking.status, start.Unix(), end.Unix(), end.Unix(), start.Unix(), start.Unix())
		if err != nil {
			t.Fatal(err)
		}
	}
	c.session = ""
	var result struct {
		Hours []int       `json:"hours"`
		Cells [][]float64 `json:"cells"`
	}
	c.call("GET", "/api/rooms/9070/heatmap?week=2026-11-15", nil, 200, &result)
	if !reflect.DeepEqual(result.Hours, []int{6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18}) || len(result.Cells) != 7 {
		t.Fatalf("shape=%+v", result)
	}
	want := map[[2]int]float64{{0, 6}: 0.5, {0, 7}: 0.25, {0, 8}: 0.75, {0, 9}: 0.75, {0, 15}: 1, {0, 17}: 0.25, {0, 18}: 0.25, {4, 12}: 1, {6, 17}: 1}
	for day, row := range result.Cells {
		if len(row) != len(result.Hours) {
			t.Fatalf("day %d: %v", day, row)
		}
		for column, value := range row {
			hour := result.Hours[column]
			if value != want[[2]int{day, hour}] {
				t.Errorf("day %d hour %d=%v, want %v", day, hour, value, want[[2]int{day, hour}])
			}
		}
	}
}

// TestRoomHeatmapOpenHours includes the final partial hour and excludes an exact closing hour.
func TestRoomHeatmapOpenHours(t *testing.T) {
	c := newTestClient(t)
	for _, testCase := range []struct {
		open, close string
		hours       []int
	}{
		{"08:00", "22:00", []int{8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21}},
		{"08:30", "21:15", []int{8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21}},
		{"23:15", "23:45", []int{23}},
	} {
		t.Run(testCase.open+"-"+testCase.close, func(t *testing.T) {
			c.testing = t
			limits := domain.DefaultRules()
			limits.OpenTime, limits.CloseTime = testCase.open, testCase.close
			c.call("PATCH", "/api/admin/rooms/1", EditRoom{Rules: &limits}, 200, nil)
			var result struct {
				Hours []int `json:"hours"`
			}
			c.call("GET", "/api/rooms/9070/heatmap", nil, 200, &result)
			if !reflect.DeepEqual(result.Hours, testCase.hours) {
				t.Fatalf("hours=%v, want %v", result.Hours, testCase.hours)
			}
		})
	}
}

// TestRoomHeatmapValidationAndAccess preserves room-token and admin access and rejects invalid dates.
func TestRoomHeatmapValidationAndAccess(t *testing.T) {
	c := newTestClient(t)
	admin, token := c.session, c.roomToken
	c.roomToken = ""
	c.call("GET", "/api/rooms/9070/heatmap", nil, 200, nil)
	c.session = ""
	c.call("GET", "/api/rooms/9070/heatmap", nil, 403, nil)
	c.roomToken = "wrong"
	c.call("GET", "/api/rooms/9070/heatmap", nil, 403, nil)
	c.roomToken = token
	c.call("GET", "/api/rooms/9070/heatmap", nil, 200, nil)
	for _, week := range []string{"bad", "2026-02-30", "2026-13-01", "2026-11-1", "2026-11-15T00:00:00Z", " 2026-11-15"} {
		c.call("GET", "/api/rooms/9070/heatmap?week="+url.QueryEscape(week), nil, 422, nil)
	}
	c.session = admin
	archived := true
	c.call("PATCH", "/api/admin/rooms/1", EditRoom{Archived: &archived}, 200, nil)
	c.call("GET", "/api/rooms/9070/heatmap", nil, 200, nil)
	c.session = ""
	c.call("GET", "/api/rooms/9070/heatmap", nil, 403, nil)
}
