package api

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	ical "github.com/arran4/golang-ical"
	"github.com/danielgtaylor/huma/v2"
	"roomark/internal/store"
)

type feedInput struct {
	Headers
	FeedToken string `path:"feedToken"`
}
type downloadOutput struct {
	ContentType        string `header:"Content-Type"`
	ContentDisposition string `header:"Content-Disposition"`
	CacheControl       string `header:"Cache-Control"`
	// Body contains the raw exported file bytes.
	Body []byte
}

func registerDownload[I any](api huma.API, svc *Service, path, op, mimeType, filename string) {
	mediaType := strings.Split(mimeType, ";")[0]
	huma.Register(api, huma.Operation{OperationID: op, Method: http.MethodGet, Path: path,
		Responses: map[string]*huma.Response{"200": {Description: "Exported file", Content: map[string]*huma.MediaType{mediaType: {Schema: &huma.Schema{Type: "string", Format: "binary"}}}}},
		Errors:    []int{401, 403, 404, 422, 429, 500}}, func(ctx context.Context, input *I) (*downloadOutput, error) {
		if svc == nil {
			return nil, problem(503, "unavailable", "服务暂不可用")
		}
		result, err := svc.dispatch(ctx, op, convertInput(input))
		if err != nil {
			return nil, err
		}
		return &downloadOutput{ContentType: mimeType, ContentDisposition: fmt.Sprintf("attachment; filename=%q", filename), CacheControl: "private, no-store", Body: result.([]byte)}, nil
	})
}

func registerDownloads(api huma.API, svc *Service) {
	registerDownload[rootInput](api, svc, "/api/admin/stats/export.csv", "export-csv", "text/csv; charset=utf-8", "roomark.csv")
	registerDownload[roomInput](api, svc, "/ical/{slug}", "ical-room", "text/calendar; charset=utf-8", "room.ics")
	registerDownload[feedInput](api, svc, "/ical/person/{feedToken}", "ical-person", "text/calendar; charset=utf-8", "personal.ics")
}

func csvSafe(value string) string {
	trimmed := strings.TrimLeft(value, " \t\r\n")
	if strings.HasPrefix(trimmed, "=") || strings.HasPrefix(trimmed, "+") || strings.HasPrefix(trimmed, "-") || strings.HasPrefix(trimmed, "@") {
		return "'" + value
	}
	return value
}

func (s *Service) exportCSV(ctx context.Context, q *store.Queries, r request) ([]byte, error) {
	input, err := s.statisticsInput(ctx, q, r)
	if err != nil {
		return nil, err
	}
	rooms := map[int64]store.Room{}
	people := map[int64]store.Person{}
	for _, room := range input.Rooms {
		rooms[room.ID] = room
	}
	for _, person := range input.People {
		people[person.ID] = person
	}
	buffer := *bytes.NewBufferString("\xef\xbb\xbf")
	writer := csv.NewWriter(&buffer)
	if err := writer.Write([]string{"预约编号", "会议室", "姓名", "身份", "类型", "用途", "开始时间", "结束时间", "计划结束", "状态", "重复编号", "创建时间", "取消时间", "提前释放分钟"}); err != nil {
		return nil, err
	}
	for _, row := range input.Bookings {
		room := rooms[row.RoomID]
		person := people[row.PersonID.Int64]
		if input.Room != "" && room.Slug != input.Room || input.Role != "" && input.Role != "all" && person.Role != input.Role || row.StartAt < input.From.Unix() || row.StartAt >= input.To.Unix() {
			continue
		}
		cancelled := ""
		if row.CancelledAt.Valid {
			cancelled = timestamp(row.CancelledAt.Int64).Format("2006-01-02T15:04:05Z07:00")
		}
		series := ""
		if row.SeriesID.Valid {
			series = strconv.FormatInt(row.SeriesID.Int64, 10)
		}
		if err := writer.Write([]string{strconv.FormatInt(row.ID, 10), csvSafe(room.Slug), csvSafe(person.Name), person.Role, row.Kind, csvSafe(row.Title), timestamp(row.StartAt).Format("2006-01-02T15:04:05Z07:00"), timestamp(row.EndAt).Format("2006-01-02T15:04:05Z07:00"), timestamp(row.PlannedEndAt).Format("2006-01-02T15:04:05Z07:00"), row.Status, series, timestamp(row.CreatedAt).Format("2006-01-02T15:04:05Z07:00"), cancelled, strconv.FormatInt(max(0, row.PlannedEndAt-row.EndAt)/60, 10)}); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func (s *Service) calendar(ctx context.Context, q *store.Queries, op string, r request) ([]byte, error) {
	roomID, personID := int64(0), int64(0)
	if op == "ical-room" {
		if !strings.HasSuffix(r.slug, ".ics") {
			return nil, problem(404, "not_found", "订阅不存在")
		}
		if r.K != "" {
			r.RoomToken = r.K
		}
		room, err := s.roomAccess(ctx, q, strings.TrimSuffix(r.slug, ".ics"), r, store.Person{})
		if err != nil {
			return nil, err
		}
		roomID = room.ID
	} else {
		if !strings.HasSuffix(r.feed, ".ics") {
			return nil, problem(404, "not_found", "订阅不存在")
		}
		person, err := q.PersonByFeed(ctx, strings.TrimSuffix(r.feed, ".ics"))
		if err != nil {
			return nil, err
		}
		personID = person.ID
	}
	rows, err := q.ListBookings(ctx)
	if err != nil {
		return nil, err
	}
	rooms, err := q.ListRooms(ctx)
	if err != nil {
		return nil, err
	}
	people, err := q.AllPeople(ctx)
	if err != nil {
		return nil, err
	}
	roomMap := map[int64]store.Room{}
	personMap := map[int64]store.Person{}
	for _, room := range rooms {
		roomMap[room.ID] = room
	}
	for _, person := range people {
		personMap[person.ID] = person
	}
	calendar := ical.NewCalendar()
	calendar.SetProductId("-//Roomark//Meeting Rooms//ZH")
	calendar.SetMethod(ical.MethodPublish)
	calendar.SetXPublishedTTL("PT30M")
	for _, row := range rows {
		if roomID != 0 && row.RoomID != roomID || personID != 0 && row.PersonID.Int64 != personID {
			continue
		}
		event := calendar.AddEvent(fmt.Sprintf("booking-%d@roomark", row.ID))
		event.SetCreatedTime(timestamp(row.CreatedAt))
		event.SetDtStampTime(timestamp(row.UpdatedAt))
		event.SetLastModifiedAt(timestamp(row.UpdatedAt))
		event.SetStartAt(timestamp(row.StartAt).UTC())
		event.SetEndAt(timestamp(row.EndAt).UTC())
		event.SetLocation(roomMap[row.RoomID].Name + " " + roomMap[row.RoomID].Location)
		event.SetSummary(personMap[row.PersonID.Int64].Name + " " + row.Title)
		event.SetDescription(row.Title)
		if row.Status == "cancelled" {
			event.SetStatus(ical.ObjectStatusCancelled)
		} else {
			event.SetStatus(ical.ObjectStatusConfirmed)
		}
	}
	return []byte(calendar.Serialize()), nil
}
