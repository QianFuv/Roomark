-- +goose Up
CREATE TABLE rooms (
 id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', capacity INTEGER NOT NULL DEFAULT 0 CHECK(capacity>=0), description TEXT NOT NULL DEFAULT '', access_token TEXT NOT NULL UNIQUE, token_rotated_at INTEGER NOT NULL,
 open_time TEXT NOT NULL DEFAULT '08:00', close_time TEXT NOT NULL DEFAULT '22:00', max_duration_min INTEGER NOT NULL DEFAULT 240, max_advance_days INTEGER NOT NULL DEFAULT 14, max_active_per_person INTEGER NOT NULL DEFAULT 0, recurring_max_weeks INTEGER NOT NULL DEFAULT 20, archived_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE people (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('teacher','student','other')), is_admin INTEGER NOT NULL DEFAULT 0, passcode_hash TEXT NOT NULL DEFAULT '', failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, feed_token TEXT NOT NULL UNIQUE, source TEXT NOT NULL CHECK(source IN ('preset','self')), deleted_at INTEGER, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX people_active_name ON people(name COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE TABLE sessions (id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, person_id INTEGER NOT NULL REFERENCES people(id), created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE series (id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id), person_id INTEGER REFERENCES people(id), kind TEXT NOT NULL CHECK(kind IN ('normal','block')), title TEXT NOT NULL, rule_json TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE bookings (
 id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id), person_id INTEGER REFERENCES people(id), series_id INTEGER REFERENCES series(id), kind TEXT NOT NULL CHECK(kind IN ('normal','block')), title TEXT NOT NULL DEFAULT '', start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, planned_end_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, cancelled_at INTEGER, cancelled_by INTEGER REFERENCES people(id), CHECK(end_at>=start_at)
);
CREATE INDEX bookings_room_time ON bookings(room_id,start_at,end_at) WHERE status='confirmed';
CREATE INDEX bookings_person ON bookings(person_id,series_id,start_at);
CREATE TABLE announcements (id INTEGER PRIMARY KEY, room_id INTEGER REFERENCES rooms(id), title TEXT NOT NULL, body TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, CHECK(ends_at>starts_at));
CREATE TABLE conflict_events (id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id), person_id INTEGER REFERENCES people(id), requested_start INTEGER NOT NULL, requested_end INTEGER NOT NULL, source TEXT NOT NULL CHECK(source IN ('single','series')), accepted_booking_id INTEGER REFERENCES bookings(id), created_at INTEGER NOT NULL);
CREATE TABLE booking_previews (preview_key TEXT PRIMARY KEY, signature TEXT NOT NULL, created_at INTEGER NOT NULL);
-- +goose Down
DROP TABLE booking_previews;
DROP TABLE conflict_events;
DROP TABLE announcements;
DROP TABLE bookings;
DROP TABLE series;
DROP TABLE sessions;
DROP TABLE people;
DROP TABLE rooms;
