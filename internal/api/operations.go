package api

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"roomark/internal/domain"
	"roomark/internal/roomcode"
	"roomark/internal/rules"
	"roomark/internal/store"
)

func (s *Service) execute(ctx context.Context, q *store.Queries, op string, r request) (any, error) {
	switch op {
	case "resolve-room-code":
		body, err := bodyAs[ResolveRoomCode](r)
		if err != nil {
			return nil, err
		}
		room, err := q.RoomByToken(ctx, roomcode.Normalize(body.Code))
		if errors.Is(err, sql.ErrNoRows) {
			return nil, s.invalidRoomCode(ctx, 404, "room_code_invalid", "房间码不正确")
		}
		return ResolvedRoom{Slug: room.Slug, Name: room.Name}, err
	case "login":
		return s.login(ctx, q, r)
	case "claim-person":
		return s.claim(ctx, q, r)
	case "create-person":
		return s.selfPerson(ctx, q, r)
	case "ical-room", "ical-person":
		return s.calendar(ctx, q, op, r)
	}
	isPublic := op == "get-room" || op == "list-room-bookings" || op == "room-heatmap" || op == "check-booking" || op == "list-people"
	person, err := s.authenticate(ctx, q, r, !isPublic)
	if err != nil {
		return nil, err
	}
	if r.slug != "" {
		room, err := s.roomAccess(ctx, q, r.slug, r, person)
		if err != nil {
			return nil, err
		}
		switch op {
		case "get-room":
			return s.roomDetail(ctx, q, room, person)
		case "list-room-bookings":
			return s.filteredBookings(ctx, q, r, person, room.Slug, true)
		case "room-heatmap":
			return s.publicHeatmap(ctx, q, room, r.week)
		case "check-booking":
			return s.checkBooking(ctx, q, r, room, person)
		case "create-booking", "quick-booking":
			return s.createBooking(ctx, q, r, room, person, op == "quick-booking")
		case "preview-series", "create-series":
			return s.series(ctx, q, r, room, person, op == "create-series")
		}
	}
	switch op {
	case "list-people":
		if r.Room == "" {
			return nil, problem(400, "room_required", "请选择房间")
		}
		if _, err := s.roomAccess(ctx, q, r.Room, r, person); err != nil {
			return nil, err
		}
		return peopleList(ctx, q)
	case "get-me":
		return personView(person), nil
	case "my-feeds":
		return Feed{PersonFeedURL: s.publicURL(ctx) + "/ical/person/" + person.FeedToken + ".ics"}, nil
	case "my-bookings":
		return s.myBookings(ctx, q, r, person)
	case "change-passcode":
		return s.changePasscode(ctx, q, r, person)
	case "logout":
		return Success{OK: true}, q.DeleteSession(ctx, tokenHash(strings.TrimPrefix(r.Authorization, "Bearer ")))
	case "edit-booking", "cancel-booking", "extend-booking", "end-booking":
		return s.mutateBooking(ctx, q, r, person, op)
	}
	if person.IsAdmin == 0 {
		return nil, problem(403, "admin_required", "需要管理员权限")
	}
	return s.admin(ctx, q, op, r, person)
}

func peopleList(ctx context.Context, q *store.Queries) ([]domain.Person, error) {
	rows, err := q.ListPeople(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]domain.Person, 0, len(rows))
	for _, person := range rows {
		result = append(result, personView(person))
	}
	return result, nil
}

func (s *Service) roomDetail(ctx context.Context, q *store.Queries, room store.Room, person store.Person) (domain.RoomDetail, error) {
	result := domain.RoomDetail{Room: roomView(room), Status: domain.RoomStatus{State: "free"}, Announcements: []domain.Announcement{}}
	bookings, _, err := s.bookingViews(ctx, q, person)
	if err != nil {
		return result, err
	}
	now := s.now()
	for _, booking := range bookings {
		if booking.RoomSlug != room.Slug || booking.Status != "confirmed" || !booking.End.After(now) {
			continue
		}
		if !booking.Start.After(now) {
			result.Status.State = "busy"
			result.Status.Current = &booking
			result.Status.BusyUntil = &booking.End
		} else if result.Status.Next == nil {
			result.Status.Next = &booking
		}
	}
	if result.Status.Current == nil {
		closeTime, err := rules.At(now, room.CloseTime)
		if err != nil {
			return result, err
		}
		if result.Status.Next != nil && result.Status.Next.Start.Before(closeTime) {
			closeTime = result.Status.Next.Start
		}
		if closeTime.After(now) {
			result.Status.FreeUntil = &closeTime
		}
	}
	announcements, err := s.announcementViews(ctx, q)
	if err != nil {
		return result, err
	}
	for _, announcement := range announcements {
		if (announcement.RoomSlug == "" || announcement.RoomSlug == room.Slug) && !announcement.StartsAt.After(now) && announcement.EndsAt.After(now) {
			result.Announcements = append(result.Announcements, announcement)
		}
	}
	return result, nil
}

