package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"roomark/internal/domain"
	"roomark/internal/rules"
	"roomark/internal/store"
)

func violationsProblem(violations []domain.Violation) *Problem {
	p := problem(422, violations[0].Code, violations[0].Message)
	p.Violations = violations
	return p
}

func activeCount(bookings []domain.Booking, slug string, personID int64, now time.Time) int {
	groups := map[string]bool{}
	for _, booking := range bookings {
		if booking.RoomSlug != slug || booking.Status != "confirmed" || !booking.End.After(now) || booking.Person == nil || booking.Person.ID != personID {
			continue
		}
		key := fmt.Sprintf("b%d", booking.ID)
		if booking.Series != nil {
			key = fmt.Sprintf("s%d", booking.Series.ID)
		}
		groups[key] = true
	}
	return len(groups)
}

func forRoom(bookings []domain.Booking, slug string, excluded map[int64]bool) []domain.Booking {
	result := []domain.Booking{}
	for _, booking := range bookings {
		if booking.RoomSlug == slug && !excluded[booking.ID] {
			result = append(result, booking)
		}
	}
	return result
}

func (s *Service) check(start, end time.Time, room store.Room, bookings []domain.Booking, options rules.Options) domain.CheckResult {
	violations := rules.Validate(start, end, roomView(room).Rules, options)
	result := domain.CheckResult{OK: len(violations) == 0, Violations: violations}
	if !result.OK {
		return result
	}
	if conflict := rules.Conflict(start, end, bookings); conflict != nil {
		name := "不可预约"
		if conflict.Person != nil {
			name = conflict.Person.Name
		}
		result.OK = false
		result.Conflict = &domain.Conflict{ConflictWith: domain.ConflictWith{Name: name, Title: conflict.Title, Start: conflict.Start, End: conflict.End}, Suggestions: rules.Suggestions(start, end, roomView(room).Rules, options, bookings)}
	}
	return result
}

func (s *Service) checkBooking(ctx context.Context, q *store.Queries, r request, room store.Room, person store.Person) (any, error) {
	body, err := bodyAs[CheckRange](r)
	if err != nil {
		return nil, err
	}
	bookings, _, err := s.bookingViews(ctx, q, person)
	if err != nil {
		return nil, err
	}
	excluded := map[int64]bool{body.ExcludeBookingID: body.ExcludeBookingID != 0}
	options := rules.Options{Now: s.now(), Active: activeCount(bookings, room.Slug, person.ID, s.now()), Existing: body.ExcludeBookingID != 0}
	return s.check(body.Start, body.End, room, forRoom(bookings, room.Slug, excluded), options), nil
}

func bookingOwner(ctx context.Context, q *store.Queries, person store.Person, onBehalfOf int64, kind string) (sql.NullInt64, string, error) {
	if kind == "" {
		kind = "normal"
	}
	if (onBehalfOf != 0 || kind == "block") && person.IsAdmin == 0 {
		return sql.NullInt64{}, kind, problem(403, "admin_required", "仅管理员可以代约或设置不可预约时段")
	}
	if kind == "block" {
		return sql.NullInt64{}, kind, nil
	}
	if onBehalfOf != 0 {
		target, err := q.PersonByID(ctx, onBehalfOf)
		return nullable(target.ID), kind, err
	}
	return nullable(person.ID), kind, nil
}

