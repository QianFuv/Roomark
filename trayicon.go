package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
)

func trayIcon(busy bool) ([]byte, error) {
	icon := image.NewNRGBA(image.Rect(0, 0, 32, 32))
	fill := color.NRGBA{R: 22, G: 163, B: 74, A: 255}
	if busy {
		fill = color.NRGBA{R: 220, G: 38, B: 38, A: 255}
	}
	for row := 0; row < 32; row++ {
		for column := 0; column < 32; column++ {
			if (column-16)*(column-16)+(row-16)*(row-16) <= 12*12 {
				icon.SetNRGBA(column, row, fill)
			}
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, icon); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}
