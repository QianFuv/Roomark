package api

import (
	"context"
	"time"

	"roomark/internal/domain"
	"roomark/internal/rules"
	"roomark/internal/statistics"
	"roomark/internal/store"
)

func (s *Service) statisticsInput(ctx context.Context, q *store.Queries, r request) (statistics.Input, error) {
	from, to, err := dateRange(r.From, r.To, s.now(), 3660)
	if err != nil {
		return statistics.Input{}, err
	}
	input := statistics.Input{From: from, To: to, Now: s.now(), Room: r.Room, Role: r.Role}
	input.Rooms, err = q.ListRooms(ctx)
	if err != nil {
		return input, err
	}
	if r.Room != "" {
		if _, err := q.RoomBySlug(ctx, r.Room); err != nil {
			return input, err
		}
	}
	input.People, err = q.AllPeople(ctx)
	if err != nil {
		return input, err
	}
	input.Bookings, err = q.ListBookings(ctx)
	if err != nil {
		return input, err
	}
	input.Conflicts, err = q.ListConflictEvents(ctx)
	return input, err
}

func (s *Service) statistics(ctx context.Context, q *store.Queries, r request) (domain.Stats, error) {
	input, err := s.statisticsInput(ctx, q, r)
	if err != nil {
		return domain.Stats{}, err
	}
	return statistics.Calculate(input), nil
}

// publicHeatmap returns the selected week's booked shares without limiting future hours.
func (s *Service) publicHeatmap(ctx context.Context, q *store.Queries, room store.Room, week string) (domain.RoomHeatmap, error) {
	day := rules.Day(s.now())
	if week != "" {
		parsed, err := time.ParseInLocation("2006-01-02", week, rules.Shanghai)
		if err != nil || parsed.Format("2006-01-02") != week {
			return domain.RoomHeatmap{}, problem(422, "invalid_range", "日期格式必须为 YYYY-MM-DD")
		}
		day = parsed
	}
	bookings, err := q.ListBookings(ctx)
	if err != nil {
		return domain.RoomHeatmap{}, err
	}
	return statistics.WeeklyHeatmap(room, bookings, day)
}
