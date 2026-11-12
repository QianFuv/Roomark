package api

import (
	"context"
	"database/sql"
	"strings"

	"roomark/internal/domain"
	"roomark/internal/roomcode"
	"roomark/internal/rules"
	"roomark/internal/store"
)

func (s *Service) admin(ctx context.Context, q *store.Queries, op string, r request, person store.Person) (any, error) {
	switch op {
	case "admin-rooms":
		rows, err := q.ListRooms(ctx)
		if err != nil {
			return nil, err
		}
		result := make([]domain.AdminRoom, 0, len(rows))
		for _, room := range rows {
			result = append(result, adminRoomView(room))
		}
		return result, nil
	case "admin-create-room":
		return s.createRoom(ctx, q, r)
	case "admin-edit-room":
		return s.editRoom(ctx, q, r)
	case "room-qr":
		if s.config.PublicURL == "" {
			return nil, problem(422, "public_url_required", "请先设置服务器公开地址 ROOMARK_PUBLIC_URL")
		}
		room, err := q.RoomByID(ctx, r.id)
		return QR{URL: s.config.PublicURL + "/r/" + room.Slug + "?k=" + room.AccessToken, Code: room.AccessToken}, err
	case "admin-people":
		return peopleList(ctx, q)
	case "admin-create-person":
		body, err := bodyAs[PresetPerson](r)
		if err != nil {
			return nil, err
		}
		return s.createPreset(ctx, q, body)
	case "import-people":
		body, err := bodyAs[ImportPeople](r)
		if err != nil {
			return nil, err
		}
		result := make([]domain.Person, 0, len(body.People))
		for _, item := range body.People {
			person, err := s.createPreset(ctx, q, PresetPerson(item))
			if err != nil {
				return nil, err
			}
			result = append(result, person)
		}
		return result, nil
	case "admin-edit-person", "delete-person", "reset-passcode":
		return s.adminPerson(ctx, q, op, r)
	case "admin-bookings":
		return s.filteredBookings(ctx, q, r, person, r.Room, false)
	case "admin-announcements":
		return s.announcementViews(ctx, q)
	case "create-announcement", "edit-announcement", "delete-announcement":
		return s.adminAnnouncement(ctx, q, op, r)
	case "stats":
		return s.statistics(ctx, q, r)
	case "export-csv":
		return s.exportCSV(ctx, q, r)
	}
	return nil, problem(404, "not_found", "接口不存在")
}

func (s *Service) createRoom(ctx context.Context, q *store.Queries, r request) (any, error) {
	body, err := bodyAs[RoomInput](r)
	if err != nil {
		return nil, err
	}
	limits := domain.DefaultRules()
	if body.Rules != nil {
		limits = *body.Rules
	}
	if err := rules.ValidateRules(limits); err != nil {
		return nil, problem(422, "invalid_rules", "房间预约规则不正确")
	}
	if strings.TrimSpace(body.Name) == "" {
		return nil, problem(422, "invalid_name", "请填写名称")
	}
	for {
		code, err := roomcode.New()
		if err != nil {
			return nil, err
		}
		room, err := q.CreateRoom(ctx, store.CreateRoomParams{Slug: body.Slug, Name: strings.TrimSpace(body.Name), Location: body.Location, Capacity: int64(body.Capacity), Description: body.Description, AccessToken: code, OpenTime: limits.OpenTime, CloseTime: limits.CloseTime, MaxDurationMin: int64(limits.MaxDurationMinutes), MaxAdvanceDays: int64(limits.MaxAdvanceDays), MaxActivePerPerson: int64(limits.MaxActivePerPerson), RecurringMaxWeeks: int64(limits.RecurringMaxWeeks), CreatedAt: s.now().Unix()})
		if err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed: rooms.access_token") {
			continue
		}
		return adminRoomView(room), err
	}
}

func (s *Service) editRoom(ctx context.Context, q *store.Queries, r request) (any, error) {
	body, err := bodyAs[EditRoom](r)
	if err != nil {
		return nil, err
	}
	room, err := q.RoomByID(ctx, r.id)
	if err != nil {
		return nil, err
	}
	if body.Slug != nil {
		room.Slug = *body.Slug
	}
	if body.Name != nil {
		room.Name = strings.TrimSpace(*body.Name)
		if room.Name == "" {
			return nil, problem(422, "invalid_name", "请填写名称")
		}
	}
	if body.Location != nil {
		room.Location = *body.Location
	}
	if body.Description != nil {
		room.Description = *body.Description
	}
	if body.Capacity != nil {
		room.Capacity = int64(*body.Capacity)
	}
	if body.Archived != nil {
		room.ArchivedAt = sql.NullInt64{Int64: s.now().Unix(), Valid: *body.Archived}
	}
	limits := roomView(room).Rules
	if body.Rules != nil {
		limits = *body.Rules
	}
	if err := rules.ValidateRules(limits); err != nil {
		return nil, problem(422, "invalid_rules", "房间预约规则不正确")
	}
	updated, err := q.UpdateRoom(ctx, store.UpdateRoomParams{ID: room.ID, Slug: room.Slug, Name: room.Name, Location: room.Location, Capacity: room.Capacity, Description: room.Description, ArchivedAt: room.ArchivedAt, OpenTime: limits.OpenTime, CloseTime: limits.CloseTime, MaxDurationMin: int64(limits.MaxDurationMinutes), MaxAdvanceDays: int64(limits.MaxAdvanceDays), MaxActivePerPerson: int64(limits.MaxActivePerPerson), RecurringMaxWeeks: int64(limits.RecurringMaxWeeks)})
	return adminRoomView(updated), err
}

