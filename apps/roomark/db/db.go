// Package db embeds the versioned Roomark database migrations.
package db

import "embed"

// Migrations contains the goose SQL migrations.
//
//go:embed migrations/*.sql
var Migrations embed.FS
