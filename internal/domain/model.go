// Package domain defines the shared Roomark HTTP data contract.
package domain

import "time"

// Rules controls a room's booking limits.
type Rules struct {
	// OpenTime is the local opening clock time.
	OpenTime string `json:"openTime" default:"08:00" pattern:"^[0-2][0-9]:[0-5][0-9]$"`
	// CloseTime is the local closing clock time.
	CloseTime string `json:"closeTime" default:"22:00" pattern:"^[0-2][0-9]:[0-5][0-9]$"`
	// MaxDurationMinutes limits the length of a normal reservation.
	MaxDurationMinutes int `json:"maxDurationMinutes" default:"240" minimum:"15"`
	// MaxAdvanceDays limits the advance date of a single reservation.
	MaxAdvanceDays int `json:"maxAdvanceDays" default:"14" minimum:"0"`
	// MaxActivePerPerson limits active reservations, counting a series once; zero is unlimited.
	MaxActivePerPerson int `json:"maxActivePerPerson" default:"0" minimum:"0"`
	// RecurringMaxWeeks limits the recurring booking horizon.
	RecurringMaxWeeks int `json:"recurringMaxWeeks" default:"20" minimum:"1" maximum:"104"`
}

// DefaultRules returns the product defaults.
func DefaultRules() Rules { return Rules{"08:00", "22:00", 240, 14, 0, 20} }

// Room identifies an available meeting room.
type Room struct {
	// ID identifies this record.
	ID int64 `json:"id"`
	// Slug is the URL-safe room identifier.
	Slug string `json:"slug"`
	// Name is the displayed person or room name.
	Name string `json:"name"`
	// Location is the human-readable room location.
	Location string `json:"location"`
	// Capacity is the room seating capacity.
	Capacity int `json:"capacity"`
	// Description is the room description.
	Description string `json:"description"`
	// Rules contains the room-specific booking limits.
	Rules Rules `json:"rules"`
}

// AdminRoom includes the room's administrative access information.
type AdminRoom struct {
	Room
	// AccessToken is the secret required for room-scoped access.
	AccessToken string `json:"accessToken"`
	// TokenRotatedAt is the last room-token rotation instant.
	TokenRotatedAt time.Time `json:"tokenRotatedAt"`
	// Archived marks a room unavailable for new bookings.
	Archived bool `json:"archived"`
}

// Person is a public identity without authentication secrets.
type Person struct {
	// ID identifies this record.
	ID int64 `json:"id"`
	// Name is the displayed person or room name.
	Name string `json:"name"`
	// Role is the teacher, student or other identity category.
	Role string `json:"role" enum:"teacher,student,other"`
	// IsAdmin grants administrative access.
	IsAdmin bool `json:"isAdmin"`
	// HasPasscode indicates that the identity has been claimed.
	HasPasscode bool `json:"hasPasscode"`
}

// Session is returned once when a person authenticates.
type Session struct {
	// Token is the newly issued bearer secret.
	Token string `json:"token"`
	// Person contains the visible booker identity.
	Person Person `json:"person"`
}

// Booker is the attribution visible on a booking.
type Booker struct {
	// ID identifies this record.
	ID int64 `json:"id"`
	// Name is the displayed person or room name.
	Name string `json:"name"`
	// Role is the teacher, student or other identity category.
	Role string `json:"role"`
}

// SeriesInfo describes a booking's position in a series.
type SeriesInfo struct {
	// ID identifies this record.
	ID int64 `json:"id"`
	// Index is the occurrence position within its series.
	Index int `json:"index"`
	// Total is the concrete occurrence count.
	Total int `json:"total"`
	// RuleSummary is a concise Chinese recurrence label.
	RuleSummary string `json:"ruleSummary"`
}

