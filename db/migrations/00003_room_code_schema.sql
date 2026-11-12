-- +goose Up
ALTER TABLE rooms DROP COLUMN token_rotated_at;

-- +goose Down
ALTER TABLE rooms ADD COLUMN token_rotated_at INTEGER NOT NULL DEFAULT 0;
