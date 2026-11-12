//go:build android && !server

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/makiuchi-d/gozxing"
	"github.com/makiuchi-d/gozxing/qrcode"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const platformName = "android"

var scanLock sync.Mutex

func configureClient(app *application.App, window *application.WebviewWindow, hosts *hostServices) {}

func (s *FileService) save(name, mimeType string, data []byte) (FileResult, error) {
	directory, err := configDirectory()
	if err != nil {
		return FileResult{}, err
	}
	exports := filepath.Join(directory, "exports")
	if err := os.MkdirAll(exports, 0700); err != nil {
		return FileResult{}, err
	}
	path := filepath.Join(exports, name)
	if err := os.WriteFile(path, data, 0600); err != nil {
		return FileResult{}, err
	}
	payload, err := json.Marshal(map[string]string{"file": path, "mimeType": mimeType})
	if err != nil {
		return FileResult{}, err
	}
	application.Mobile.Share(string(payload))
	return FileResult{Saved: true, Path: path}, nil
}

func (s *ScanService) scan(ctx context.Context) (string, error) {
	if !scanLock.TryLock() {
		return "", fmt.Errorf("扫码进行中")
	}
	defer scanLock.Unlock()
	results := make(chan struct {
		path string
		err  error
	}, 1)
	unsubscribe := s.app.Event.On("common:capture", func(event *application.CustomEvent) {
		payload, err := json.Marshal(event.Data)
		if err != nil {
			select {
			case results <- struct {
				path string
				err  error
			}{err: err}:
			default:
			}
			return
		}
		var raw string
		if json.Unmarshal(payload, &raw) == nil {
			payload = []byte(raw)
		}
		var result struct {
			Path      string `json:"path"`
			Error     string `json:"error"`
			Cancelled bool   `json:"cancelled"`
		}
		err = json.Unmarshal(payload, &result)
		if result.Error != "" {
			err = errors.New(result.Error)
		}
		if result.Cancelled {
			err = fmt.Errorf("已取消扫码")
		}
		select {
		case results <- struct {
			path string
			err  error
		}{path: result.Path, err: err}:
		default:
		}
	})
	defer unsubscribe()
	application.Mobile.CapturePhoto()
	timer := time.NewTimer(2 * time.Minute)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-timer.C:
		return "", fmt.Errorf("扫码超时，请重试")
	case result := <-results:
		if result.err != nil {
			return "", result.err
		}
		directory, err := configDirectory()
		if err != nil {
			return "", err
		}
		root := filepath.Join(filepath.Dir(directory), "cache")
		relative, err := filepath.Rel(root, result.path)
		if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
			return "", fmt.Errorf("相机文件路径无效")
		}
		info, err := os.Stat(result.path)
		if err != nil {
			return "", err
		}
		if info.Size() > 32<<20 {
			return "", fmt.Errorf("照片过大")
		}
		data, err := os.ReadFile(result.path)
		if err != nil {
			return "", err
		}
		if len(data) > 32<<20 {
			return "", fmt.Errorf("照片过大")
		}
		config, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			return "", err
		}
		if int64(config.Width)*int64(config.Height) > 50_000_000 {
			return "", fmt.Errorf("照片分辨率过大")
		}
		photo, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			return "", err
		}
		bitmap, err := gozxing.NewBinaryBitmapFromImage(photo)
		if err != nil {
			return "", err
		}
		decoded, err := qrcode.NewQRCodeReader().Decode(bitmap, map[gozxing.DecodeHintType]interface{}{gozxing.DecodeHintType_TRY_HARDER: true})
		if err != nil {
			return "", fmt.Errorf("未识别到二维码，请正对二维码重试: %w", err)
		}
		return decoded.GetText(), nil
	}
}