func (s *Service) recordConflict(ctx context.Context, q *store.Queries, conflict *domain.Conflict, room store.Room, person store.Person, start, end time.Time, source string) error {
	event, err := q.OpenConflict(ctx, store.OpenConflictParams{RoomID: room.ID, PersonID: nullable(person.ID), RequestedStart: start.Unix(), RequestedEnd: end.Unix(), Source: source, CreatedAt: s.now().Add(-24 * time.Hour).Unix()})
	if err == nil {
		conflict.ConflictEventID = event.ID
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	event, err = q.CreateConflict(ctx, store.CreateConflictParams{RoomID: room.ID, PersonID: nullable(person.ID), RequestedStart: start.Unix(), RequestedEnd: end.Unix(), Source: source, CreatedAt: s.now().Unix()})
	if err != nil {
		return err
	}
	conflict.ConflictEventID = event.ID
	return nil
}

func (s *Service) conflictProblem(ctx context.Context, q *store.Queries, result domain.CheckResult, room store.Room, person store.Person, start, end time.Time, source string) error {
	if len(result.Violations) > 0 {
		return violationsProblem(result.Violations)
	}
	if result.Conflict == nil {
		return nil
	}
	if err := s.recordConflict(ctx, q, result.Conflict, room, person, start, end, source); err != nil {
		return err
	}
	p := problem(409, "booking_conflict", "此时段已有预约，请选择其他时间")
	p.Conflict = result.Conflict
	p.persist = true
	return p
}

func (s *Service) createBooking(ctx context.Context, q *store.Queries, r request, room store.Room, person store.Person, isQuick bool) (any, error) {
	var body CreateBooking
	var err error
	if isQuick {
		quick, err := bodyAs[Quick](r)
		if err != nil {
			return nil, err
		}
		if !slices.Contains([]int{30, 60, 90, 120}, quick.Minutes) {
			return nil, problem(422, "invalid_duration", "立即使用时长无效")
		}
		body.Start = rules.Local(s.now().Truncate(time.Minute))
		body.End = body.Start.Add(time.Duration(quick.Minutes) * time.Minute)
	} else {
		body, err = bodyAs[CreateBooking](r)
		if err != nil {
			return nil, err
		}
	}
	owner, kind, err := bookingOwner(ctx, q, person, body.OnBehalfOf, body.Kind)
	if err != nil {
		return nil, err
	}
	bookings, _, err := s.bookingViews(ctx, q, person)
	if err != nil {
		return nil, err
	}
	roomBookings := forRoom(bookings, room.Slug, nil)
	if isQuick {
		body.Start, body.End, err = rules.QuickRange(s.now(), int(body.End.Sub(body.Start)/time.Minute), roomView(room).Rules, roomBookings)
		if err != nil {
			return nil, err
		}
	}
	options := rules.Options{Now: s.now(), Quick: isQuick, Block: kind == "block", Active: activeCount(bookings, room.Slug, owner.Int64, s.now())}
	result := s.check(body.Start, body.End, room, roomBookings, options)
	if !result.OK {
		return nil, s.conflictProblem(ctx, q, result, room, person, body.Start, body.End, "single")
	}
	row, err := q.CreateBooking(ctx, store.CreateBookingParams{RoomID: room.ID, PersonID: owner, Kind: kind, Title: body.Title, StartAt: body.Start.Unix(), EndAt: body.End.Unix(), PlannedEndAt: body.End.Unix(), CreatedAt: s.now().Unix(), UpdatedAt: s.now().Unix()})
	if err != nil {
		return nil, err
	}
	if body.ConflictEventID != 0 {
		events, err := q.ListConflictEvents(ctx)
		if err != nil {
			return nil, err
		}
		isSuggestion := false
		for _, event := range events {
			if event.ID != body.ConflictEventID || event.RoomID != room.ID || event.PersonID.Int64 != person.ID {
				continue
			}
			for _, candidate := range rules.Suggestions(timestamp(event.RequestedStart), timestamp(event.RequestedEnd), roomView(room).Rules, rules.Options{Now: s.now()}, roomBookings) {
				if candidate.Start.Equal(body.Start) && candidate.End.Equal(body.End) {
					isSuggestion = true
				}
			}
		}
		if isSuggestion {
			if _, err := q.AcceptSuggestion(ctx, store.AcceptSuggestionParams{ID: body.ConflictEventID, RoomID: room.ID, PersonID: nullable(person.ID), AcceptedBookingID: nullable(row.ID)}); err != nil {
				return nil, err
			}
		}
	}
	return s.bookingByView(ctx, q, row.ID, person)
}

func (s *Service) bookingByView(ctx context.Context, q *store.Queries, id int64, viewer store.Person) (domain.Booking, error) {
	bookings, _, err := s.bookingViews(ctx, q, viewer)
	if err != nil {
		return domain.Booking{}, err
	}
	for _, booking := range bookings {
		if booking.ID == id {
			return booking, nil
		}
	}
	return domain.Booking{}, sql.ErrNoRows
}

func (s *Service) series(ctx context.Context, q *store.Queries, r request, room store.Room, person store.Person, create bool) (any, error) {
	var body CreateSeries
	if create {
		parsed, err := bodyAs[CreateSeries](r)
		if err != nil {
			return nil, err
		}
		body = parsed
	} else {
		parsed, err := bodyAs[RuleInput](r)
		if err != nil {
			return nil, err
		}
		body.RuleInput = parsed
	}
	owner, kind, err := bookingOwner(ctx, q, person, body.OnBehalfOf, body.Kind)
	if err != nil {
		return nil, err
	}
	occurrences, violations := rules.Expand(body.Rule, roomView(room).Rules, s.now())
	if len(violations) > 0 {
		return nil, violationsProblem(violations)
	}
	bookings, _, err := s.bookingViews(ctx, q, person)
	if err != nil {
		return nil, err
	}
	roomBookings := forRoom(bookings, room.Slug, nil)
	options := rules.Options{Now: s.now(), Recurring: true, Block: kind == "block", Active: activeCount(bookings, room.Slug, owner.Int64, s.now())}
	preview := domain.Preview{Occurrences: occurrences}
	for index := range preview.Occurrences {
		item := &preview.Occurrences[index]
		check := s.check(item.Start, item.End, room, roomBookings, options)
		if len(check.Violations) > 0 {
			item.Status = "violation"
			item.Violations = check.Violations
		} else if check.Conflict != nil {
			item.Status = "conflict"
			item.Conflict = check.Conflict
		}
	}
	encoded, err := json.Marshal(preview)
	if err != nil {
		return nil, err
	}
	signature := tokenHash(string(encoded))
	ruleJSON, err := json.Marshal(body.Rule)
	if err != nil {
		return nil, err
	}
	key := tokenHash(fmt.Sprintf("%s:%d:%s:%d:%s", r.Authorization, room.ID, ruleJSON, owner.Int64, kind))
	if err := q.ExpirePreviews(ctx, s.now().Add(-24*time.Hour).Unix()); err != nil {
		return nil, err
	}
	if !create {
		for index := range preview.Occurrences {
			item := &preview.Occurrences[index]
			if item.Conflict != nil {
				if err := s.recordConflict(ctx, q, item.Conflict, room, person, item.Start, item.End, "series"); err != nil {
					return nil, err
				}
			}
		}
		return preview, q.SetPreview(ctx, store.SetPreviewParams{PreviewKey: key, Signature: signature, CreatedAt: s.now().Unix()})
	}
	previous, err := q.GetPreview(ctx, key)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if previous.Signature != signature {
		if err := q.SetPreview(ctx, store.SetPreviewParams{PreviewKey: key, Signature: signature, CreatedAt: s.now().Unix()}); err != nil {
			return nil, err
		}
		p := problem(409, "preview_changed", "预约情况已变化，请确认最新预览")
		p.Occurrences = preview.Occurrences
		p.persist = true
		for index := range p.Occurrences {
			item := &p.Occurrences[index]
			if item.Conflict != nil {
				if err := s.recordConflict(ctx, q, item.Conflict, room, person, item.Start, item.End, "series"); err != nil {
					return nil, err
				}
			}
		}
		return nil, p
	}
	overrides := map[string]domain.Override{}
	for _, override := range body.Overrides {
		if _, exists := overrides[override.Date]; exists {
			return nil, problem(422, "invalid_override", "重复的单次调整")
		}
		found := false
		for _, item := range occurrences {
			if item.Date == override.Date {
				found = true
			}
		}
		if !found || override.Action != "skip" && override.Action != "move" {
			return nil, problem(422, "invalid_override", "单次调整日期或动作无效")
		}
		overrides[override.Date] = override
	}
	selected := []domain.Occurrence{}
	skipped := []string{}
	for _, item := range preview.Occurrences {
		override, exists := overrides[item.Date]
		if exists && override.Action == "skip" || !exists && item.Status == "conflict" {
			skipped = append(skipped, item.Date)
			continue
		}
		if exists && override.Action == "move" {
			if override.Start == nil || override.End == nil {
				return nil, problem(422, "invalid_override", "移动预约需要开始和结束时间")
			}
			item.Start = *override.Start
			item.End = *override.End
			if rules.Day(item.Start).After(rules.Day(s.now()).AddDate(0, 0, int(room.RecurringMaxWeeks)*7)) {
				return nil, violationsProblem([]domain.Violation{{Code: "series_too_long", Message: "超过重复预约允许周数"}})
			}
		}
		check := s.check(item.Start, item.End, room, roomBookings, options)
		if !check.OK {
			failure := s.conflictProblem(ctx, q, check, room, person, item.Start, item.End, "series")
			var detail *Problem
			if errors.As(failure, &detail) && detail.Status == 409 {
				detail.Occurrences = slices.Clone(preview.Occurrences)
				item.Status = "conflict"
				item.Conflict = check.Conflict
				item.Violations = nil
				for index, occurrence := range detail.Occurrences {
					if occurrence.Date == item.Date {
						detail.Occurrences[index] = item
					}
				}
			}
			return nil, failure
		}
		selected = append(selected, item)
		roomBookings = append(roomBookings, domain.Booking{Start: item.Start, End: item.End, Status: "confirmed", Title: body.Title})
	}
	if len(selected) == 0 {
		return domain.SeriesResult{Created: []domain.Booking{}, Skipped: skipped}, nil
	}
	series, err := q.CreateSeries(ctx, store.CreateSeriesParams{RoomID: room.ID, PersonID: owner, Kind: kind, Title: body.Title, RuleJson: string(ruleJSON), CreatedAt: s.now().Unix()})
	if err != nil {
		return nil, err
	}
	ids := []int64{}
	events, err := q.ListConflictEvents(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range selected {
		row, err := q.CreateBooking(ctx, store.CreateBookingParams{RoomID: room.ID, PersonID: owner, SeriesID: nullable(series.ID), Kind: kind, Title: body.Title, StartAt: item.Start.Unix(), EndAt: item.End.Unix(), PlannedEndAt: item.End.Unix(), CreatedAt: s.now().Unix(), UpdatedAt: s.now().Unix()})
		if err != nil {
			return nil, err
		}
		ids = append(ids, row.ID)
		if override, exists := overrides[item.Date]; exists && override.Action == "move" {
			var original domain.Occurrence
			for _, occurrence := range occurrences {
				if occurrence.Date == item.Date {
					original = occurrence
					break
				}
			}
			for eventIndex := len(events) - 1; eventIndex >= 0; eventIndex-- {
				event := events[eventIndex]
				if event.RoomID != room.ID || event.PersonID.Int64 != person.ID || event.Source != "series" || event.AcceptedBookingID.Valid || event.RequestedStart != original.Start.Unix() || event.RequestedEnd != original.End.Unix() {
					continue
				}
				for _, candidate := range rules.Suggestions(original.Start, original.End, roomView(room).Rules, options, forRoom(bookings, room.Slug, nil)) {
					if candidate.Start.Equal(item.Start) && candidate.End.Equal(item.End) {
						if _, err := q.AcceptSuggestion(ctx, store.AcceptSuggestionParams{ID: event.ID, RoomID: room.ID, PersonID: nullable(person.ID), AcceptedBookingID: nullable(row.ID)}); err != nil {
							return nil, err
						}
					}
				}
				break
			}
		}
	}
	if err := q.DeletePreview(ctx, key); err != nil {
		return nil, err
	}
	created, _, err := s.bookingViews(ctx, q, person)
	if err != nil {
		return nil, err
	}
	result := domain.SeriesResult{SeriesID: series.ID, Created: []domain.Booking{}, Skipped: skipped}
	for _, booking := range created {
		if slices.Contains(ids, booking.ID) {
			result.Created = append(result.Created, booking)
		}
	}
	return result, nil
}

func (s *Service) mutateBooking(ctx context.Context, q *store.Queries, r request, person store.Person, op string) (any, error) {
	row, err := q.BookingByID(ctx, r.id)
	if err != nil {
		return nil, err
	}
	room, err := q.RoomByID(ctx, row.RoomID)
	if err != nil {
		return nil, err
	}
	if _, err := s.roomAccess(ctx, q, room.Slug, r, person); err != nil {
		return nil, err
	}
	if person.IsAdmin == 0 && (!row.PersonID.Valid || row.PersonID.Int64 != person.ID) {
		return nil, problem(403, "not_owner", "只能修改自己的预约")
	}
	now := s.now().Truncate(time.Minute)
	if row.Status != "confirmed" || row.EndAt <= now.Unix() {
		return nil, problem(422, "booking_finished", "预约已结束或取消")
	}
	var edit EditBooking
	if op == "edit-booking" {
		edit, err = bodyAs[EditBooking](r)
		if err != nil {
			return nil, err
		}
	}
	if op == "cancel-booking" {
		scope, err := bodyAs[Scope](r)
		if err != nil {
			return nil, err
		}
		edit.Scope = scope.Scope
	}
	if op == "end-booking" || op == "extend-booking" {
		if row.StartAt > now.Unix() {
			return nil, problem(422, "not_ongoing", "只有进行中的预约可以续时或提前结束")
		}
		if op == "end-booking" {
			end, _, violations := rules.EarlyEnd(timestamp(row.StartAt), timestamp(row.EndAt), s.now())
			if len(violations) > 0 {
				return nil, violationsProblem(violations)
			}
			updated, err := q.UpdateBooking(ctx, store.UpdateBookingParams{ID: row.ID, StartAt: row.StartAt, EndAt: end.Unix(), PlannedEndAt: row.PlannedEndAt, Title: row.Title, UpdatedAt: s.now().Unix()})
			if err != nil {
				return nil, err
			}
			return s.bookingByView(ctx, q, updated.ID, person)
		}
		extend, err := bodyAs[Extend](r)
		if err != nil {
			return nil, err
		}
		end, violations := rules.ExtendEnd(timestamp(row.StartAt), timestamp(row.EndAt), s.now(), extend.Minutes)
		if len(violations) > 0 {
			return nil, violationsProblem(violations)
		}
		edit.End = &end
	}
	bookings, rows, err := s.bookingViews(ctx, q, person)
	if err != nil {
		return nil, err
	}
	targets := []store.Booking{}
	excluded := map[int64]bool{}
	for _, candidate := range rows {
		if candidate.ID == row.ID || edit.Scope == "following" && row.SeriesID.Valid && candidate.SeriesID == row.SeriesID && candidate.StartAt >= row.StartAt && candidate.Status == "confirmed" {
			if candidate.EndAt <= now.Unix() {
				continue
			}
			if op == "cancel-booking" && candidate.StartAt <= now.Unix() {
				return nil, problem(422, "booking_ongoing", "进行中的预约请使用提前结束")
			}
			targets = append(targets, candidate)
			excluded[candidate.ID] = true
		}
	}
	if op == "cancel-booking" {
		for _, candidate := range targets {
			if err := q.CancelBooking(ctx, store.CancelBookingParams{ID: candidate.ID, CancelledAt: nullable(s.now().Unix()), CancelledBy: nullable(person.ID), UpdatedAt: s.now().Unix()}); err != nil {
				return nil, err
			}
		}
		return Success{OK: true}, nil
	}
	startDelta, endDelta := int64(0), int64(0)
	if edit.Start != nil {
		startDelta = edit.Start.Unix() - row.StartAt
	}
	if edit.End != nil {
		endDelta = edit.End.Unix() - row.EndAt
	}
	roomBookings := forRoom(bookings, room.Slug, excluded)
	updates := []store.UpdateBookingParams{}
	for _, candidate := range targets {
		start, end := rules.ShiftRange(timestamp(row.StartAt), timestamp(row.EndAt), timestamp(candidate.StartAt), timestamp(candidate.EndAt), edit.Start, edit.End)
		if candidate.StartAt < now.Unix() && edit.Start != nil && startDelta != 0 {
			return nil, problem(422, "booking_ongoing", "进行中的预约不能修改开始时间")
		}
		if candidate.StartAt < now.Unix() && op == "edit-booking" && endDelta != 0 {
			return nil, problem(422, "booking_ongoing", "进行中的预约请使用续时或提前结束")
		}
		options := rules.Options{Now: s.now(), Recurring: candidate.SeriesID.Valid, Block: candidate.Kind == "block", Existing: true, Quick: candidate.StartAt%900 != 0}
		if startDelta != 0 && start.Before(now) {
			return nil, violationsProblem([]domain.Violation{{Code: "in_past", Message: "不能预约过去的时间"}})
		}
		if candidate.SeriesID.Valid && rules.Day(start).After(rules.Day(s.now()).AddDate(0, 0, int(room.RecurringMaxWeeks)*7)) {
			return nil, violationsProblem([]domain.Violation{{Code: "series_too_long", Message: "超过重复预约允许周数"}})
		}
		check := s.check(start, end, room, roomBookings, options)
		if !check.OK {
			return nil, s.conflictProblem(ctx, q, check, room, person, start, end, "single")
		}
		title := candidate.Title
		if edit.Title != nil {
			title = *edit.Title
		}
		plannedEnd := candidate.PlannedEndAt
		if endDelta != 0 {
			plannedEnd = end.Unix()
		}
		updates = append(updates, store.UpdateBookingParams{ID: candidate.ID, StartAt: start.Unix(), EndAt: end.Unix(), PlannedEndAt: plannedEnd, Title: title, UpdatedAt: s.now().Unix()})
		roomBookings = append(roomBookings, domain.Booking{Start: start, End: end, Status: "confirmed", Title: title})
	}
	for _, update := range updates {
		if _, err := q.UpdateBooking(ctx, update); err != nil {
			return nil, err
		}
	}
	return s.bookingByView(ctx, q, row.ID, person)
}
