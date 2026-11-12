// Package api serves Roomark's typed HTTP API and business operations.
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
	"roomark/internal/domain"
)

// Problem extends RFC 9457 with stable application error information.
type Problem struct {
	huma.ErrorModel
	// Code is a stable machine-readable failure code.
	Code string `json:"code"`
	// Violations lists the failed booking rules.
	Violations []domain.Violation `json:"violations,omitempty"`
	*domain.Conflict
	// Occurrences contains concrete expanded reservations.
	Occurrences []domain.Occurrence `json:"occurrences,omitempty"`
	// LockedUntil is the end of the identity lockout.
	LockedUntil *time.Time `json:"lockedUntil,omitempty"`
	persist     bool
}

// Error returns the human-readable failure detail.
func (p *Problem) Error() string { return p.Detail }

// GetStatus returns the HTTP problem status.
func (p *Problem) GetStatus() int { return p.Status }

func problem(status int, code, detail string) *Problem {
	return &Problem{ErrorModel: huma.ErrorModel{Type: "about:blank", Status: status, Title: http.StatusText(status), Detail: detail}, Code: code}
}

func init() {
	huma.NewError = func(status int, message string, errs ...error) huma.StatusError {
		p := problem(status, "invalid_request", "请求格式不正确")
		for _, err := range errs {
			if detail, ok := err.(huma.ErrorDetailer); ok {
				p.Errors = append(p.Errors, detail.ErrorDetail())
			}
		}
		return p
	}
}

// Headers and filters are shared across operations; unused query fields are ignored.
type Headers struct {
	// Authorization carries the bearer session header.
	Authorization string `header:"Authorization"`
	// RoomToken carries the room access-token header.
	RoomToken string `header:"X-Room-Token"`
	// Room selects a room or contains its metadata.
	Room string `query:"room"`
	// From is the inclusive date-range start.
	From string `query:"from"`
	// To is the inclusive requested date-range end or exclusive internal range boundary.
	To string `query:"to"`
	// Role is the teacher, student or other identity category.
	Role string `query:"role" enum:"all,teacher,student,other"`
	// PersonID selects a person by identifier.
	PersonID int64 `query:"personId"`
	// Status is the reservation or preview state.
	Status string `query:"status" enum:"confirmed,cancelled"`
	// Past selects completed or cancelled personal reservations.
	Past bool `query:"past" default:"false"`
	// Weeks sets the historical heatmap lookback.
	Weeks int `query:"weeks" default:"8" minimum:"1" maximum:"104"`
	// K carries the iCal room-token query value.
	K string `query:"k"`
}

// TimeRange is a proposed interval in RFC 3339.
type TimeRange struct {
	// Start is the reservation start instant.
	Start time.Time `json:"start"`
	// End is the effective reservation end instant.
	End time.Time `json:"end"`
}

// CheckRange is a live availability check that may ignore the booking being edited.
type CheckRange struct {
	TimeRange
	// ExcludeBookingID ignores this booking when looking for conflicts and active-booking limits.
	ExcludeBookingID int64 `json:"excludeBookingId,omitempty"`
}

// CreateBooking is a single booking request.
type CreateBooking struct {
	TimeRange
	// Title is the plain-text meeting or banner title.
	Title string `json:"title,omitempty" maxLength:"200"`
	// ConflictEventID attributes a subsequently accepted suggestion.
	ConflictEventID int64 `json:"conflictEventId,omitempty"`
	// OnBehalfOf selects the booker for an administrative reservation.
	OnBehalfOf int64 `json:"onBehalfOf,omitempty"`
	// Kind distinguishes normal reservations from administrative blocks.
	Kind string `json:"kind,omitempty" enum:"normal,block"`
}

// Quick requests immediate use for a supported number of minutes.
type Quick struct {
	// Minutes is the requested quick-use or extension duration.
	Minutes int `json:"minutes" enum:"30,60,90,120"`
}

// Extend requests an extension of an ongoing booking.
type Extend struct {
	// Minutes is the requested quick-use or extension duration.
	Minutes int `json:"minutes" enum:"15,30,60"`
}

// RuleInput requests a recurring preview.
type RuleInput struct {
	// Rule contains the recurrence pattern.
	Rule domain.SeriesRule `json:"rule"`
	// OnBehalfOf selects the booker for an administrative reservation.
	OnBehalfOf int64 `json:"onBehalfOf,omitempty"`
	// Kind distinguishes normal reservations from administrative blocks.
	Kind string `json:"kind,omitempty" enum:"normal,block"`
}

// CreateSeries is a recurring series with explicit overrides.
type CreateSeries struct {
	RuleInput
	// Title is the plain-text meeting or banner title.
	Title string `json:"title,omitempty" maxLength:"200"`
	// Overrides contains per-date recurrence decisions.
	Overrides []domain.Override `json:"overrides"`
}