func (s *Service) createPreset(ctx context.Context, q *store.Queries, body PresetPerson) (domain.Person, error) {
	name := strings.TrimSpace(body.Name)
	if name == "" {
		return domain.Person{}, problem(422, "invalid_name", "请填写姓名")
	}
	person, err := q.CreatePerson(ctx, store.CreatePersonParams{Name: name, Role: body.Role, IsAdmin: integer(body.IsAdmin), FeedToken: token(), Source: "preset", CreatedAt: s.now().Unix()})
	return personView(person), err
}

func (s *Service) adminPerson(ctx context.Context, q *store.Queries, op string, r request) (any, error) {
	person, err := q.PersonByID(ctx, r.id)
	if err != nil {
		return nil, err
	}
	if op == "reset-passcode" {
		if err := q.SetPasscode(ctx, store.SetPasscodeParams{ID: person.ID}); err != nil {
			return nil, err
		}
		return Success{OK: true}, q.RevokeSessions(ctx, person.ID)
	}
	if op == "delete-person" {
		if err := protectAdmin(ctx, q, person, false); err != nil {
			return nil, err
		}
		if err := q.DeletePerson(ctx, store.DeletePersonParams{ID: person.ID, DeletedAt: sql.NullInt64{Int64: s.now().Unix(), Valid: true}}); err != nil {
			return nil, err
		}
		return Success{OK: true}, q.RevokeSessions(ctx, person.ID)
	}
	body, err := bodyAs[EditPerson](r)
	if err != nil {
		return nil, err
	}
	if body.IsAdmin != nil {
		if err := protectAdmin(ctx, q, person, *body.IsAdmin); err != nil {
			return nil, err
		}
		person.IsAdmin = integer(*body.IsAdmin)
	}
	if body.Name != nil {
		person.Name = strings.TrimSpace(*body.Name)
		if person.Name == "" {
			return nil, problem(422, "invalid_name", "请填写姓名")
		}
	}
	if body.Role != nil {
		person.Role = *body.Role
	}
	updated, err := q.UpdatePerson(ctx, store.UpdatePersonParams{ID: person.ID, Name: person.Name, Role: person.Role, IsAdmin: person.IsAdmin})
	return personView(updated), err
}

func protectAdmin(ctx context.Context, q *store.Queries, person store.Person, willBeAdmin bool) error {
	if person.IsAdmin == 0 || willBeAdmin {
		return nil
	}
	count, err := q.AdminCount(ctx)
	if err != nil {
		return err
	}
	if count <= 1 {
		return problem(422, "last_admin", "至少保留一名管理员")
	}
	return nil
}

func (s *Service) adminAnnouncement(ctx context.Context, q *store.Queries, op string, r request) (any, error) {
	var row store.Announcement
	if op != "create-announcement" {
		existing, err := q.AnnouncementByID(ctx, r.id)
		if err != nil {
			return nil, err
		}
		row = existing
	}
	if op == "delete-announcement" {
		return Success{OK: true}, q.DeleteAnnouncement(ctx, r.id)
	}
	if op == "create-announcement" {
		body, err := bodyAs[AnnouncementInput](r)
		if err != nil {
			return nil, err
		}
		id, err := roomID(ctx, q, body.RoomSlug)
		if err != nil {
			return nil, err
		}
		row = store.Announcement{RoomID: id, Title: body.Title, Body: body.Body, StartsAt: body.StartsAt.Unix(), EndsAt: body.EndsAt.Unix(), Pinned: integer(body.Pinned)}
	} else {
		body, err := bodyAs[EditAnnouncement](r)
		if err != nil {
			return nil, err
		}
		if body.RoomSlug != nil {
			id, err := roomID(ctx, q, *body.RoomSlug)
			if err != nil {
				return nil, err
			}
			row.RoomID = id
		}
		if body.Title != nil {
			row.Title = *body.Title
		}
		if body.Body != nil {
			row.Body = *body.Body
		}
		if body.StartsAt != nil {
			row.StartsAt = body.StartsAt.Unix()
		}
		if body.EndsAt != nil {
			row.EndsAt = body.EndsAt.Unix()
		}
		if body.Pinned != nil {
			row.Pinned = integer(*body.Pinned)
		}
	}
	if row.EndsAt <= row.StartsAt {
		return nil, problem(422, "invalid_range", "公告结束时间要晚于开始时间")
	}
	var err error
	if op == "create-announcement" {
		row, err = q.CreateAnnouncement(ctx, store.CreateAnnouncementParams{RoomID: row.RoomID, Title: row.Title, Body: row.Body, StartsAt: row.StartsAt, EndsAt: row.EndsAt, Pinned: row.Pinned, CreatedAt: s.now().Unix()})
	} else {
		row, err = q.UpdateAnnouncement(ctx, store.UpdateAnnouncementParams{ID: row.ID, RoomID: row.RoomID, Title: row.Title, Body: row.Body, StartsAt: row.StartsAt, EndsAt: row.EndsAt, Pinned: row.Pinned})
	}
	if err != nil {
		return nil, err
	}
	views, err := s.announcementViews(ctx, q)
	if err != nil {
		return nil, err
	}
	for _, view := range views {
		if view.ID == row.ID {
			return view, nil
		}
	}
	return nil, sql.ErrNoRows
}
