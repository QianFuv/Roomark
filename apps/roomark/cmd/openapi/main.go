// Command openapi writes the generated Roomark OpenAPI 3.1 contract.
package main

import (
	"encoding/json"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"roomark/apps/roomark/internal/api"
)

// main exports the contract to the requested path relative to the working directory.
func main() {
	output := flag.String("output", "apps/roomark/api/openapi.json", "OpenAPI output path")
	flag.Parse()
	contract := api.New(http.NewServeMux(), nil).OpenAPI()
	data, err := json.MarshalIndent(contract, "", "  ")
	if err != nil {
		slog.Error("encode OpenAPI", "error", err)
		os.Exit(1)
	}
	if err := os.MkdirAll(filepath.Dir(*output), 0755); err != nil {
		slog.Error("create API directory", "error", err)
		os.Exit(1)
	}
	if err := os.WriteFile(*output, append(data, '\n'), 0644); err != nil {
		slog.Error("write OpenAPI", "error", err)
		os.Exit(1)
	}
}
