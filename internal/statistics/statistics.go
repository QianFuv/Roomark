// Package statistics computes booking metrics over explicit local date ranges.
package statistics

import (
	"slices"
	"sort"
	"time"

	"roomark/internal/domain"
	"roomark/internal/rules"
	"roomark/internal/store"
)

// Input contains an immutable storage snapshot and an exclusive date range.
type Input struct {
	// Rooms contains the source room metadata.
	Rooms []store.Room
	// People contains roster input or source identities.
	People []store.Person
	// Bookings counts reservations or contains source reservation rows.
	Bookings []store.Booking
	// Conflicts contains recorded conflicting requests.
	Conflicts []store.ConflictEvent
	// From is the inclusive date-range start.
	From time.Time
	// To is the exclusive upper instant of the statistics range.
	To time.Time
	// Now is the explicit evaluation instant.
	Now time.Time
	// Room selects a room or contains its metadata.
	Room string
	// Role is the teacher, student or other identity category.
	Role string
}

func ratio(numerator, denominator float64) float64 {
	if denominator <= 0 {
		return 0
	}
	return numerator / denominator
}

func overlapSeconds(start, end, from, to time.Time) float64 {
	if start.Before(from) {
		start = from
	}
	if end.After(to) {
		end = to
	}
	return max(0, end.Sub(start).Seconds())
}

func selectedRooms(input Input) map[int64]store.Room {
	result := map[int64]store.Room{}
	for _, room := range input.Rooms {
		if input.Room == "" || room.Slug == input.Room {
			result[room.ID] = room
		}
	}
	return result
}

func openSeconds(input Input, from, to time.Time) float64 {
	total := float64(0)
	for _, room := range selectedRooms(input) {
		for day := rules.Day(from); day.Before(to); day = day.AddDate(0, 0, 1) {
			if day.AddDate(0, 0, 1).Unix() <= room.CreatedAt {
				continue
			}
			open, err := rules.At(day, room.OpenTime)
			if err != nil {
				continue
			}
			closeTime, err := rules.At(day, room.CloseTime)
			if err != nil {
				continue
			}
			if room.CreatedAt > open.Unix() {
				open = timestamp(room.CreatedAt)
			}
			if room.ArchivedAt.Valid && room.ArchivedAt.Int64 < closeTime.Unix() {
				closeTime = timestamp(room.ArchivedAt.Int64)
			}
			total += overlapSeconds(open, closeTime, from, to)
		}
	}
	return total
}

func timestamp(value int64) time.Time { return time.Unix(value, 0).In(rules.Shanghai) }

func matching(input Input) ([]store.Booking, map[int64]store.Person) {
	rooms := selectedRooms(input)
	people := map[int64]store.Person{}
	for _, person := range input.People {
		people[person.ID] = person
	}
	bookings := []store.Booking{}
	for _, booking := range input.Bookings {
		if _, exists := rooms[booking.RoomID]; !exists || booking.Kind != "normal" {
			continue
		}
		if input.Role != "" && input.Role != "all" && people[booking.PersonID.Int64].Role != input.Role {
			continue
		}
		bookings = append(bookings, booking)
	}
	return bookings, people
}

func overview(input Input, from, to time.Time) domain.Overview {
	bookings, _ := matching(input)
	result := domain.Overview{}
	people := map[int64]bool{}
	for _, booking := range bookings {
		if booking.Status != "confirmed" {
			continue
		}
		start, end := timestamp(booking.StartAt), timestamp(min(booking.EndAt, input.Now.Unix()))
		if booking.StartAt >= from.Unix() && booking.StartAt < to.Unix() {
			result.Bookings++
		}
		used := overlapSeconds(start, end, from, to)
		result.UsedHours += used / 3600
		if used > 0 && booking.PersonID.Valid {
			people[booking.PersonID.Int64] = true
		}
	}
	result.DistinctPeople = len(people)
	if to.After(input.Now) {
		to = input.Now
	}
	if to.After(from) {
		result.Utilization = ratio(result.UsedHours*3600, openSeconds(input, from, to))
	}
	return result
}

