package main

import (
	"os"
	"path/filepath"
	"testing"
)

// resolvedTempDir returns a temporary directory with symlinks and Windows
// short (8.3) names expanded, matching what resolveDataDirectory reports.
func resolvedTempDir(t *testing.T) string {
	t.Helper()
	directory, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return directory
}

// TestResolveDataDirectory keeps desktop data beside the exe and Android in app storage.
func TestResolveDataDirectory(t *testing.T) {
	directory := resolvedTempDir(t)
	executable := filepath.Join(directory, "roomark.exe")
	if err := os.WriteFile(executable, nil, 0600); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, platform, path, want string
		wantError                  bool
	}{
		{"desktop", "desktop", executable, filepath.Join(directory, "data"), false},
		{"android", "android", filepath.Join(directory, "android-files"), filepath.Join(directory, "android-files"), false},
		{"android unavailable", "android", "", "", true},
		{"missing executable", "desktop", filepath.Join(directory, "missing.exe"), "", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := resolveDataDirectory(test.platform, test.path)
			if (err != nil) != test.wantError || got != test.want {
				t.Fatalf("directory=%q error=%v; want %q error=%v", got, err, test.want, test.wantError)
			}
		})
	}
}

// TestResolveDataDirectorySymlink stores data beside the actual executable.
func TestResolveDataDirectorySymlink(t *testing.T) {
	directory := resolvedTempDir(t)
	executable := filepath.Join(directory, "roomark.exe")
	if err := os.WriteFile(executable, nil, 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "roomark.exe")
	if err := os.Symlink(executable, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	got, err := resolveDataDirectory("desktop", link)
	if want := filepath.Join(directory, "data"); err != nil || got != want {
		t.Fatalf("directory=%q error=%v; want %q", got, err, want)
	}
}

// TestConfigDirectory uses the process executable rather than a system profile.
func TestConfigDirectory(t *testing.T) {
	if platformName == "android" {
		t.Skip("Android requires an initialized mobile host")
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	executable, err = filepath.EvalSymlinks(executable)
	if err != nil {
		t.Fatal(err)
	}
	got, err := configDirectory()
	if want := filepath.Join(filepath.Dir(executable), "data"); err != nil || got != want {
		t.Fatalf("directory=%q error=%v; want %q", got, err, want)
	}
}

// TestWritableDataDirectory checks creation, probe cleanup and an unusable path.
func TestWritableDataDirectory(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "data", "webview")
	if err := writableDataDirectory(directory); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(directory)
	if err != nil || len(entries) != 0 {
		t.Fatalf("entries=%v error=%v", entries, err)
	}
	file := filepath.Join(directory, "file")
	if err := os.WriteFile(file, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if err := writableDataDirectory(filepath.Join(file, "data")); err == nil {
		t.Fatal("expected an error for a directory below a file")
	}
}
