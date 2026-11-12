package rules

import (
	"roomark/internal/domain"
	"testing"
	"time"
)

// TestQuickRange checks current-minute starts and both upper bounds.
func TestQuickRange(t *testing.T) {
	for _, test := range []struct{ name, now, next, want string }{
		{"current minute", "2026-11-12 10:07", "", "2026-11-12 12:07"},
		{"next booking", "2026-11-12 10:07", "2026-11-12 10:30", "2026-11-12 10:30"},
		{"closing time", "2026-11-12 21:07", "", "2026-11-12 22:00"},
	} {
		t.Run(test.name, func(t *testing.T) {
			bookings := []domain.Booking{}
			if test.next != "" {
				bookings = append(bookings, domain.Booking{Start: localTime(test.next), End: localTime(test.next).Add(time.Hour), Status: "confirmed"})
			}
			start, end, err := QuickRange(localTime(test.now), 120, domain.DefaultRules(), bookings)
			if err != nil || !start.Equal(localTime(test.now)) || !end.Equal(localTime(test.want)) {
				t.Fatalf("%s–%s error=%v", start, end, err)
			}
		})
	}
}

// TestOngoingActions checks state boundaries and released time.
func TestOngoingActions(t *testing.T) {
	start, end := localTime("2026-11-12 10:00"), localTime("2026-11-12 11:00")
	for _, test := range []struct {
		now   string
		valid bool
	}{
		{"2026-11-12 09:59", false}, {"2026-11-12 10:00", true}, {"2026-11-12 10:30", true}, {"2026-11-12 11:00", false},
	} {
		t.Run(test.now, func(t *testing.T) {
			now := localTime(test.now)
			finished, released, violations := EarlyEnd(start, end, now)
			if (len(violations) == 0) != test.valid {
				t.Fatalf("violations=%v", violations)
			}
			if test.valid && (!finished.Equal(now) || released != int(end.Sub(now)/time.Minute)) {
				t.Fatalf("finished=%v released=%d", finished, released)
			}
			extended, violations := ExtendEnd(start, end, now, 30)
			if (len(violations) == 0) != test.valid || test.valid && !extended.Equal(end.Add(30*time.Minute)) {
				t.Fatalf("end=%v violations=%v", extended, violations)
			}
		})
	}
}

// TestShiftRange preserves each following occurrence's date and relative changes.
func TestShiftRange(t *testing.T) {
	baseStart, baseEnd := localTime("2026-11-12 14:00"), localTime("2026-11-12 15:00")
	newStart, newEnd := baseStart.Add(time.Hour), baseEnd.Add(2*time.Hour)
	start, end := ShiftRange(baseStart, baseEnd, baseStart.AddDate(0, 0, 7), baseEnd.AddDate(0, 0, 7), &newStart, &newEnd)
	if start.Format("2006-01-02 15:04") != "2026-11-19 15:00" || end.Format("2006-01-02 15:04") != "2026-11-19 17:00" {
		t.Fatalf("shift=%s–%s", start, end)
	}
}
