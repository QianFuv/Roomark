//go:build server

package main

import "context"

func (s *FileService) save(name, mimeType string, data []byte) (FileResult, error) {
	return FileResult{}, ErrUnsupported
}
func (s *ScanService) scan(ctx context.Context) (string, error) { return "", ErrUnsupported }
