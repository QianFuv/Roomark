package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ErrUnsupported marks a host capability unavailable on the current platform.
var ErrUnsupported = errors.New("此平台不支持此功能")

type hostServices struct {
	platform  *PlatformService
	files     *FileService
	scanner   *ScanService
	tray      *TrayService
	autostart *AutostartService
}

func newHostServices(serverURL string) *hostServices {
	return &hostServices{platform: &PlatformService{fallback: serverURL}, files: &FileService{}, scanner: &ScanService{}, tray: &TrayService{}, autostart: &AutostartService{}}
}

// PlatformInfo identifies the host and its application version.
type PlatformInfo struct {
	// Platform identifies web, desktop or Android.
	Platform string `json:"platform"`
	// Version is the application release version.
	Version string `json:"version"`
}

// PlatformService exposes host identity and the persisted HTTP server address.
type PlatformService struct {
	mu       sync.Mutex
	fallback string
}

// Info reports web, desktop or Android as required by the frontend.
func (s *PlatformService) Info() PlatformInfo {
	return PlatformInfo{Platform: platformName, Version: "1.0.0"}
}

func configDirectory() (string, error) {
	if platformName == "android" {
		path := application.Mobile.StoragePath()
		if path == "" {
			return "", fmt.Errorf("app storage unavailable")
		}
		return path, nil
	}
	path, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(path, "Roomark"), nil
}

// ServerURL returns an empty URL on web and the saved server URL in apps.
func (s *PlatformService) ServerURL() (string, error) {
	if platformName == "web" {
		return "", nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	directory, err := configDirectory()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(filepath.Join(directory, "server.json"))
	if errors.Is(err, os.ErrNotExist) {
		return s.fallback, nil
	}
	if err != nil {
		return "", err
	}
	var config struct {
		ServerURL string `json:"serverUrl"`
	}
	if err := json.Unmarshal(data, &config); err != nil {
		return "", err
	}
	return config.ServerURL, nil
}

// SetServerURL validates and persists an app's HTTP API base address.
func (s *PlatformService) SetServerURL(value string) error {
	if platformName == "web" {
		return ErrUnsupported
	}
	value = strings.TrimRight(strings.TrimSpace(value), "/")
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("请输入有效的 HTTP 或 HTTPS 服务器地址")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	directory, err := configDirectory()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	data, err := json.Marshal(struct {
		ServerURL string `json:"serverUrl"`
	}{ServerURL: value})
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(directory, "server.json"), data, 0600)
}

// FileResult reports a cancelled save or the path of a saved file.
type FileResult struct {
	// Saved indicates that file delivery completed.
	Saved bool `json:"saved"`
	// Path is the saved host file path.
	Path string `json:"path,omitempty"`
}

// FileService delivers exported PNG and PDF files through native host surfaces.
type FileService struct{ app *application.App }

// SaveFile decodes an export and opens the platform save or share surface.
func (s *FileService) SaveFile(suggestedName, mimeType, base64Data string) (FileResult, error) {
	if platformName == "web" {
		return FileResult{}, ErrUnsupported
	}
	if len(base64Data) > 128<<20 {
		return FileResult{}, fmt.Errorf("导出文件过大")
	}
	name := filepath.Base(suggestedName)
	if name == "." || name == "" || strings.ContainsAny(name, "\\/:") {
		return FileResult{}, fmt.Errorf("文件名无效")
	}
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return FileResult{}, fmt.Errorf("文件内容无效: %w", err)
	}
	return s.save(name, mimeType, data)
}

// ScanService captures a camera image and decodes a QR code on Android.
type ScanService struct {
	app *application.App
}

// ScanQR returns the decoded text or a cancellation/unsupported error.
func (s *ScanService) ScanQR(ctx context.Context) (string, error) { return s.scan(ctx) }

// TrayState controls the desktop status indicator and tooltip.
type TrayState struct {
	// State indicates whether the room is free or busy.
	State string `json:"state"`
	// Label is the bucket or tray text.
	Label string `json:"label"`
	// RoomName is the room displayed in the tray tooltip.
	RoomName string `json:"roomName"`
}

// TrayService updates the desktop system tray.
type TrayService struct {
	tray *application.SystemTray
	mu   sync.Mutex
}

// Update sets the free/busy icon and the current room tooltip.
func (s *TrayService) Update(state TrayState) error {
	if platformName != "desktop" || s.tray == nil {
		return ErrUnsupported
	}
	if state.State != "free" && state.State != "busy" {
		return fmt.Errorf("状态必须为 free 或 busy")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	icon, err := trayIcon(state.State == "busy")
	if err != nil {
		return err
	}
	s.tray.SetIcon(icon)
	s.tray.SetTooltip(strings.TrimSpace(state.RoomName + " " + state.Label))
	return nil
}

// AutostartService manages the current user's desktop login startup setting.
type AutostartService struct{}

// Enabled reports whether Roomark starts at desktop login.
func (s *AutostartService) Enabled() (bool, error) { return autostartEnabled() }

// SetEnabled enables or disables startup for the current user.
func (s *AutostartService) SetEnabled(enabled bool) error { return setAutostart(enabled) }
