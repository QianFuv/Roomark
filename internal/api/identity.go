package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"roomark/internal/domain"
	"roomark/internal/store"
)

var passcodePattern = regexp.MustCompile(`^[0-9]{6}$`)

func hashPasscode(value string) (string, error) {
	if !passcodePattern.MatchString(value) {
		return "", problem(422, "invalid_passcode", "口令要用 6 位数字")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(value), bcrypt.DefaultCost)
	return string(hash), err
}

func (s *Service) bootstrap(ctx context.Context) error {
	q := store.New(s.db)
	count, err := q.AdminCount(ctx)
	if err != nil || count > 0 || s.config.AdminName == "" && s.config.AdminPasscode == "" {
		return err
	}
	if strings.TrimSpace(s.config.AdminName) == "" {
		return fmt.Errorf("ROOMARK_ADMIN_NAME is required with bootstrap passcode")
	}
	hash, err := hashPasscode(s.config.AdminPasscode)
	if err != nil {
		return fmt.Errorf("invalid ROOMARK_ADMIN_PASSCODE: %w", err)
	}
	_, err = q.CreatePerson(ctx, store.CreatePersonParams{Name: strings.TrimSpace(s.config.AdminName), Role: "teacher", IsAdmin: 1, PasscodeHash: hash, FeedToken: token(), Source: "preset", CreatedAt: s.now().Unix()})
	return err
}

func (s *Service) issueSession(ctx context.Context, q *store.Queries, person store.Person) (domain.Session, error) {
	secret := token()
	err := q.CreateSession(ctx, store.CreateSessionParams{TokenHash: tokenHash(secret), PersonID: person.ID, CreatedAt: s.now().Unix(), LastUsedAt: s.now().Unix(), ExpiresAt: s.now().Add(365 * 24 * time.Hour).Unix()})
	return domain.Session{Token: secret, Person: personView(person)}, err
}

func (s *Service) login(ctx context.Context, q *store.Queries, r request) (any, error) {
	body, err := bodyAs[Login](r)
	if err != nil {
		return nil, err
	}
	var person store.Person
	if body.PersonID != 0 {
		person, err = q.PersonByID(ctx, body.PersonID)
	} else {
		person, err = q.PersonByName(ctx, strings.TrimSpace(body.Name))
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, problem(401, "invalid_passcode", "姓名或口令不正确")
	}
	if err != nil {
		return nil, err
	}
	if person.LockedUntil > s.now().Unix() {
		return nil, lockedProblem(person.LockedUntil)
	}
	if person.PasscodeHash == "" {
		return nil, problem(409, "passcode_not_set", "请先设置口令")
	}
	if !passcodePattern.MatchString(body.Passcode) || bcrypt.CompareHashAndPassword([]byte(person.PasscodeHash), []byte(body.Passcode)) != nil {
		failures := person.FailedAttempts + 1
		if person.LockedUntil != 0 {
			failures = 1
		}
		lockedUntil := int64(0)
		if failures >= 5 {
			lockedUntil = s.now().Add(15 * time.Minute).Unix()
		}
		if err := q.FailedLogin(ctx, store.FailedLoginParams{ID: person.ID, FailedAttempts: failures, LockedUntil: lockedUntil}); err != nil {
			return nil, err
		}
		if lockedUntil != 0 {
			p := lockedProblem(lockedUntil)
			p.persist = true
			return nil, p
		}
		p := problem(401, "invalid_passcode", "姓名或口令不正确")
		p.persist = true
		return nil, p
	}
	if err := q.FailedLogin(ctx, store.FailedLoginParams{ID: person.ID}); err != nil {
		return nil, err
	}
	return s.issueSession(ctx, q, person)
}

func lockedProblem(until int64) *Problem {
	p := problem(423, "locked", "口令错太多次，15 分钟后再试")
	value := timestamp(until)
	p.LockedUntil = &value
	return p
}

func (s *Service) claim(ctx context.Context, q *store.Queries, r request) (any, error) {
	if err := s.anyRoomAccess(ctx, q, r); err != nil {
		return nil, err
	}
	if !s.allowedIP(ctx) {
		return nil, problem(429, "rate_limited", "试得太频繁，请稍后再试")
	}
	body, err := bodyAs[Passcode](r)
	if err != nil {
		return nil, err
	}
	person, err := q.PersonByID(ctx, r.id)
	if err != nil {
		return nil, err
	}
	if person.PasscodeHash != "" {
		return nil, problem(409, "already_claimed", "这个姓名已设口令，请输入原口令")
	}
	hash, err := hashPasscode(body.Passcode)
	if err != nil {
		return nil, err
	}
	if err := q.SetPasscode(ctx, store.SetPasscodeParams{ID: person.ID, PasscodeHash: hash}); err != nil {
		return nil, err
	}
	person.PasscodeHash = hash
	return s.issueSession(ctx, q, person)
}

func (s *Service) selfPerson(ctx context.Context, q *store.Queries, r request) (any, error) {
	if err := s.anyRoomAccess(ctx, q, r); err != nil {
		return nil, err
	}
	if !s.allowedIP(ctx) {
		return nil, problem(429, "rate_limited", "试得太频繁，请稍后再试")
	}
	body, err := bodyAs[SelfPerson](r)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		return nil, problem(422, "invalid_name", "请填写姓名")
	}
	hash, err := hashPasscode(body.Passcode.Passcode)
	if err != nil {
		return nil, err
	}
	person, err := q.CreatePerson(ctx, store.CreatePersonParams{Name: name, Role: "other", PasscodeHash: hash, FeedToken: token(), Source: "self", CreatedAt: s.now().Unix()})
	if err != nil {
		return nil, err
	}
	return s.issueSession(ctx, q, person)
}

func (s *Service) changePasscode(ctx context.Context, q *store.Queries, r request, person store.Person) (any, error) {
	body, err := bodyAs[ChangePasscode](r)
	if err != nil {
		return nil, err
	}
	if bcrypt.CompareHashAndPassword([]byte(person.PasscodeHash), []byte(body.Current)) != nil {
		return nil, problem(401, "invalid_passcode", "当前口令不正确")
	}
	hash, err := hashPasscode(body.Next)
	if err != nil {
		return nil, err
	}
	if err := q.SetPasscode(ctx, store.SetPasscodeParams{ID: person.ID, PasscodeHash: hash}); err != nil {
		return nil, err
	}
	if err := q.RevokeOtherSessions(ctx, store.RevokeOtherSessionsParams{PersonID: person.ID, TokenHash: tokenHash(strings.TrimPrefix(r.Authorization, "Bearer "))}); err != nil {
		return nil, err
	}
	return Success{OK: true}, nil
}
