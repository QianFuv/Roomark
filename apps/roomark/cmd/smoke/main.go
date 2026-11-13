// Command smoke verifies a built Wails server with real curl HTTP requests.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"roomark/apps/roomark/internal/roomcode"
)

type smokeClient struct {
	baseURL, authorization, roomToken string
	ctx                               context.Context
	curl                              string
}

func (c *smokeClient) call(method, path string, body any, wantStatus int) (map[string]json.RawMessage, error) {
	arguments := []string{"-sS", "--max-time", "10", "-X", method, "-w", "\n%{http_code}", c.baseURL + path}
	if c.authorization != "" {
		arguments = append(arguments, "-H", "Authorization: Bearer "+c.authorization)
	}
	if c.roomToken != "" {
		arguments = append(arguments, "-H", "X-Room-Token: "+c.roomToken)
	}
	var input []byte
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		input = data
		arguments = append(arguments, "-H", "Content-Type: application/json", "--data-binary", "@-")
	}
	command := exec.CommandContext(c.ctx, c.curl, arguments...)
	command.Stdin = bytes.NewReader(input)
	output, err := command.Output()
	if err != nil {
		return nil, fmt.Errorf("curl %s %s: %w", method, path, err)
	}
	separator := bytes.LastIndexByte(output, '\n')
	if separator < 0 {
		return nil, fmt.Errorf("curl response has no status")
	}
	payload, status := string(output[:separator]), string(output[separator+1:])
	if strings.TrimSpace(status) != strconv.Itoa(wantStatus) {
		return nil, fmt.Errorf("%s %s: want %d, received %s", method, path, wantStatus, output)
	}
	fmt.Printf("%s %s → %d\n", method, strings.Split(path, "?")[0], wantStatus)
	result := map[string]json.RawMessage{}
	if strings.HasPrefix(payload, "{") {
		if err := json.Unmarshal([]byte(payload), &result); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func field[T any](object map[string]json.RawMessage, key string) (T, error) {
	var value T
	err := json.Unmarshal(object[key], &value)
	return value, err
}

func run(binary string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	directory, err := os.MkdirTemp("", "roomark-smoke-")
	if err != nil {
		return err
	}
	defer func() {
		if err := os.RemoveAll(directory); err != nil {
			slog.Warn("remove smoke database", "error", err)
		}
	}()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		return err
	}
	command := exec.CommandContext(ctx, binary)
	command.Env = append(os.Environ(), "WAILS_SERVER_HOST=127.0.0.1", "WAILS_SERVER_PORT="+strconv.Itoa(port), "ROOMARK_DB="+filepath.Join(directory, "roomark.db"), "ROOMARK_PUBLIC_URL=http://127.0.0.1:"+strconv.Itoa(port), "ROOMARK_ADMIN_NAME=SmokeAdmin", "ROOMARK_ADMIN_PASSCODE=123456")
	command.Stdout = io.Discard
	command.Stderr = io.Discard
	if err := command.Start(); err != nil {
		return err
	}
	defer func() {
		cancel()
		if err := command.Wait(); err != nil && ctx.Err() == nil {
			slog.Warn("smoke server exited", "error", err)
		}
	}()
	curl := "curl"
	if runtime.GOOS == "windows" {
		curl = "curl.exe"
	}
	c := &smokeClient{ctx: ctx, baseURL: "http://127.0.0.1:" + strconv.Itoa(port), curl: curl}
	ready := false
	for range 50 {
		probe := exec.CommandContext(ctx, curl, "-fsS", "--max-time", "1", c.baseURL+"/health")
		if err := probe.Run(); err == nil {
			ready = true
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !ready {
		return fmt.Errorf("server did not become ready in 5 seconds")
	}
	session, err := c.call("POST", "/api/sessions", map[string]any{"name": "SmokeAdmin", "passcode": "123456"}, 200)
	if err != nil {
		return err
	}
	c.authorization, err = field[string](session, "token")
	if err != nil {
		return err
	}
	admin := c.authorization
	room, err := c.call("POST", "/api/admin/rooms", map[string]any{"slug": "9070", "name": "Smoke room", "location": "Research building", "capacity": 8, "description": "Smoke test"}, 201)
	if err != nil {
		return err
	}
	c.roomToken, err = field[string](room, "code")
	if err != nil {
		return err
	}
	if len(c.roomToken) != 6 || strings.Trim(c.roomToken, roomcode.Alphabet) != "" {
		return fmt.Errorf("invalid room code %q", c.roomToken)
	}
	qr, err := c.call("GET", "/api/admin/rooms/1/qr", nil, 200)
	if err != nil {
		return err
	}
	qrCode, err := field[string](qr, "code")
	if err != nil || qrCode != c.roomToken {
		return fmt.Errorf("QR code does not match room code: %q: %v", qrCode, err)
	}
	if _, err := c.call("POST", "/api/admin/rooms/1/rotate-token", nil, 404); err != nil {
		return err
	}
	person, err := c.call("POST", "/api/admin/people", map[string]any{"name": "SmokePerson", "role": "student", "isAdmin": false}, 201)
	if err != nil {
		return err
	}
	id, err := field[int64](person, "id")
	if err != nil {
		return err
	}
	c.authorization = ""
	c.roomToken = strings.ToLower(c.roomToken)
	resolved, err := c.call("POST", "/api/room-codes/resolve", map[string]string{"code": " " + c.roomToken + " "}, 200)
	if err != nil {
		return err
	}
	slug, err := field[string](resolved, "slug")
	if err != nil || slug != "9070" {
		return fmt.Errorf("room code resolved to %q: %v", slug, err)
	}
	if _, err := c.call("POST", "/api/room-codes/resolve", map[string]string{"code": "WRONG"}, 404); err != nil {
		return err
	}
	session, err = c.call("POST", fmt.Sprintf("/api/people/%d/claim", id), map[string]string{"passcode": "123456"}, 200)
	if err != nil {
		return err
	}
	c.authorization, err = field[string](session, "token")
	if err != nil {
		return err
	}
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return err
	}
	tomorrow := time.Now().In(location).AddDate(0, 0, 1)
	start := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 14, 0, 0, 0, location)
	body := map[string]any{"start": start, "end": start.Add(time.Hour), "title": "Smoke meeting"}
	if _, err := c.call("POST", "/api/rooms/9070/bookings", body, 201); err != nil {
		return err
	}
	conflict, err := c.call("POST", "/api/rooms/9070/bookings", body, 409)
	if err != nil {
		return err
	}
	suggestions, err := field[[]map[string]any](conflict, "suggestions")
	if err != nil || len(suggestions) == 0 {
		return fmt.Errorf("missing conflict suggestions: %w", err)
	}
	rule := map[string]any{"freq": "weekly", "weekdays": []int{(int(start.Weekday())+6)%7 + 1}, "startDate": start.Format("2006-01-02"), "count": 3, "startTime": "16:00", "endTime": "17:00"}
	if _, err := c.call("POST", "/api/rooms/9070/series/preview", map[string]any{"rule": rule}, 200); err != nil {
		return err
	}
	if _, err := c.call("POST", "/api/rooms/9070/series", map[string]any{"rule": rule, "overrides": []any{}, "title": "Smoke series"}, 201); err != nil {
		return err
	}
	c.authorization = admin
	query := "?from=" + start.Format("2006-01-02") + "&to=" + start.AddDate(0, 0, 30).Format("2006-01-02")
	if _, err := c.call("GET", "/api/admin/stats"+query, nil, 200); err != nil {
		return err
	}
	if _, err := c.call("GET", "/api/admin/stats/export.csv"+query, nil, 200); err != nil {
		return err
	}
	if _, err := c.call("GET", "/api/rooms/9070", nil, 200); err != nil {
		return err
	}
	if _, err := c.call("GET", "/r/9070", nil, 200); err != nil {
		return err
	}
	if _, err := c.call("GET", "/ical/9070.ics?k="+c.roomToken, nil, 200); err != nil {
		return err
	}
	for range 9 {
		if _, err := c.call("POST", "/api/room-codes/resolve", map[string]string{"code": "WRONG"}, 404); err != nil {
			return err
		}
	}
	if _, err := c.call("POST", "/api/room-codes/resolve", map[string]string{"code": "WRONG"}, 429); err != nil {
		return err
	}
	if _, err := c.call("POST", "/api/room-codes/resolve", map[string]string{"code": c.roomToken}, 200); err != nil {
		return err
	}
	fmt.Println("Server smoke passed")
	return nil
}

func main() {
	binary := flag.String("binary", "apps/roomark/bin/roomark-server.exe", "built Wails server executable")
	flag.Parse()
	if err := run(*binary); err != nil {
		slog.Error("server smoke failed", "error", err)
		os.Exit(1)
	}
}
