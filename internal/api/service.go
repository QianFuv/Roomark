package api

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/pressly/goose/v3"
	"github.com/rs/cors"
	"golang.org/x/crypto/blake2b"
	"golang.org/x/time/rate"
	"io/fs"
	"log/slog"
	_ "modernc.org/sqlite"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"roomark/db"
	"roomark/internal/domain"
	"roomark/internal/roomcode"
	"roomark/internal/rules"
	"roomark/internal/store"
	"strings"
	"sync"
	"time"
)

// Config supplies storage, public links and bootstrap credentials.
type Config struct {
	// Database is the SQLite file path.
	Database string
	// PublicURL is the public origin used in exported links.
	PublicURL string
	// AllowedOrigins contains explicitly allowed additional CORS origins.
	AllowedOrigins []string
	// AdminName is the optional first administrator name.
	AdminName string
	// AdminPasscode is the optional first administrator numeric passcode.
	AdminPasscode string
	// TrustedProxies lists reverse-proxy networks whose X-Real-IP header carries the client address.
	TrustedProxies []netip.Prefix
}

// Service owns the business database and serializes transactions.
type Service struct {
	db     *sql.DB
	mu     sync.Mutex
	config Config
	now    func() time.Time
	ipMu   sync.Mutex
	limits map[string]*ipLimit
}

type ipLimit struct {
	limiter  *rate.Limiter
	seen     time.Time
	failures []time.Time
}
type ipContextKey struct{}
type publicURLContextKey struct{}

// Open migrates storage and optionally provisions the first administrator.
func Open(ctx context.Context, config Config) (*Service, error) {
	if config.Database == "" {
		config.Database = "./roomark.db"
	}
	if config.PublicURL != "" {
		parsed, err := url.Parse(config.PublicURL)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, fmt.Errorf("invalid ROOMARK_PUBLIC_URL")
		}
		config.PublicURL = strings.TrimRight(config.PublicURL, "/")
	}
	database, err := sql.Open("sqlite", config.Database)
	if err != nil {
		return nil, err
	}
	database.SetMaxOpenConns(1)
	for _, pragma := range []string{"PRAGMA foreign_keys=ON", "PRAGMA busy_timeout=5000", "PRAGMA journal_mode=WAL"} {
		if _, err := database.ExecContext(ctx, pragma); err != nil {
			return nil, errors.Join(err, database.Close())
		}
	}
	migrations, err := fs.Sub(db.Migrations, "migrations")
	if err != nil {
		return nil, errors.Join(err, database.Close())
	}
	provider, err := goose.NewProvider(goose.DialectSQLite3, database, migrations, goose.WithGoMigrations(db.RoomCodeMigration()))
	if err != nil {
		return nil, errors.Join(err, database.Close())
	}
	if _, err := provider.Up(ctx); err != nil {
		return nil, errors.Join(err, database.Close())
	}
	service := &Service{db: database, config: config, now: time.Now, limits: map[string]*ipLimit{}}
	if err := service.bootstrap(ctx); err != nil {
		return nil, errors.Join(err, database.Close())
	}
	return service, nil
}

// Close releases database resources after the Wails server exits.
func (s *Service) Close() error { return s.db.Close() }

// Handler serves business endpoints with explicit app-origin CORS permissions.
func (s *Service) Handler() http.Handler {
	mux := http.NewServeMux()
	New(mux, s)
	origins := []string{"http://wails.localhost", "https://wails.localhost"}
	for _, origin := range s.config.AllowedOrigins {
		if origin = strings.TrimSpace(origin); origin != "" {
			origins = append(origins, origin)
		}
	}
	handler := cors.New(cors.Options{AllowedOrigins: origins, AllowedMethods: []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"}, AllowedHeaders: []string{"Authorization", "Content-Type", "X-Room-Token"}, ExposedHeaders: []string{"Content-Disposition"}, MaxAge: 600}).Handler(mux)
	return http.HandlerFunc(func(writer http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), ipContextKey{}, s.clientIP(r))
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		ctx = context.WithValue(ctx, publicURLContextKey{}, scheme+"://"+r.Host)
		handler.ServeHTTP(writer, r.WithContext(ctx))
	})
}

func (s *Service) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return host
	}
	for _, network := range s.config.TrustedProxies {
		if network.Contains(peer.Unmap()) {
			if forwarded, err := netip.ParseAddr(strings.TrimSpace(r.Header.Get("X-Real-IP"))); err == nil {
				return forwarded.Unmap().String()
			}
			break
		}
	}
	return peer.Unmap().String()
}

// ParseTrustedProxies parses a comma-separated list of CIDR prefixes or single addresses.
func ParseTrustedProxies(value string) ([]netip.Prefix, error) {
	result := []netip.Prefix{}
	for _, item := range strings.Split(value, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if !strings.Contains(item, "/") {
			address, err := netip.ParseAddr(item)
			if err != nil {
				return nil, fmt.Errorf("invalid trusted proxy %q: %w", item, err)
			}
			result = append(result, netip.PrefixFrom(address.Unmap(), address.Unmap().BitLen()))
			continue
		}
		prefix, err := netip.ParsePrefix(item)
		if err != nil {
			return nil, fmt.Errorf("invalid trusted proxy %q: %w", item, err)
		}
		result = append(result, prefix.Masked())
	}
	return result, nil
}

