package rules

import (
	"roomark/apps/roomark/internal/domain"
	"time"
)

// QuickRange caps immediate use at the next reservation or room close time.
func QuickRange(now time.Time, minutes int, limits domain.Rules, bookings []domain.Booking) (time.Time, time.Time, error) {
	start := Local(now.Truncate(time.Minute))
	end := start.Add(time.Duration(minutes) * time.Minute)
	closeTime, err := At(start, limits.CloseTime)
	if err != nil {
		return start, end, err
	}
	if closeTime.Before(end) {
		end = closeTime
	}
	for _, booking := range bookings {
		if booking.Status == "confirmed" && booking.Start.After(start) && booking.Start.Before(end) {
			end = booking.Start
		}
	}
	return start, end, nil
}

// ExtendEnd computes an ongoing booking's requested new end time.
func ExtendEnd(start, end, now time.Time, minutes int) (time.Time, []domain.Violation) {
	if start.After(now) || !end.After(now) {
		return end, []domain.Violation{{Code: "not_ongoing", Message: "只有进行中的预约才能续时"}}
	}
	if minutes != 15 && minutes != 30 && minutes != 60 {
		return end, []domain.Violation{{Code: "invalid_duration", Message: "续时请选择 15、30 或 60 分钟"}}
	}
	return end.Add(time.Duration(minutes) * time.Minute), nil
}

// EarlyEnd computes the actual finish and released minutes of an ongoing booking.
func EarlyEnd(start, end, now time.Time) (time.Time, int, []domain.Violation) {
	now = Local(now.Truncate(time.Minute))
	if start.After(now) || !end.After(now) {
		return end, 0, []domain.Violation{{Code: "not_ongoing", Message: "只有进行中的预约才能提前结束"}}
	}
	return now, int(end.Sub(now) / time.Minute), nil
}

// ShiftRange applies the selected occurrence's edit deltas to another occurrence.
func ShiftRange(originalStart, originalEnd, start, end time.Time, newStart, newEnd *time.Time) (time.Time, time.Time) {
	if newStart != nil {
		start = start.Add(newStart.Sub(originalStart))
	}
	if newEnd != nil {
		end = end.Add(newEnd.Sub(originalEnd))
	}
	return start, end
}