func dateRange(from, to string, now time.Time, maxDays int) (time.Time, time.Time, error) {
	start := rules.Day(now)
	if from != "" {
		parsed, err := time.ParseInLocation("2006-01-02", from, rules.Shanghai)
		if err != nil {
			return time.Time{}, time.Time{}, problem(422, "invalid_range", "日期请用 YYYY-MM-DD 格式")
		}
		start = parsed
	}
	end := start.AddDate(0, 0, 7)
	if to != "" {
		parsed, err := time.ParseInLocation("2006-01-02", to, rules.Shanghai)
		if err != nil {
			return time.Time{}, time.Time{}, problem(422, "invalid_range", "日期请用 YYYY-MM-DD 格式")
		}
		end = parsed.AddDate(0, 0, 1)
	}
	if !end.After(start) || maxDays > 0 && end.Sub(start) > time.Duration(maxDays)*24*time.Hour {
		return time.Time{}, time.Time{}, problem(422, "invalid_range", "日期范围超出限制")
	}
	return start, end, nil
}

func (s *Service) filteredBookings(ctx context.Context, q *store.Queries, r request, viewer store.Person, slug string, confirmedOnly bool) ([]domain.Booking, error) {
	maxDays := 3660
	if confirmedOnly {
		maxDays = 62
	}
	start, end, err := dateRange(r.From, r.To, s.now(), maxDays)
	if err != nil {
		return nil, err
	}
	rows, _, err := s.bookingViews(ctx, q, viewer)
	if err != nil {
		return nil, err
	}
	result := []domain.Booking{}
	for _, booking := range rows {
		if slug != "" && booking.RoomSlug != slug || confirmedOnly && booking.Status != "confirmed" || r.Status != "" && booking.Status != r.Status || r.PersonID != 0 && (booking.Person == nil || booking.Person.ID != r.PersonID) || !rules.Overlaps(booking.Start, booking.End, start, end) {
			continue
		}
		result = append(result, booking)
	}
	return result, nil
}

func (s *Service) myBookings(ctx context.Context, q *store.Queries, r request, person store.Person) (domain.MyBookings, error) {
	result := domain.MyBookings{Singles: []domain.Booking{}, Series: []domain.MySeries{}}
	bookings, _, err := s.bookingViews(ctx, q, person)
	if err != nil {
		return result, err
	}
	indices := map[int64]int{}
	for _, booking := range bookings {
		if !booking.IsMine {
			continue
		}
		isPast := !booking.End.After(s.now()) || booking.Status == "cancelled"
		if isPast != r.Past {
			continue
		}
		if booking.Series == nil {
			result.Singles = append(result.Singles, booking)
			continue
		}
		index, exists := indices[booking.Series.ID]
		if !exists {
			index = len(result.Series)
			indices[booking.Series.ID] = index
			result.Series = append(result.Series, domain.MySeries{ID: booking.Series.ID, RoomSlug: booking.RoomSlug, Title: booking.Title, RuleSummary: booking.Series.RuleSummary, FirstDate: booking.Start.Format("2006-01-02"), Occurrences: []domain.Booking{}})
		}
		group := &result.Series[index]
		group.LastDate = booking.Start.Format("2006-01-02")
		if !isPast {
			group.Remaining++
		}
		group.Occurrences = append(group.Occurrences, booking)
	}
	return result, nil
}

func (s *Service) announcementViews(ctx context.Context, q *store.Queries) ([]domain.Announcement, error) {
	rows, err := q.ListAnnouncements(ctx)
	if err != nil {
		return nil, err
	}
	rooms, err := q.ListRooms(ctx)
	if err != nil {
		return nil, err
	}
	slugs := map[int64]string{}
	for _, room := range rooms {
		slugs[room.ID] = room.Slug
	}
	result := make([]domain.Announcement, 0, len(rows))
	for _, row := range rows {
		result = append(result, domain.Announcement{ID: row.ID, RoomSlug: slugs[row.RoomID.Int64], Title: row.Title, Body: row.Body, StartsAt: timestamp(row.StartsAt), EndsAt: timestamp(row.EndsAt), Pinned: row.Pinned != 0})
	}
	return result, nil
}

func roomID(ctx context.Context, q *store.Queries, slug string) (sql.NullInt64, error) {
	if slug == "" {
		return sql.NullInt64{}, nil
	}
	room, err := q.RoomBySlug(ctx, slug)
	return nullable(room.ID), err
}