// Booking is a single concrete room reservation.
type Booking struct {
	// ID identifies this record.
	ID int64 `json:"id"`
	// RoomSlug identifies the room by its public slug.
	RoomSlug string `json:"roomSlug"`
	// Kind distinguishes normal reservations from administrative blocks.
	Kind string `json:"kind" enum:"normal,block"`
	// Title is the plain-text meeting or banner title.
	Title string `json:"title"`
	// Start is the reservation start instant.
	Start time.Time `json:"start"`
	// End is the effective reservation end instant.
	End time.Time `json:"end"`
	// PlannedEnd preserves the planned finish before an early release.
	PlannedEnd time.Time `json:"plannedEnd"`
	// Status is the reservation or preview state.
	Status string `json:"status" enum:"confirmed,cancelled"`
	// Person contains the visible booker identity.
	Person *Booker `json:"person,omitempty"`
	// Series contains recurring reservation metadata or groups.
	Series *SeriesInfo `json:"series,omitempty"`
	// IsMine indicates ownership by the authenticated viewer.
	IsMine bool `json:"isMine"`
	// CanEdit indicates whether the authenticated viewer may modify the reservation.
	CanEdit bool `json:"canEdit"`
	// ReleasedMinutes counts minutes released by ending early.
	ReleasedMinutes int `json:"releasedMinutes"`
}

// RoomStatus is a room's state at the request time.
type RoomStatus struct {
	// State indicates whether the room is free or busy.
	State string `json:"state" enum:"free,busy"`
	// Current is the ongoing reservation.
	Current *Booking `json:"current,omitempty"`
	// Next is the next confirmed reservation.
	Next *Booking `json:"next,omitempty"`
	// FreeUntil bounds the current free interval.
	FreeUntil *time.Time `json:"freeUntil,omitempty"`
	// BusyUntil is the ongoing reservation finish.
	BusyUntil *time.Time `json:"busyUntil,omitempty"`
}

// Suggestion is a conflict-free alternative of equal duration.
type Suggestion struct {
	// Start is the reservation start instant.
	Start time.Time `json:"start"`
	// End is the effective reservation end instant.
	End time.Time `json:"end"`
	// Kind distinguishes normal reservations from administrative blocks.
	Kind string `json:"kind" enum:"same_day,other_day"`
}

// ConflictWith describes the occupied slot without private data.
type ConflictWith struct {
	// Name is the displayed person or room name.
	Name string `json:"name"`
	// Title is the plain-text meeting or banner title.
	Title string `json:"title"`
	// Start is the reservation start instant.
	Start time.Time `json:"start"`
	// End is the effective reservation end instant.
	End time.Time `json:"end"`
}

// Conflict includes alternatives and an acceptance attribution identifier.
type Conflict struct {
	// ConflictWith describes the overlapping reservation.
	ConflictWith ConflictWith `json:"conflictWith"`
	// Suggestions lists equal-duration conflict-free alternatives.
	Suggestions []Suggestion `json:"suggestions"`
	// ConflictEventID attributes a subsequently accepted suggestion.
	ConflictEventID int64 `json:"conflictEventId"`
}

// Violation is a machine-readable booking rule failure.
type Violation struct {
	// Code is a stable machine-readable failure code.
	Code string `json:"code"`
	// Message explains a rule violation in Chinese.
	Message string `json:"message"`
}

// SeriesRule describes weekly or alternate-week occurrences.
type SeriesRule struct {
	// Freq selects weekly or alternate-week recurrence.
	Freq string `json:"freq" enum:"weekly,biweekly"`
	// Weekdays contains ISO weekdays, Monday one through Sunday seven.
	Weekdays []int `json:"weekdays" minItems:"1" maxItems:"7"`
	// StartDate is the inclusive first local date.
	StartDate string `json:"startDate" format:"date"`
	// UntilDate is the optional inclusive final local date.
	UntilDate string `json:"untilDate,omitempty" format:"date"`
	// Count is the requested number of occurrences or bucket observations.
	Count int `json:"count,omitempty" minimum:"1" maximum:"728"`
	// StartTime is the local occurrence start clock time.
	StartTime string `json:"startTime" pattern:"^[0-2][0-9]:[0-5][0-9]$"`
	// EndTime is the local occurrence end clock time.
	EndTime string `json:"endTime" pattern:"^[0-2][0-9]:[0-5][0-9]$"`
}

// Occurrence is an expanded and validated series entry.
type Occurrence struct {
	// Date is the local occurrence or trend date.
	Date string `json:"date"`
	// Start is the reservation start instant.
	Start time.Time `json:"start"`
	// End is the effective reservation end instant.
	End time.Time `json:"end"`
	// Status is the reservation or preview state.
	Status string `json:"status" enum:"ok,conflict,violation"`
	// Conflict contains an overlapping reservation and alternatives.
	Conflict *Conflict `json:"conflict,omitempty"`
	// Violations lists the failed booking rules.
	Violations []Violation `json:"violations,omitempty"`
}