// EditBooking updates one occurrence or the following occurrences.
type EditBooking struct {
	// Start is the reservation start instant.
	Start *time.Time `json:"start,omitempty"`
	// End is the effective reservation end instant.
	End *time.Time `json:"end,omitempty"`
	// Title is the plain-text meeting or banner title.
	Title *string `json:"title,omitempty" maxLength:"200"`
	// Scope selects this occurrence or this and following occurrences.
	Scope string `json:"scope,omitempty" enum:"this,following"`
}

// Scope selects a single or following occurrences.
type Scope struct {
	// Scope selects this occurrence or this and following occurrences.
	Scope string `json:"scope,omitempty" enum:"this,following"`
}

// Login authenticates an existing identity by ID or name.
type Login struct {
	// PersonID selects a person by identifier.
	PersonID int64 `json:"personId,omitempty"`
	// Name is the displayed person or room name.
	Name string `json:"name,omitempty" maxLength:"80"`
	// Passcode contains the initial or authentication numeric passcode.
	Passcode string `json:"passcode" pattern:"^([0-9]{4}|[0-9]{6})$"`
}

// Passcode chooses an initial numeric passcode.
type Passcode struct {
	// Passcode contains the initial or authentication numeric passcode.
	Passcode string `json:"passcode" pattern:"^([0-9]{4}|[0-9]{6})$"`
}

// SelfPerson registers a custom identity.
type SelfPerson struct {
	Passcode
	// Name is the displayed person or room name.
	Name string `json:"name" minLength:"1" maxLength:"80"`
}

// ChangePasscode verifies the current passcode before replacing it.
type ChangePasscode struct {
	// Current is the ongoing reservation.
	Current string `json:"current"`
	// Next is the replacement numeric passcode.
	Next string `json:"next" pattern:"^([0-9]{4}|[0-9]{6})$"`
}

// RoomInput creates a room with optional default booking rules.
type RoomInput struct {
	// Slug is the URL-safe room identifier.
	Slug string `json:"slug" pattern:"^[a-zA-Z0-9_-]+$" maxLength:"80"`
	// Name is the displayed person or room name.
	Name string `json:"name" minLength:"1" maxLength:"100"`
	// Location is the human-readable room location.
	Location string `json:"location" maxLength:"200"`
	// Capacity is the room seating capacity.
	Capacity int `json:"capacity" minimum:"0"`
	// Description is the room description.
	Description string `json:"description" maxLength:"4000"`
	// Rules contains the room-specific booking limits.
	Rules *domain.Rules `json:"rules,omitempty"`
}

// EditRoom updates only supplied room fields.
type EditRoom struct {
	// Slug is the URL-safe room identifier.
	Slug *string `json:"slug,omitempty" pattern:"^[a-zA-Z0-9_-]+$"`
	// Name is the displayed person or room name.
	Name *string `json:"name,omitempty" minLength:"1" maxLength:"100"`
	// Location is the human-readable room location.
	Location *string `json:"location,omitempty" maxLength:"200"`
	// Capacity is the room seating capacity.
	Capacity *int `json:"capacity,omitempty" minimum:"0"`
	// Description is the room description.
	Description *string `json:"description,omitempty" maxLength:"4000"`
	// Rules contains the room-specific booking limits.
	Rules *domain.Rules `json:"rules,omitempty"`
	// Archived marks a room unavailable for new bookings.
	Archived *bool `json:"archived,omitempty"`
}

// PresetPerson creates a roster entry, initially without a passcode.
type PresetPerson struct {
	// Name is the displayed person or room name.
	Name string `json:"name" minLength:"1" maxLength:"80"`
	// Role is the teacher, student or other identity category.
	Role string `json:"role" enum:"teacher,student,other"`
	// IsAdmin grants administrative access.
	IsAdmin bool `json:"isAdmin"`
}

// EditPerson updates roster metadata.
type EditPerson struct {
	// Name is the displayed person or room name.
	Name *string `json:"name,omitempty" minLength:"1" maxLength:"80"`
	// Role is the teacher, student or other identity category.
	Role *string `json:"role,omitempty" enum:"teacher,student,other"`
	// IsAdmin grants administrative access.
	IsAdmin *bool `json:"isAdmin,omitempty"`
}

// ImportPeople imports a roster atomically.
type ImportPeople struct {
	// People contains roster input or source identities.
	People []PresetPerson `json:"people" minItems:"1" maxItems:"1000"`
}

