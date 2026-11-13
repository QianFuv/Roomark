//go:build windows && !server

package main

import (
	"log/slog"

	"golang.org/x/sys/windows"
)

// showStartupError reports failures before the Wails message loop is available.
func showStartupError(err error) {
	message, conversionErr := windows.UTF16PtrFromString(err.Error())
	if conversionErr != nil {
		slog.Error("encode startup error", "error", conversionErr)
		return
	}
	title := windows.StringToUTF16Ptr("Roomark 无法启动")
	if _, dialogErr := windows.MessageBox(0, message, title, windows.MB_OK|windows.MB_ICONERROR); dialogErr != nil {
		slog.Error("show startup error", "error", dialogErr)
	}
}
