// Command openapi writes the generated Roomark OpenAPI 3.1 contract.
package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"roomark/internal/api"
)

func main() {
	contract := api.New(http.NewServeMux(), nil).OpenAPI()
	data, err := json.MarshalIndent(contract, "", "  ")
	if err != nil {
		slog.Error("encode OpenAPI", "error", err)
		os.Exit(1)
	}
	if err := os.MkdirAll("api", 0755); err != nil {
		slog.Error("create API directory", "error", err)
		os.Exit(1)
	}
	if err := os.WriteFile("api/openapi.json", append(data, '\n'), 0644); err != nil {
		slog.Error("write OpenAPI", "error", err)
		os.Exit(1)
	}
}
