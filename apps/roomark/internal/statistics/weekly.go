package statistics

import (
	"time"

	"roomark/apps/roomark/internal/domain"
	"roomark/apps/roomark/internal/rules"
	"roomark/apps/roomark/internal/store"
)

// WeeklyHeatmap counts confirmed bookings and blocks within each open clock hour
// of the Shanghai Monday–Sunday week containing day, using a full hour as denominator.
func WeeklyHeatmap(room store.Room, bookings []store.Booking, day time.Time) (domain.RoomHeatmap, error) {
	day = rules.Day(day)
	weekStart := day.AddDate(0, 0, -(int(day.Weekday())+6)%7)
	result := domain.RoomHeatmap{WeekStart: weekStart.Format("2006-01-02"), Hours: []int{}}
	open, err := rules.At(weekStart, room.OpenTime)
	if err != nil {
		return result, err
	}
	closeTime, err := rules.At(weekStart, room.CloseTime)
	if err != nil {
		return result, err
	}
	for begin := open.Truncate(time.Hour); begin.Before(closeTime); begin = begin.Add(time.Hour) {
		result.Hours = append(result.Hours, begin.Hour())
	}
	for index := range result.Days {
		date := weekStart.AddDate(0, 0, index)
		result.Days[index] = date.Format("2006-01-02")
		result.Cells[index] = make([]float64, len(result.Hours))
		dayOpen, dayClose := open.AddDate(0, 0, index), closeTime.AddDate(0, 0, index)
		for column, hour := range result.Hours {
			begin := date.Add(time.Duration(hour) * time.Hour)
			end := begin.Add(time.Hour)
			if dayOpen.After(begin) {
				begin = dayOpen
			}
			if dayClose.Before(end) {
				end = dayClose
			}
			occupied := float64(0)
			for _, booking := range bookings {
				if booking.RoomID == room.ID && booking.Status == "confirmed" {
					occupied += overlapSeconds(timestamp(booking.StartAt), timestamp(booking.EndAt), begin, end)
				}
			}
			result.Cells[index][column] = min(1, occupied/3600)
		}
	}
	return result, nil
}
