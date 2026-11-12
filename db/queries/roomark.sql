-- name: ListRooms :many
SELECT * FROM rooms ORDER BY slug;
-- name: RoomBySlug :one
SELECT * FROM rooms WHERE slug=?;
-- name: RoomByID :one
SELECT * FROM rooms WHERE id=?;
-- name: RoomByToken :one
SELECT * FROM rooms WHERE access_token=? AND archived_at IS NULL;
-- name: CreateRoom :one
INSERT INTO rooms(slug,name,location,capacity,description,access_token,token_rotated_at,open_time,close_time,max_duration_min,max_advance_days,max_active_per_person,recurring_max_weeks,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *;
-- name: UpdateRoom :one
UPDATE rooms SET slug=?,name=?,location=?,capacity=?,description=?,open_time=?,close_time=?,max_duration_min=?,max_advance_days=?,max_active_per_person=?,recurring_max_weeks=?,archived_at=? WHERE id=? RETURNING *;
-- name: RotateRoomToken :one
UPDATE rooms SET access_token=?,token_rotated_at=? WHERE id=? RETURNING *;
-- name: ListPeople :many
SELECT * FROM people WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE;
-- name: AllPeople :many
SELECT * FROM people ORDER BY id;
-- name: PersonByID :one
SELECT * FROM people WHERE id=? AND deleted_at IS NULL;
-- name: PersonByName :one
SELECT * FROM people WHERE name=? COLLATE NOCASE AND deleted_at IS NULL;
-- name: PersonByFeed :one
SELECT * FROM people WHERE feed_token=? AND deleted_at IS NULL;
-- name: AdminCount :one
SELECT COUNT(*) FROM people WHERE is_admin=1 AND deleted_at IS NULL;
-- name: CreatePerson :one
INSERT INTO people(name,role,is_admin,passcode_hash,feed_token,source,created_at) VALUES(?,?,?,?,?,?,?) RETURNING *;
-- name: UpdatePerson :one
UPDATE people SET name=?,role=?,is_admin=? WHERE id=? AND deleted_at IS NULL RETURNING *;
-- name: DeletePerson :exec
UPDATE people SET deleted_at=? WHERE id=?;
-- name: SetPasscode :exec
UPDATE people SET passcode_hash=?,failed_attempts=0,locked_until=0 WHERE id=?;
-- name: FailedLogin :exec
UPDATE people SET failed_attempts=?,locked_until=? WHERE id=?;
-- name: CreateSession :exec
INSERT INTO sessions(token_hash,person_id,created_at,last_used_at,expires_at) VALUES(?,?,?,?,?);
-- name: GetSession :one
SELECT * FROM sessions WHERE token_hash=? AND expires_at>?;
-- name: TouchSession :exec
UPDATE sessions SET last_used_at=?,expires_at=? WHERE id=?;
-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash=?;
-- name: RevokeSessions :exec
DELETE FROM sessions WHERE person_id=?;
-- name: ListBookings :many
SELECT * FROM bookings ORDER BY start_at,id;
-- name: BookingByID :one
SELECT * FROM bookings WHERE id=?;
-- name: CreateBooking :one
INSERT INTO bookings(room_id,person_id,series_id,kind,title,start_at,end_at,planned_end_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *;
-- name: UpdateBooking :one
UPDATE bookings SET start_at=?,end_at=?,planned_end_at=?,title=?,updated_at=? WHERE id=? RETURNING *;
-- name: CancelBooking :exec
UPDATE bookings SET status='cancelled',cancelled_at=?,cancelled_by=?,updated_at=? WHERE id=?;
-- name: ListSeries :many
SELECT * FROM series ORDER BY id;
-- name: CreateSeries :one
INSERT INTO series(room_id,person_id,kind,title,rule_json,created_at) VALUES(?,?,?,?,?,?) RETURNING *;
-- name: ListAnnouncements :many
SELECT * FROM announcements ORDER BY pinned DESC,starts_at DESC;
-- name: AnnouncementByID :one
SELECT * FROM announcements WHERE id=?;
-- name: CreateAnnouncement :one
INSERT INTO announcements(room_id,title,body,starts_at,ends_at,pinned,created_at) VALUES(?,?,?,?,?,?,?) RETURNING *;
-- name: UpdateAnnouncement :one
UPDATE announcements SET room_id=?,title=?,body=?,starts_at=?,ends_at=?,pinned=? WHERE id=? RETURNING *;
-- name: DeleteAnnouncement :exec
DELETE FROM announcements WHERE id=?;
-- name: ListConflictEvents :many
SELECT * FROM conflict_events ORDER BY id;
-- name: OpenConflict :one
SELECT * FROM conflict_events WHERE room_id=? AND person_id IS ? AND requested_start=? AND requested_end=? AND source=? AND accepted_booking_id IS NULL AND created_at>=? ORDER BY id DESC LIMIT 1;
-- name: CreateConflict :one
INSERT INTO conflict_events(room_id,person_id,requested_start,requested_end,source,created_at) VALUES(?,?,?,?,?,?) RETURNING *;
-- name: AcceptSuggestion :execrows
UPDATE conflict_events SET accepted_booking_id=? WHERE id=? AND room_id=? AND person_id=? AND accepted_booking_id IS NULL;
-- name: RevokeOtherSessions :exec
DELETE FROM sessions WHERE person_id=? AND token_hash!=?;
-- name: GetPreview :one
SELECT * FROM booking_previews WHERE preview_key=?;
-- name: SetPreview :exec
INSERT INTO booking_previews(preview_key,signature,created_at) VALUES(?,?,?) ON CONFLICT(preview_key) DO UPDATE SET signature=excluded.signature,created_at=excluded.created_at;
-- name: DeletePreview :exec
DELETE FROM booking_previews WHERE preview_key=?;
-- name: ExpirePreviews :exec
DELETE FROM booking_previews WHERE created_at<?;
