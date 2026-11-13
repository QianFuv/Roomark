package db

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/pressly/goose/v3"
	"roomark/apps/roomark/internal/roomcode"
)

// RoomCodeMigration replaces legacy tokens before the SQL schema cleanup.
func RoomCodeMigration() *goose.Migration {
	return goose.NewGoMigration(2, &goose.GoFunc{RunTx: migrateRoomCodes}, nil)
}

func migrateRoomCodes(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, "SELECT id FROM rooms ORDER BY id")
	if err != nil {
		return err
	}
	var identifiers []int64
	for rows.Next() {
		var identifier int64
		if err := rows.Scan(&identifier); err != nil {
			return errors.Join(err, rows.Close())
		}
		identifiers = append(identifiers, identifier)
	}
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		return err
	}
	for _, identifier := range identifiers {
		for {
			code, err := roomcode.New()
			if err != nil {
				return err
			}
			_, err = tx.ExecContext(ctx, "UPDATE rooms SET access_token=? WHERE id=?", code, identifier)
			if err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed: rooms.access_token") {
				continue
			}
			if err != nil {
				return err
			}
			break
		}
	}
	return nil
}
