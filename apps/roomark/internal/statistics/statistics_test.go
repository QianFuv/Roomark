package statistics

import (
	"database/sql"
	"math"
	"testing"
	"time"

	"roomark/apps/roomark/internal/rules"
	"roomark/apps/roomark/internal/store"
)

func at(value string) time.Time {
	parsed, err := time.ParseInLocation("2006-01-02 15:04", value, rules.Shanghai)
	if err != nil {
		panic(err)
	}
	return parsed
}
func optional(value int64) sql.NullInt64 { return sql.NullInt64{Int64: value, Valid: true} }

// TestActualUsageAndCancellationMetrics verifies the named behavioral regression.
func TestActualUsageAndCancellationMetrics(t *testing.T) {
	from := at("2026-11-09 00:00")
	input := Input{From: from, To: from.AddDate(0, 0, 1), Now: at("2026-11-09 12:00"), Rooms: []store.Room{{ID: 1, Slug: "9070", OpenTime: "08:00", CloseTime: "22:00"}}, People: []store.Person{{ID: 1, Name: "已删除", Role: "student", DeletedAt: optional(from.Unix())}}}
	input.Bookings = []store.Booking{
		{ID: 1, RoomID: 1, PersonID: optional(1), Kind: "normal", Status: "confirmed", StartAt: at("2026-11-09 08:00").Unix(), EndAt: at("2026-11-09 09:00").Unix(), PlannedEndAt: at("2026-11-09 10:00").Unix(), CreatedAt: at("2026-11-08 12:00").Unix()},
		{ID: 2, RoomID: 1, PersonID: optional(1), Kind: "normal", Status: "cancelled", StartAt: at("2026-11-09 10:00").Unix(), EndAt: at("2026-11-09 11:00").Unix(), PlannedEndAt: at("2026-11-09 11:00").Unix(), CancelledAt: optional(at("2026-11-09 09:30").Unix())},
		{ID: 3, RoomID: 1, PersonID: optional(1), Kind: "normal", Status: "confirmed", StartAt: at("2026-11-09 14:00").Unix(), EndAt: at("2026-11-09 15:00").Unix(), PlannedEndAt: at("2026-11-09 15:00").Unix(), CreatedAt: from.Unix()},
		{ID: 4, RoomID: 1, Kind: "block", Status: "confirmed", StartAt: at("2026-11-09 11:00").Unix(), EndAt: at("2026-11-09 12:00").Unix(), PlannedEndAt: at("2026-11-09 12:00").Unix()},
	}
	input.Conflicts = []store.ConflictEvent{{ID: 1, RoomID: 1, PersonID: optional(1), RequestedStart: at("2026-11-09 08:15").Unix(), RequestedEnd: at("2026-11-09 09:15").Unix(), AcceptedBookingID: optional(3)}, {ID: 2, RoomID: 1, PersonID: optional(1), RequestedStart: at("2026-11-09 08:00").Unix(), RequestedEnd: at("2026-11-09 09:00").Unix()}}
	result := Calculate(input)
	if result.Overview.Bookings != 2 || result.Overview.UsedHours != 1 || result.Overview.DistinctPeople != 1 || math.Abs(result.Overview.Utilization-0.25) > 1e-9 {
		t.Fatalf("overview=%+v", result.Overview)
	}
	if result.Cancellations.CancelRate != 1.0/3 || result.Cancellations.LastMinuteRate != 1 || result.Cancellations.EarlyEndCount != 1 || result.Cancellations.AverageReleasedMinutes != 60 {
		t.Fatalf("cancellations=%+v", result.Cancellations)
	}
	if result.DemandGap.ConflictCount != 2 || result.DemandGap.SuggestionAcceptanceRate != 0.5 || result.DemandGap.TopSlots[0].Hour != 8 || result.DemandGap.TopSlots[0].Count != 2 {
		t.Fatalf("demand=%+v", result.DemandGap)
	}
	if len(result.PeopleRanking.ByUsedHours) != 1 || result.PeopleRanking.ByUsedHours[0].Person.Name != "已删除" {
		t.Fatalf("ranking=%+v", result.PeopleRanking)
	}
	if result.Heatmap[0][0] != 1 || result.Heatmap[0][1] != 0 || result.Heatmap[0][3] != 0 {
		t.Fatalf("heatmap=%v", result.Heatmap[0])
	}
	public := Heatmap(input, true)
	if public[0][3] != 1 {
		t.Fatalf("blocks must occupy public heatmap: %v", public[0])
	}
	input.Role = "teacher"
	filtered := Calculate(input)
	if filtered.Overview.UsedHours != 0 || filtered.DemandGap.ConflictCount != 0 {
		t.Fatal("role filter must apply to usage and conflicts")
	}
}

// TestUtilizationExcludesFutureOpenHours keeps an in-progress period comparable with a finished one.
func TestUtilizationExcludesFutureOpenHours(t *testing.T) {
	from := at("2026-11-09 00:00")
	input := Input{From: from, To: from.AddDate(0, 0, 7), Now: at("2026-11-09 22:00"), Rooms: []store.Room{{ID: 1, Slug: "9070", OpenTime: "08:00", CloseTime: "22:00"}}}
	input.Bookings = []store.Booking{{ID: 1, RoomID: 1, Kind: "normal", Status: "confirmed", StartAt: at("2026-11-09 08:00").Unix(), EndAt: at("2026-11-09 15:00").Unix(), PlannedEndAt: at("2026-11-09 15:00").Unix()}}
	result := Calculate(input)
	if math.Abs(result.Overview.Utilization-0.5) > 1e-9 {
		t.Fatalf("utilization=%v", result.Overview.Utilization)
	}
	if result.Trend[1].Utilization != 0 {
		t.Fatalf("future trend point=%+v", result.Trend[1])
	}
}

// TestHeatmapUsesExposedHoursAndClipsPartialOverlap verifies the named behavioral regression.
func TestHeatmapUsesExposedHoursAndClipsPartialOverlap(t *testing.T) {
	from := at("2026-11-02 00:00")
	input := Input{From: from, To: from.AddDate(0, 0, 14), Now: from.AddDate(0, 0, 14), Rooms: []store.Room{{ID: 1, Slug: "9070", OpenTime: "08:30", CloseTime: "22:00"}}, Bookings: []store.Booking{{RoomID: 1, Kind: "normal", Status: "confirmed", StartAt: at("2026-11-02 08:30").Unix(), EndAt: at("2026-11-02 09:30").Unix()}}}
	heatmap := Heatmap(input, false)
	if heatmap[0][0] != 0.5 || heatmap[0][1] != 0.25 {
		t.Fatalf("partial windows=%v", heatmap[0])
	}
}