func (s *Service) publicURL(ctx context.Context) string {
	if s.config.PublicURL != "" {
		return s.config.PublicURL
	}
	origin, _ := ctx.Value(publicURLContextKey{}).(string)
	return origin
}

func (s *Service) allowedIP(ctx context.Context) bool {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	now := s.now()
	entry := s.limitForIP(ctx, "identity", now)
	return entry != nil && entry.limiter.AllowN(now, 1)
}

// limitForIP shares bounded IP storage between identity and room-code checks; ipMu must be held.
func (s *Service) limitForIP(ctx context.Context, scope string, now time.Time) *ipLimit {
	ip, _ := ctx.Value(ipContextKey{}).(string)
	key := scope + ":" + ip
	entry := s.limits[key]
	if entry == nil {
		for key, item := range s.limits {
			if now.Sub(item.seen) > time.Hour {
				delete(s.limits, key)
			}
		}
		if len(s.limits) >= 4096 {
			return nil
		}
		entry = &ipLimit{limiter: rate.NewLimiter(rate.Every(6*time.Second), 10)}
		s.limits[key] = entry
	}
	entry.seen = now
	return entry
}

// invalidRoomCode counts only failed checks, sharing ten failures per ten minutes across endpoints.
func (s *Service) invalidRoomCode(ctx context.Context, status int, code, detail string) error {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	now := s.now()
	entry := s.limitForIP(ctx, "room-code", now)
	if entry != nil {
		cutoff := now.Add(-10 * time.Minute)
		first := 0
		for first < len(entry.failures) && !entry.failures[first].After(cutoff) {
			first++
		}
		entry.failures = entry.failures[first:]
		if len(entry.failures) < 10 {
			entry.failures = append(entry.failures, now)
			return problem(status, code, detail)
		}
	}
	return problem(429, "rate_limited", "尝试过于频繁，请稍后重试")
}

func token() string { return base64.RawURLEncoding.EncodeToString(randomBytes(32)) }
func randomBytes(size int) []byte {
	result := make([]byte, size)
	if _, err := rand.Read(result); err != nil {
		panic(err)
	}
	return result
}
func tokenHash(value string) string {
	sum := blake2b.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func sameToken(first, second string) bool {
	return subtle.ConstantTimeCompare([]byte(first), []byte(second)) == 1
}
func timestamp(value int64) time.Time    { return time.Unix(value, 0).In(rules.Shanghai) }
func nullable(value int64) sql.NullInt64 { return sql.NullInt64{Int64: value, Valid: value != 0} }
func integer(value bool) int64 {
	if value {
		return 1
	}
	return 0
}
func personView(person store.Person) domain.Person {
	return domain.Person{ID: person.ID, Name: person.Name, Role: person.Role, IsAdmin: person.IsAdmin != 0, HasPasscode: person.PasscodeHash != ""}
}
func roomView(room store.Room) domain.Room {
	return domain.Room{ID: room.ID, Slug: room.Slug, Name: room.Name, Location: room.Location, Capacity: int(room.Capacity), Description: room.Description, Rules: domain.Rules{OpenTime: room.OpenTime, CloseTime: room.CloseTime, MaxDurationMinutes: int(room.MaxDurationMin), MaxAdvanceDays: int(room.MaxAdvanceDays), MaxActivePerPerson: int(room.MaxActivePerPerson), RecurringMaxWeeks: int(room.RecurringMaxWeeks)}}
}
func adminRoomView(room store.Room) domain.AdminRoom {
	return domain.AdminRoom{Room: roomView(room), Code: room.AccessToken, Archived: room.ArchivedAt.Valid}
}

func (s *Service) dispatch(ctx context.Context, op string, r request) (any, error) {
	if op == "login" {
		if !s.allowedIP(ctx) {
			return nil, problem(429, "rate_limited", "尝试过于频繁，请稍后重试")
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, s.databaseError(err)
	}
	result, operationErr := s.execute(ctx, store.New(tx), op, r)
	var failure *Problem
	if operationErr == nil || errors.As(operationErr, &failure) && failure.persist {
		if err := tx.Commit(); err != nil {
			return nil, s.databaseError(err)
		}
	} else if err := tx.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) {
		return nil, s.databaseError(errors.Join(operationErr, err))
	}
	if operationErr != nil {
		if !errors.As(operationErr, &failure) {
			return nil, s.databaseError(operationErr)
		}
		return nil, operationErr
	}
	return result, nil
}

func (s *Service) databaseError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return problem(404, "not_found", "记录不存在")
	}
	if strings.Contains(err.Error(), "UNIQUE constraint failed") {
		return problem(409, "name_taken", "名称或标识已被使用")
	}
	slog.Error("database operation failed", "error", err)
	return problem(500, "internal_error", "服务暂时无法处理请求")
}