// Override chooses to skip or move one occurrence.
type Override struct {
	// Date is the local occurrence or trend date.
	Date string `json:"date" format:"date"`
	// Action selects skip or move for an occurrence.
	Action string `json:"action" enum:"skip,move"`
	// Start is the reservation start instant.
	Start *time.Time `json:"start,omitempty"`
	// End is the effective reservation end instant.
	End *time.Time `json:"end,omitempty"`
}

// Announcement is a plain-text room or global banner.
type Announcement struct {
	// ID identifies this record.
	ID int64 `json:"id"`
	// RoomSlug identifies the room by its public slug.
	RoomSlug string `json:"roomSlug,omitempty"`
	// Title is the plain-text meeting or banner title.
	Title string `json:"title"`
	// Body contains plain-text announcement content.
	Body string `json:"body"`
	// StartsAt is the banner activation instant.
	StartsAt time.Time `json:"startsAt"`
	// EndsAt is the banner expiration instant.
	EndsAt time.Time `json:"endsAt"`
	// Pinned prioritizes the banner.
	Pinned bool `json:"pinned"`
}

// RoomDetail combines room metadata, live status and active banners.
type RoomDetail struct {
	// Room selects a room or contains its metadata.
	Room Room `json:"room"`
	// Status is the reservation or preview state.
	Status RoomStatus `json:"status"`
	// Announcements contains active visible banners.
	Announcements []Announcement `json:"announcements"`
}

// CheckResult is live booking form validation.
type CheckResult struct {
	// OK indicates successful validation or mutation.
	OK bool `json:"ok"`
	// Violations lists the failed booking rules.
	Violations []Violation `json:"violations"`
	// Conflict contains an overlapping reservation and alternatives.
	Conflict *Conflict `json:"conflict,omitempty"`
}

// Preview contains every expanded occurrence.
type Preview struct {
	// Occurrences contains concrete expanded reservations.
	Occurrences []Occurrence `json:"occurrences"`
}

// SeriesResult describes an atomically created series.
type SeriesResult struct {
	// SeriesID identifies the recurring series.
	SeriesID int64 `json:"seriesId"`
	// Created lists successfully created reservations.
	Created []Booking `json:"created"`
	// Skipped lists local dates omitted from a series.
	Skipped []string `json:"skipped"`
}

// MySeries groups one person's recurring bookings.
type MySeries struct {
	// ID identifies this record.
	ID int64 `json:"id"`
	// RoomSlug identifies the room by its public slug.
	RoomSlug string `json:"roomSlug"`
	// Title is the plain-text meeting or banner title.
	Title string `json:"title"`
	// RuleSummary is a concise Chinese recurrence label.
	RuleSummary string `json:"ruleSummary"`
	// FirstDate is the first displayed local occurrence date.
	FirstDate string `json:"firstDate"`
	// LastDate is the last displayed local occurrence date.
	LastDate string `json:"lastDate"`
	// Remaining counts confirmed future or ongoing occurrences.
	Remaining int `json:"remaining"`
	// Occurrences contains concrete expanded reservations.
	Occurrences []Booking `json:"occurrences"`
}

// MyBookings separates singles from recurring groups.
type MyBookings struct {
	// Singles contains reservations outside a series.
	Singles []Booking `json:"singles"`
	// Series contains recurring reservation metadata or groups.
	Series []MySeries `json:"series"`
}

// RoomHeatmap contains one Shanghai Monday–Sunday week's booked shares by clock hour.
type RoomHeatmap struct {
	// WeekStart is the Monday date in Asia/Shanghai.
	WeekStart string `json:"weekStart" format:"date"`
	// Days lists the seven local dates from Monday through Sunday.
	Days [7]string `json:"days" format:"date"`
	// Hours lists clock hours from the open hour through the last hour starting before close.
	Hours []int `json:"hours"`
	// Cells contains confirmed booking and block minutes clipped to open hours, divided by sixty and capped at one.
	Cells [7][]float64 `json:"cells"`
}

// Overview measures actual elapsed normal room usage.
type Overview struct {
	// Bookings counts reservations or contains source reservation rows.
	Bookings int `json:"bookings"`
	// UsedHours measures elapsed confirmed normal reservation time.
	UsedHours float64 `json:"usedHours"`
	// Utilization is used time divided by the applicable opening time.
	Utilization float64 `json:"utilization"`
	// DistinctPeople counts people with elapsed usage.
	DistinctPeople int `json:"distinctPeople"`
}