// Heatmap measures weekday-hour occupancy divided by actual open exposure.
func Heatmap(input Input, includeBlocks bool) [7][14]float64 {
	var occupied, exposure [7][14]float64
	rooms := selectedRooms(input)
	people := map[int64]store.Person{}
	for _, person := range input.People {
		people[person.ID] = person
	}
	for day := rules.Day(input.From); day.Before(input.To); day = day.AddDate(0, 0, 1) {
		weekday := (int(day.Weekday()) + 6) % 7
		for hour := 8; hour < 22; hour++ {
			begin := day.Add(time.Duration(hour) * time.Hour)
			end := begin.Add(time.Hour)
			if end.After(input.Now) {
				end = input.Now
			}
			if end.After(input.To) {
				end = input.To
			}
			if begin.Before(input.From) {
				begin = input.From
			}
			for _, room := range rooms {
				open, err := rules.At(day, room.OpenTime)
				if err != nil {
					continue
				}
				closeTime, err := rules.At(day, room.CloseTime)
				if err != nil {
					continue
				}
				if room.CreatedAt > open.Unix() {
					open = timestamp(room.CreatedAt)
				}
				if room.ArchivedAt.Valid && room.ArchivedAt.Int64 < closeTime.Unix() {
					closeTime = timestamp(room.ArchivedAt.Int64)
				}
				windowStart, windowEnd := begin, end
				if open.After(windowStart) {
					windowStart = open
				}
				if closeTime.Before(windowEnd) {
					windowEnd = closeTime
				}
				exposure[weekday][hour-8] += max(0, windowEnd.Sub(windowStart).Seconds())
				for _, booking := range input.Bookings {
					if booking.RoomID != room.ID || booking.Status != "confirmed" || !includeBlocks && booking.Kind == "block" {
						continue
					}
					if input.Role != "" && input.Role != "all" && people[booking.PersonID.Int64].Role != input.Role {
						continue
					}
					occupied[weekday][hour-8] += overlapSeconds(timestamp(booking.StartAt), timestamp(booking.EndAt), windowStart, windowEnd)
				}
			}
		}
	}
	var result [7][14]float64
	for weekday := range result {
		for hour := range result[weekday] {
			result[weekday][hour] = min(1, ratio(occupied[weekday][hour], exposure[weekday][hour]))
		}
	}
	return result
}

