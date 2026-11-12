//go:build !server

package main

import "github.com/wailsapp/wails/v3/pkg/application"

func run() error {
	app, hosts := newApp(application.AssetOptions{Handler: spaAssets()})
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{Title: "Roomark · 会议室预约", Width: 1080, Height: 760, URL: "/"})
	configureClient(app, window, hosts)
	return app.Run()
}