// AnnouncementInput creates a room-specific or global banner.
type AnnouncementInput struct {
	// RoomSlug identifies the room by its public slug.
	RoomSlug string `json:"roomSlug,omitempty"`
	// Title is the plain-text meeting or banner title.
	Title string `json:"title" minLength:"1" maxLength:"200"`
	// Body contains plain-text announcement content.
	Body string `json:"body" maxLength:"10000"`
	// StartsAt is the banner activation instant.
	StartsAt time.Time `json:"startsAt"`
	// EndsAt is the banner expiration instant.
	EndsAt time.Time `json:"endsAt"`
	// Pinned prioritizes the banner.
	Pinned bool `json:"pinned"`
}

// EditAnnouncement updates only provided banner fields.
type EditAnnouncement struct {
	// RoomSlug identifies the room by its public slug.
	RoomSlug *string `json:"roomSlug,omitempty"`
	// Title is the plain-text meeting or banner title.
	Title *string `json:"title,omitempty" minLength:"1" maxLength:"200"`
	// Body contains plain-text announcement content.
	Body *string `json:"body,omitempty" maxLength:"10000"`
	// StartsAt is the banner activation instant.
	StartsAt *time.Time `json:"startsAt,omitempty"`
	// EndsAt is the banner expiration instant.
	EndsAt *time.Time `json:"endsAt,omitempty"`
	// Pinned prioritizes the banner.
	Pinned *bool `json:"pinned,omitempty"`
}

// QR describes the door link and its token version.
type QR struct {
	// URL is the public room QR destination.
	URL string `json:"url"`
	// TokenRotatedAt is the last room-token rotation instant.
	TokenRotatedAt time.Time `json:"tokenRotatedAt"`
}

// Feed provides a secret personal calendar URL.
type Feed struct {
	// PersonFeedURL is the personal iCal subscription URL.
	PersonFeedURL string `json:"personFeedUrl"`
}

// TokenResult returns a freshly rotated access token.
type TokenResult struct {
	// Token is the newly issued bearer secret.
	Token string `json:"token"`
	// TokenRotatedAt is the last room-token rotation instant.
	TokenRotatedAt time.Time `json:"tokenRotatedAt"`
}

// Success acknowledges a completed mutation.
type Success struct {
	// OK indicates successful validation or mutation.
	OK bool `json:"ok"`
}

type rootInput struct{ Headers }
type roomInput struct {
	Headers
	// Slug is the URL-safe room identifier.
	Slug string `path:"slug"`
}
type idInput struct {
	Headers
	// ID identifies this record.
	ID int64 `path:"id"`
}
type rootBody[B any] struct {
	Headers
	// Body is the typed JSON request or response payload.
	Body B
}
type roomBody[B any] struct {
	Headers
	// Slug is the URL-safe room identifier.
	Slug string `path:"slug"`
	// Body is the typed JSON request or response payload.
	Body B
}
type idBody[B any] struct {
	Headers
	// ID identifies this record.
	ID int64 `path:"id"`
	// Body is the typed JSON request or response payload.
	Body B
}
type response[T any] struct{ Body T }

type request struct {
	Headers
	slug string
	id   int64
	feed string
	body any
}

func convertInput(input any) request {
	encoded, err := json.Marshal(input)
	if err != nil {
		panic(err)
	}
	var flat struct {
		Headers
		Slug      string
		ID        int64
		FeedToken string
		Body      json.RawMessage
	}
	if err := json.Unmarshal(encoded, &flat); err != nil {
		panic(err)
	}
	return request{Headers: flat.Headers, slug: flat.Slug, id: flat.ID, feed: flat.FeedToken, body: flat.Body}
}

func bodyAs[T any](r request) (T, error) {
	var body T
	data, ok := r.body.(json.RawMessage)
	if !ok {
		return body, problem(400, "invalid_request", "请求格式不正确")
	}
	if err := json.Unmarshal(data, &body); err != nil {
		return body, problem(400, "invalid_request", "请求格式不正确")
	}
	return body, nil
}

func register[I, O any](api huma.API, svc *Service, method, path, id string, status int) {
	huma.Register(api, huma.Operation{OperationID: id, Method: method, Path: path, DefaultStatus: status,
		Errors: []int{400, 401, 403, 404, 409, 422, 423, 429, 500}, MaxBodyBytes: 1 << 20},
		func(ctx context.Context, input *I) (*response[O], error) {
			if svc == nil {
				return nil, problem(503, "unavailable", "服务暂不可用")
			}
			result, err := svc.dispatch(ctx, id, convertInput(input))
			if err != nil {
				return nil, err
			}
			return &response[O]{Body: result.(O)}, nil
		})
}

// New registers every business operation and returns its OpenAPI contract.
func New(mux *http.ServeMux, svc *Service) huma.API {
	config := huma.DefaultConfig("Roomark API", "1.0.0")
	config.DocsPath = "/api/docs"
	config.OpenAPIPath = "/api/openapi"
	config.SchemasPath = "/api/schemas"
	api := humago.New(mux, config)
	registerRoutes(api, svc)
	registerDownloads(api, svc)
	return api
}