func (s *Service) authenticate(ctx context.Context, q *store.Queries, r request, required bool) (store.Person, error) {
	var person store.Person
	if r.Authorization == "" && !required {
		return person, nil
	}
	if !strings.HasPrefix(r.Authorization, "Bearer ") {
		return person, problem(401, "session_required", "请先选择姓名并输入口令")
	}
	session, err := q.GetSession(ctx, store.GetSessionParams{TokenHash: tokenHash(strings.TrimPrefix(r.Authorization, "Bearer ")), ExpiresAt: s.now().Unix()})
	if errors.Is(err, sql.ErrNoRows) {
		return person, problem(401, "session_invalid", "身份已失效，请重新输入口令")
	}
	if err != nil {
		return person, err
	}
	person, err = q.PersonByID(ctx, session.PersonID)
	if errors.Is(err, sql.ErrNoRows) {
		return person, problem(401, "session_invalid", "身份已失效")
	}
	if err != nil {
		return person, err
	}
	err = q.TouchSession(ctx, store.TouchSessionParams{ID: session.ID, LastUsedAt: s.now().Unix(), ExpiresAt: s.now().Add(365 * 24 * time.Hour).Unix()})
	return person, err
}

func (s *Service) roomAccess(ctx context.Context, q *store.Queries, slug string, r request, person store.Person) (store.Room, error) {
	r.RoomToken = roomcode.Normalize(r.RoomToken)
	if person.IsAdmin == 0 && r.RoomToken == "" {
		return store.Room{}, problem(403, "room_token_required", "请扫描会议室二维码")
	}
	room, err := q.RoomBySlug(ctx, slug)
	if err != nil || room.ArchivedAt.Valid && person.IsAdmin == 0 {
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return room, err
		}
		return room, s.invalidRoomCode(ctx, 403, "room_token_invalid", "房间码不正确")
	}
	if person.IsAdmin == 0 && !sameToken(r.RoomToken, room.AccessToken) {
		return room, s.invalidRoomCode(ctx, 403, "room_token_invalid", "房间码不正确")
	}
	return room, nil
}

func (s *Service) anyRoomAccess(ctx context.Context, q *store.Queries, r request) error {
	r.RoomToken = roomcode.Normalize(r.RoomToken)
	if r.RoomToken == "" {
		return problem(403, "room_token_required", "请扫描会议室二维码")
	}
	_, err := q.RoomByToken(ctx, r.RoomToken)
	if errors.Is(err, sql.ErrNoRows) {
		return s.invalidRoomCode(ctx, 403, "room_token_invalid", "房间码不正确")
	}
	return err
}

func (s *Service) bookingViews(ctx context.Context, q *store.Queries, viewer store.Person) ([]domain.Booking, []store.Booking, error) {
	rows, err := q.ListBookings(ctx)
	if err != nil {
		return nil, nil, err
	}
	people, err := q.AllPeople(ctx)
	if err != nil {
		return nil, nil, err
	}
	rooms, err := q.ListRooms(ctx)
	if err != nil {
		return nil, nil, err
	}
	series, err := q.ListSeries(ctx)
	if err != nil {
		return nil, nil, err
	}
	personMap := map[int64]store.Person{}
	roomMap := map[int64]store.Room{}
	seriesMap := map[int64]store.Series{}
	counts := map[int64]int{}
	indices := map[int64]int{}
	for _, person := range people {
		personMap[person.ID] = person
	}
	for _, room := range rooms {
		roomMap[room.ID] = room
	}
	for _, item := range series {
		seriesMap[item.ID] = item
	}
	for _, row := range rows {
		if row.SeriesID.Valid {
			counts[row.SeriesID.Int64]++
		}
	}
	result := make([]domain.Booking, 0, len(rows))
	for _, row := range rows {
		booking := domain.Booking{ID: row.ID, RoomSlug: roomMap[row.RoomID].Slug, Kind: row.Kind, Title: row.Title, Start: timestamp(row.StartAt), End: timestamp(row.EndAt), PlannedEnd: timestamp(row.PlannedEndAt), Status: row.Status, IsMine: row.PersonID.Valid && row.PersonID.Int64 == viewer.ID, ReleasedMinutes: int(max(0, row.PlannedEndAt-row.EndAt) / 60)}
		booking.CanEdit = booking.Status == "confirmed" && row.EndAt > s.now().Unix() && (booking.IsMine || viewer.IsAdmin != 0)
		if row.PersonID.Valid {
			person := personMap[row.PersonID.Int64]
			booking.Person = &domain.Booker{ID: person.ID, Name: person.Name, Role: person.Role}
		}
		if row.SeriesID.Valid {
			item := seriesMap[row.SeriesID.Int64]
			var rule domain.SeriesRule
			if err := json.Unmarshal([]byte(item.RuleJson), &rule); err != nil {
				return nil, nil, err
			}
			indices[item.ID]++
			booking.Series = &domain.SeriesInfo{ID: item.ID, Index: indices[item.ID], Total: counts[item.ID], RuleSummary: rules.Summary(rule)}
		}
		result = append(result, booking)
	}
	return result, rows, nil
}
