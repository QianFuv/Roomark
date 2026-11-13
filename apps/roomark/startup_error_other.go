//go:build !windows || server

package main

// showStartupError leaves reporting to the process logger on other hosts.
func showStartupError(err error) {}