// Calculate returns all administrative statistics including period comparison.
func Calculate(input Input) domain.Stats {
	span := input.To.Sub(input.From)
	previousFrom := input.From.Add(-span)
	result := domain.Stats{Overview: overview(input, input.From, input.To), Previous: overview(input, previousFrom, input.From), Trend: []domain.TrendPoint{}, Granularity: "day", Habits: domain.Habits{Duration: []domain.Bucket{{Label: "≤30m"}, {Label: "≤1h"}, {Label: "≤2h"}, {Label: "≤3h"}, {Label: "≤4h"}, {Label: ">4h"}}, LeadTime: []domain.Bucket{{Label: "same_day"}, {Label: "1–3_days"}, {Label: "4–7_days"}, {Label: ">7_days"}}}, DemandGap: domain.DemandGap{TopSlots: []domain.ConflictSlot{}}, PeopleRanking: domain.Ranking{ByUsedHours: []domain.RankingEntry{}, ByBookingCount: []domain.RankingEntry{}}}
	step := 1
	if span > 62*24*time.Hour {
		step = 7
		result.Granularity = "week"
	}
	for start := input.From; start.Before(input.To); start = start.AddDate(0, 0, step) {
		end := start.AddDate(0, 0, step)
		if end.After(input.To) {
			end = input.To
		}
		result.Trend = append(result.Trend, domain.TrendPoint{Date: start.Format("2006-01-02"), Utilization: overview(input, start, end).Utilization, PreviousUtilization: overview(input, start.Add(-span), end.Add(-span)).Utilization})
	}
	result.Heatmap = Heatmap(input, false)
	bookings, people := matching(input)
	total, cancelled, lastMinute, earlyCount, released := 0, 0, 0, 0, int64(0)
	rankings := map[int64]*domain.RankingEntry{}
	for _, booking := range bookings {
		if booking.StartAt < input.From.Unix() || booking.StartAt >= input.To.Unix() {
			continue
		}
		total++
		if booking.Status == "cancelled" {
			cancelled++
			if booking.CancelledAt.Valid && booking.StartAt-booking.CancelledAt.Int64 < 3600 && booking.CancelledAt.Int64 <= booking.StartAt {
				lastMinute++
			}
			continue
		}
		if booking.EndAt < booking.PlannedEndAt {
			earlyCount++
			released += booking.PlannedEndAt - booking.EndAt
		}
		duration := (booking.PlannedEndAt - booking.StartAt) / 60
		index := 5
		for bucket, limit := range []int64{30, 60, 120, 180, 240} {
			if duration <= limit {
				index = bucket
				break
			}
		}
		result.Habits.Duration[index].Count++
		lead := int(rules.Day(timestamp(booking.StartAt)).Sub(rules.Day(timestamp(booking.CreatedAt))).Hours() / 24)
		leadIndex := 3
		switch {
		case lead <= 0:
			leadIndex = 0
		case lead <= 3:
			leadIndex = 1
		case lead <= 7:
			leadIndex = 2
		}
		result.Habits.LeadTime[leadIndex].Count++
		if booking.SeriesID.Valid {
			result.Habits.Recurring++
		} else {
			result.Habits.Single++
		}
		person := people[booking.PersonID.Int64]
		entry := rankings[person.ID]
		if entry == nil {
			entry = &domain.RankingEntry{Person: domain.Booker{ID: person.ID, Name: person.Name, Role: person.Role}}
			rankings[person.ID] = entry
		}
		entry.Bookings++
		entry.UsedHours += overlapSeconds(timestamp(booking.StartAt), timestamp(min(booking.EndAt, input.Now.Unix())), input.From, input.To) / 3600
	}
	result.Cancellations = domain.Cancellations{CancelRate: ratio(float64(cancelled), float64(total)), LastMinuteRate: ratio(float64(lastMinute), float64(cancelled)), EarlyEndCount: earlyCount, AverageReleasedMinutes: ratio(float64(released)/60, float64(earlyCount))}
	for _, entry := range rankings {
		result.PeopleRanking.ByUsedHours = append(result.PeopleRanking.ByUsedHours, *entry)
	}
	sort.Slice(result.PeopleRanking.ByUsedHours, func(i, j int) bool {
		first, second := result.PeopleRanking.ByUsedHours[i], result.PeopleRanking.ByUsedHours[j]
		if first.UsedHours == second.UsedHours {
			return first.Person.ID < second.Person.ID
		}
		return first.UsedHours > second.UsedHours
	})
	result.PeopleRanking.ByBookingCount = slices.Clone(result.PeopleRanking.ByUsedHours)
	sort.SliceStable(result.PeopleRanking.ByBookingCount, func(i, j int) bool {
		return result.PeopleRanking.ByBookingCount[i].Bookings > result.PeopleRanking.ByBookingCount[j].Bookings
	})
	rooms := selectedRooms(input)
	slots := map[[2]int]int{}
	accepted := 0
	for _, event := range input.Conflicts {
		if _, exists := rooms[event.RoomID]; !exists || event.RequestedStart < input.From.Unix() || event.RequestedStart >= input.To.Unix() {
			continue
		}
		if input.Role != "" && input.Role != "all" && people[event.PersonID.Int64].Role != input.Role {
			continue
		}
		result.DemandGap.ConflictCount++
		if event.AcceptedBookingID.Valid {
			accepted++
		}
		start := timestamp(event.RequestedStart)
		for slot := start.Truncate(time.Hour); slot.Before(timestamp(event.RequestedEnd)); slot = slot.Add(time.Hour) {
			slots[[2]int{(int(slot.Weekday())+6)%7 + 1, slot.Hour()}]++
		}
	}
	for slot, count := range slots {
		result.DemandGap.TopSlots = append(result.DemandGap.TopSlots, domain.ConflictSlot{Weekday: slot[0], Hour: slot[1], Count: count})
	}
	sort.Slice(result.DemandGap.TopSlots, func(i, j int) bool {
		first, second := result.DemandGap.TopSlots[i], result.DemandGap.TopSlots[j]
		if first.Count != second.Count {
			return first.Count > second.Count
		}
		if first.Weekday != second.Weekday {
			return first.Weekday < second.Weekday
		}
		return first.Hour < second.Hour
	})
	if len(result.DemandGap.TopSlots) > 10 {
		result.DemandGap.TopSlots = result.DemandGap.TopSlots[:10]
	}
	result.DemandGap.SuggestionAcceptanceRate = ratio(float64(accepted), float64(result.DemandGap.ConflictCount))
	return result
}
