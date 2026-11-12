//go:build windows && !server

package main

import (
	"errors"
	"golang.org/x/sys/windows/registry"
	"os"
)

const startupKey = `Software\Microsoft\Windows\CurrentVersion\Run`

func autostartEnabled() (bool, error) {
	key, err := registry.OpenKey(registry.CURRENT_USER, startupKey, registry.QUERY_VALUE)
	if errors.Is(err, registry.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	value, _, readErr := key.GetStringValue("Roomark")
	closeErr := key.Close()
	if errors.Is(readErr, registry.ErrNotExist) {
		readErr = nil
	}
	return value != "", errors.Join(readErr, closeErr)
}

func setAutostart(enabled bool) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, startupKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	if enabled {
		path, err := os.Executable()
		if err != nil {
			return errors.Join(err, key.Close())
		}
		return errors.Join(key.SetStringValue("Roomark", `"`+path+`"`), key.Close())
	}
	err = key.DeleteValue("Roomark")
	if errors.Is(err, registry.ErrNotExist) {
		err = nil
	}
	return errors.Join(err, key.Close())
}
