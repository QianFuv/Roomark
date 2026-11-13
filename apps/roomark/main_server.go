//go:build server

package main

import (
	"context"
	"errors"
	"github.com/wailsapp/wails/v3/pkg/application"
	"net/http"
	"os"
	"roomark/apps/roomark/internal/api"
	"strings"
)

const platformName = "web"

func run() error {
	trustedProxies, err := api.ParseTrustedProxies(os.Getenv("ROOMARK_TRUSTED_PROXIES"))
	if err != nil {
		return err
	}
	service, err := api.Open(context.Background(), api.Config{Database: os.Getenv("ROOMARK_DB"), PublicURL: os.Getenv("ROOMARK_PUBLIC_URL"), AllowedOrigins: strings.Split(os.Getenv("ROOMARK_ALLOWED_ORIGINS"), ","), AdminName: os.Getenv("ROOMARK_ADMIN_NAME"), AdminPasscode: os.Getenv("ROOMARK_ADMIN_PASSCODE"), TrustedProxies: trustedProxies})
	if err != nil {
		return err
	}
	handler := service.Handler()
	app, _, err := newApp(application.AssetOptions{Handler: spaAssets(), Middleware: func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/ical/") {
				handler.ServeHTTP(writer, r)
				return
			}
			next.ServeHTTP(writer, r)
		})
	}})
	if err != nil {
		return errors.Join(err, service.Close())
	}
	return errors.Join(app.Run(), service.Close())
}
