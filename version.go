// Package roomark provides repository-wide release metadata.
package roomark

import (
	_ "embed"
	"strings"
)

//go:embed VERSION
var versionFile string

// Version is the release version from the repository VERSION file.
var Version = strings.TrimSpace(versionFile)
