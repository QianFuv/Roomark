// Roomark hosts the meeting-room client and its platform services.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"roomark"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

// version is the release version from the VERSION file at the repository root.
var version = roomark.Version

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
		showStartupError(err)
		os.Exit(1)
	}
}

// newApp prepares desktop storage before Wails can create a browser profile.
func newApp(options application.AssetOptions) (*application.App, *hostServices, error) {
	windowsOptions := application.WindowsOptions{}
	if platformName == "desktop" {
		directory, err := configDirectory()
		if err != nil {
			return nil, nil, err
		}
		for _, folder := range []string{directory, filepath.Join(directory, "webview")} {
			if err := writableDataDirectory(folder); err != nil {
				return nil, nil, fmt.Errorf("无法写入数据文件夹：%s\n请将 Roomark 移到有写入权限的文件夹后重试。\n%w", folder, err)
			}
		}
		windowsOptions.WebviewUserDataPath = filepath.Join(directory, "webview")
	}
	hosts := newHostServices(defaultServerURL)
	app := application.New(application.Options{
		Name: "Roomark", Description: "会议室预约", Assets: options,
		Windows: windowsOptions,
		Services: []application.Service{
			application.NewService(hosts.platform), application.NewService(hosts.files),
			application.NewService(hosts.scanner), application.NewService(hosts.tray), application.NewService(hosts.autostart),
		},
	})
	hosts.files.app = app
	hosts.scanner.app = app
	return app, hosts, nil
}
