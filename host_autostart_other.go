//go:build !windows || server

package main

func autostartEnabled() (bool, error) { return false, ErrUnsupported }
func setAutostart(enabled bool) error { return ErrUnsupported }