// TrendPoint compares a bucket with its previous-period counterpart.
type TrendPoint struct {
	// Date is the local occurrence or trend date.
	Date string `json:"date"`
	// Utilization is used time divided by the applicable opening time.
	Utilization float64 `json:"utilization"`
	// PreviousUtilization is the corresponding previous-period utilization.
	PreviousUtilization float64 `json:"previousUtilization"`
}

// Bucket is a labelled histogram bucket.
type Bucket struct {
	// Label is the bucket or tray text.
	Label string `json:"label"`
	// Count is the requested number of occurrences or bucket observations.
	Count int `json:"count"`
}

// Habits summarizes booking duration, lead time and recurrence.
type Habits struct {
	// Duration contains duration histogram buckets.
	Duration []Bucket `json:"duration"`
	// LeadTime contains date-based advance-booking buckets.
	LeadTime []Bucket `json:"leadTime"`
	// Single counts reservations outside recurring series.
	Single int `json:"single"`
	// Recurring counts recurring reservation occurrences.
	Recurring int `json:"recurring"`
}

// ConflictSlot aggregates requested overlapping slots.
type ConflictSlot struct {
	// Weekday is the ISO weekday number.
	Weekday int `json:"weekday"`
	// Hour is the local clock hour.
	Hour int `json:"hour"`
	// Count is the requested number of occurrences or bucket observations.
	Count int `json:"count"`
}

// DemandGap measures conflicts and subsequent suggestion acceptance.
type DemandGap struct {
	// ConflictCount counts conflicting reservation requests.
	ConflictCount int `json:"conflictCount"`
	// TopSlots ranks the most frequently requested conflicting weekday-hour slots.
	TopSlots []ConflictSlot `json:"topSlots"`
	// SuggestionAcceptanceRate is the accepted suggestion share among recorded conflicts.
	SuggestionAcceptanceRate float64 `json:"suggestionAcceptanceRate"`
}

// Cancellations measures cancelled and released reservations.
type Cancellations struct {
	// CancelRate is cancelled reservations divided by all normal reservations.
	CancelRate float64 `json:"cancelRate"`
	// LastMinuteRate is the share of cancellations made less than one hour before start.
	LastMinuteRate float64 `json:"lastMinuteRate"`
	// EarlyEndCount counts reservations released early.
	EarlyEndCount int `json:"earlyEndCount"`
	// AverageReleasedMinutes is the mean time released by early endings.
	AverageReleasedMinutes float64 `json:"averageReleasedMinutes"`
}

// RankingEntry reports usage for one person, including deleted people.
type RankingEntry struct {
	// Person contains the visible booker identity.
	Person Booker `json:"person"`
	// UsedHours measures elapsed confirmed normal reservation time.
	UsedHours float64 `json:"usedHours"`
	// Bookings counts reservations or contains source reservation rows.
	Bookings int `json:"bookings"`
}

// Ranking contains both explicitly ordered people rankings.
type Ranking struct {
	// ByUsedHours orders people by elapsed usage.
	ByUsedHours []RankingEntry `json:"byUsedHours"`
	// ByBookingCount orders people by confirmed reservation count.
	ByBookingCount []RankingEntry `json:"byBookingCount"`
}

// Stats contains all administrative statistics sections.
type Stats struct {
	// Overview contains current-period key metrics.
	Overview Overview `json:"overview"`
	// Previous contains previous-period key metrics.
	Previous Overview `json:"previous"`
	// Trend contains daily or weekly period comparisons.
	Trend []TrendPoint `json:"trend"`
	// Granularity selects day or week trend buckets.
	Granularity string `json:"granularity" enum:"day,week"`
	// Heatmap contains Monday-first weekday by hour occupancy ratios for hours eight through twenty-one.
	Heatmap [7][14]float64 `json:"heatmap"`
	// Habits contains duration, lead-time and recurrence distributions.
	Habits Habits `json:"habits"`
	// DemandGap contains conflict and suggestion-acceptance metrics.
	DemandGap DemandGap `json:"demandGap"`
	// Cancellations contains cancellation and early-release metrics.
	Cancellations Cancellations `json:"cancellations"`
	// PeopleRanking contains both people rankings.
	PeopleRanking Ranking `json:"peopleRanking"`
}
