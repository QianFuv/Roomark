// Roomark hosts the meeting-room client and its platform services.
package main

import (
	"embed"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS
var defaultServerURL string

func spaAssets() http.Handler {
	handler := application.AssetFileServerFS(assets)
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		name := strings.TrimPrefix(path.Clean(request.URL.Path), "/")
		if name != "" && name != "." {
			if _, err := fs.Stat(assets, "frontend/dist/"+name); err != nil && (request.Method == http.MethodGet || request.Method == http.MethodHead) {
				clone := request.Clone(request.Context())
				clone.URL.Path = "/"
				handler.ServeHTTP(writer, clone)
				return
			}
		}
		handler.ServeHTTP(writer, request)
	})
}

func main() {
	if err := run(); err != nil {
		slog.Error("Roomark stopped", "error", err)
		os.Exit(1)
	}
}

func newApp(options application.AssetOptions) (*application.App, *hostServices) {
	hosts := newHostServices(defaultServerURL)
	app := application.New(application.Options{
		Name: "Roomark", Description: "会议室预约", Assets: options,
		Services: []application.Service{
			application.NewService(hosts.platform), application.NewService(hosts.files),
			application.NewService(hosts.scanner), application.NewService(hosts.tray), application.NewService(hosts.autostart),
		},
	})
	hosts.files.app = app
	hosts.scanner.app = app
	return app, hosts
}
