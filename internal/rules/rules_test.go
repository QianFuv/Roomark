package rules

import (
	"slices"
	"testing"
	"time"

	"roomark/internal/domain"
)

func localTime(value string) time.Time {
	parsed, err := time.ParseInLocation("2006-01-02 15:04", value, Shanghai)
	if err != nil {
		panic(err)
	}
	return parsed
}

// TestValidate verifies the named behavioral regression.
func TestValidate(t *testing.T) {
	now := localTime("2026-11-12 09:00")
	for _, test := range []struct {
		name, start, end, code string
		active                 int
		quick, block           bool
	}{
		{"valid", "2026-11-12 10:00", "2026-11-12 11:00", "", 0, false, false},
		{"past", "2026-11-12 08:00", "2026-11-12 09:00", "in_past", 0, false, false},
		{"grid", "2026-11-12 10:01", "2026-11-12 11:00", "misaligned", 0, false, false},
		{"quick current minute", "2026-11-12 09:01", "2026-11-12 09:31", "", 0, true, false},
		{"open", "2026-11-13 07:00", "2026-11-13 09:00", "outside_open_hours", 0, false, false},
		{"close", "2026-11-12 21:00", "2026-11-12 22:15", "outside_open_hours", 0, false, false},
		{"duration", "2026-11-12 10:00", "2026-11-12 14:15", "too_long", 0, false, false},
		{"advance edge", "2026-11-26 10:00", "2026-11-26 11:00", "", 0, false, false},
		{"advance exceeded", "2026-11-27 10:00", "2026-11-27 11:00", "too_far_ahead", 0, false, false},
		{"active", "2026-11-12 10:00", "2026-11-12 11:00", "too_many_active", 2, false, false},
		{"midnight", "2026-11-12 23:00", "2026-11-13 00:00", "invalid_range", 0, false, false},
		{"reverse", "2026-11-12 11:00", "2026-11-12 10:00", "invalid_range", 0, false, false},
		{"block ignores limits", "2026-12-12 01:01", "2026-12-12 23:59", "", 9, false, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			limits := domain.DefaultRules()
			limits.MaxActivePerPerson = 2
			violations := Validate(localTime(test.start), localTime(test.end), limits, Options{Now: now, Active: test.active, Quick: test.quick, Block: test.block})
			codes := []string{}
			for _, violation := range violations {
				codes = append(codes, violation.Code)
			}
			if test.code == "" && len(violations) != 0 || test.code != "" && !slices.Contains(codes, test.code) {
				t.Fatalf("violations=%v, want %q", violations, test.code)
			}
		})
	}
}

// TestHalfOpenAndSuggestions verifies the named behavioral regression.
func TestHalfOpenAndSuggestions(t *testing.T) {
	start, end := localTime("2026-11-12 14:00"), localTime("2026-11-12 15:00")
	bookings := []domain.Booking{{Start: start, End: end, Status: "confirmed"}}
	if Conflict(end, end.Add(time.Hour), bookings) != nil {
		t.Fatal("adjacent slot must be free")
	}
	result := Suggestions(start, end, domain.DefaultRules(), Options{Now: localTime("2026-11-12 09:00")}, bookings)
	if len(result) != 5 {
		t.Fatalf("suggestions=%+v", result)
	}
	if !result[0].Start.Equal(start.Add(-time.Hour)) || !result[1].Start.Equal(end) {
		t.Fatalf("must prefer earlier and later: %+v", result)
	}
	for index, suggestion := range result {
		if suggestion.End.Sub(suggestion.Start) != time.Hour || Conflict(suggestion.Start, suggestion.End, bookings) != nil || suggestion.Start.Minute()%15 != 0 {
			t.Fatalf("invalid suggestion %d: %+v", index, suggestion)
		}
		if index >= 2 && suggestion.Start.Hour() != 14 {
			t.Fatalf("next days must preserve clock time: %+v", suggestion)
		}
	}
}

// TestExpand verifies the named behavioral regression.
func TestExpand(t *testing.T) {
	now := localTime("2026-11-12 09:00")
	for _, test := range []struct {
		name  string
		rule  domain.SeriesRule
		dates []string
		code  string
	}{
		{"weekly", domain.SeriesRule{Freq: "weekly", Weekdays: []int{4}, StartDate: "2026-11-12", Count: 3, StartTime: "14:00", EndTime: "15:00"}, []string{"2026-11-12", "2026-11-19", "2026-11-26"}, ""},
		{"biweekly ISO Monday", domain.SeriesRule{Freq: "biweekly", Weekdays: []int{1, 7}, StartDate: "2026-11-12", Count: 3, StartTime: "14:00", EndTime: "15:00"}, []string{"2026-11-15", "2026-11-23", "2026-11-29"}, ""},
		{"inclusive until", domain.SeriesRule{Freq: "weekly", Weekdays: []int{4}, StartDate: "2026-11-12", UntilDate: "2026-11-19", StartTime: "14:00", EndTime: "15:00"}, []string{"2026-11-12", "2026-11-19"}, ""},
		{"two bounds", domain.SeriesRule{Freq: "weekly", Weekdays: []int{4}, StartDate: "2026-11-12", UntilDate: "2026-11-19", Count: 2, StartTime: "14:00", EndTime: "15:00"}, nil, "invalid_range"},
		{"span", domain.SeriesRule{Freq: "weekly", Weekdays: []int{4}, StartDate: "2026-11-12", Count: 30, StartTime: "14:00", EndTime: "15:00"}, nil, "series_too_long"},
		{"invalid weekday", domain.SeriesRule{Freq: "weekly", Weekdays: []int{0}, StartDate: "2026-11-12", Count: 1, StartTime: "14:00", EndTime: "15:00"}, nil, "invalid_range"},
	} {
		t.Run(test.name, func(t *testing.T) {
			occurrences, violations := Expand(test.rule, domain.DefaultRules(), now)
			if test.code != "" {
				if len(violations) == 0 || violations[0].Code != test.code {
					t.Fatalf("violations=%v", violations)
				}
				return
			}
			if len(violations) != 0 || len(occurrences) != len(test.dates) {
				t.Fatalf("occurrences=%+v violations=%v", occurrences, violations)
			}
			for index, item := range occurrences {
				if item.Date != test.dates[index] {
					t.Fatalf("date %d=%s, want %s", index, item.Date, test.dates[index])
				}
			}
		})
	}
}
