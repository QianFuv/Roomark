//go:build !server && !android

package main

import (
	"context"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"log/slog"
	"os"
)

const platformName = "desktop"

func configureClient(app *application.App, window *application.WebviewWindow, hosts *hostServices) {
	tray := app.SystemTray.New()
	hosts.tray.tray = tray
	if icon, err := trayIcon(false); err == nil {
		tray.SetIcon(icon)
	} else {
		slog.Error("create tray icon", "error", err)
	}
	tray.SetTooltip("Roomark · 会议室预约")
	menu := app.NewMenu()
	menu.Add("马上使用").OnClick(func(ctx *application.Context) { window.Show(); app.Event.Emit("tray:quick-use") })
	menu.Add("打开日历").OnClick(func(ctx *application.Context) { window.Show(); app.Event.Emit("tray:open-calendar") })
	menu.AddSeparator()
	menu.Add("显示窗口").OnClick(func(ctx *application.Context) { window.Show() })
	menu.Add("退出").OnClick(func(ctx *application.Context) { app.Quit() })
	tray.SetMenu(menu)
	tray.OnClick(func() { window.Show() })
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) { window.Hide(); event.Cancel() })
}

func (s *FileService) save(name, mimeType string, data []byte) (FileResult, error) {
	path, err := s.app.Dialog.SaveFile().SetFilename(name).PromptForSingleSelection()
	if err != nil {
		return FileResult{}, err
	}
	if path == "" {
		return FileResult{Saved: false}, nil
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		return FileResult{}, err
	}
	return FileResult{Saved: true, Path: path}, nil
}

func (s *ScanService) scan(ctx context.Context) (string, error) { return "", ErrUnsupported }
