// Package rules implements deterministic booking validation and recurrence.
package rules

import (
	"fmt"
	"slices"
	"sort"
	"time"
	_ "time/tzdata"

	"roomark/apps/roomark/internal/domain"
)

// Shanghai is the product's fixed time zone, embedded for portable builds.
var Shanghai = loadShanghai()

func loadShanghai() *time.Location {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		panic(err)
	}
	return location
}

// Local converts an instant to the product time zone.
func Local(value time.Time) time.Time { return value.In(Shanghai) }

// Day returns the local midnight containing an instant.
func Day(value time.Time) time.Time {
	value = Local(value)
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, Shanghai)
}

// At constructs a local clock time on the supplied date.
func At(day time.Time, clock string) (time.Time, error) {
	parsed, err := time.Parse("15:04", clock)
	if err != nil {
		return time.Time{}, err
	}
	return Day(day).Add(time.Duration(parsed.Hour()*60+parsed.Minute()) * time.Minute), nil
}

// ValidateRules rejects invalid room configurations.
func ValidateRules(limits domain.Rules) error {
	open, err := At(time.Now(), limits.OpenTime)
	if err != nil {
		return fmt.Errorf("invalid open time: %w", err)
	}
	closeTime, err := At(time.Now(), limits.CloseTime)
	if err != nil {
		return fmt.Errorf("invalid close time: %w", err)
	}
	if !closeTime.After(open) || limits.MaxDurationMinutes < 15 || limits.MaxAdvanceDays < 0 || limits.MaxActivePerPerson < 0 || limits.RecurringMaxWeeks < 1 || limits.RecurringMaxWeeks > 104 {
		return fmt.Errorf("invalid room rules")
	}
	return nil
}

// Options supplies context without accessing storage or the system clock.
type Options struct {
	// Now is the explicit evaluation instant.
	Now time.Time
	// Quick allows a current-minute immediate-use interval.
	Quick bool
	// Recurring applies the series horizon instead of the single advance limit.
	Recurring bool
	// Block bypasses normal room booking limits for administrative blocks.
	Block bool
	// Active counts existing active reservation groups.
	Active int
	// Existing marks an edit of an existing active reservation.
	Existing bool
}

// Validate checks the non-overlap-independent product booking rules.
func Validate(start, end time.Time, limits domain.Rules, options Options) []domain.Violation {
	violations := []domain.Violation{}
	add := func(code, message string) {
		violations = append(violations, domain.Violation{Code: code, Message: message})
	}
	start, end = Local(start), Local(end)
	if !end.After(start) || !Day(start).Equal(Day(end)) {
		add("invalid_range", "预约要在同一天，结束时间要晚于开始时间")
		return violations
	}
	if options.Block {
		return violations
	}
	cutoff := options.Now
	if options.Quick {
		cutoff = cutoff.Truncate(time.Minute)
	}
	if start.Before(cutoff) && !options.Existing {
		add("in_past", "不能预约过去的时间")
	}
	if (!options.Quick && (start.Minute()%15 != 0 || start.Second() != 0 || start.Nanosecond() != 0)) || end.Minute()%15 != 0 || end.Second() != 0 || end.Nanosecond() != 0 {
		if !options.Quick {
			add("misaligned", "时间要按 15 分钟取整")
		}
	}
	open, err := At(start, limits.OpenTime)
	if err != nil {
		add("invalid_range", "房间的开放时间不正确")
		return violations
	}
	closeTime, err := At(start, limits.CloseTime)
	if err != nil {
		add("invalid_range", "房间的关闭时间不正确")
		return violations
	}
	if start.Before(open) || end.After(closeTime) {
		add("outside_open_hours", fmt.Sprintf("开放时间是 %s–%s", limits.OpenTime, limits.CloseTime))
	}
	if end.Sub(start) > time.Duration(limits.MaxDurationMinutes)*time.Minute {
		duration := fmt.Sprintf("%d 分钟", limits.MaxDurationMinutes)
		if limits.MaxDurationMinutes%60 == 0 {
			duration = fmt.Sprintf("%d 小时", limits.MaxDurationMinutes/60)
		} else if limits.MaxDurationMinutes > 120 {
			duration = fmt.Sprintf("%d 小时 %d 分钟", limits.MaxDurationMinutes/60, limits.MaxDurationMinutes%60)
		}
		add("too_long", "单次最长 "+duration)
	}
	if !options.Recurring && Day(start).After(Day(options.Now).AddDate(0, 0, limits.MaxAdvanceDays)) {
		add("too_far_ahead", fmt.Sprintf("最多提前 %d 天预约", limits.MaxAdvanceDays))
	}
	if !options.Existing && limits.MaxActivePerPerson > 0 && options.Active >= limits.MaxActivePerPerson {
		add("too_many_active", "有效预约数量已达上限")
	}
	return violations
}

// Overlaps applies half-open interval semantics so adjacent bookings are valid.
func Overlaps(start, end, otherStart, otherEnd time.Time) bool {
	return start.Before(otherEnd) && end.After(otherStart)
}

// Conflict finds the first confirmed overlapping booking.
func Conflict(start, end time.Time, bookings []domain.Booking) *domain.Booking {
	for _, booking := range bookings {
		if booking.Status == "confirmed" && Overlaps(start, end, booking.Start, booking.End) {
			return &booking
		}
	}
	return nil
}

// Suggestions finds nearby same-day slots and matching clock times on later days.
func Suggestions(start, end time.Time, limits domain.Rules, options Options, bookings []domain.Booking) []domain.Suggestion {
	result := []domain.Suggestion{}
	duration := end.Sub(start)
	if duration <= 0 {
		return result
	}
	open, err := At(start, limits.OpenTime)
	if err != nil {
		return result
	}
	closeTime, err := At(start, limits.CloseTime)
	if err != nil {
		return result
	}
	options.Quick = false
	options.Existing = true
	valid := func(candidate time.Time) bool {
		return !candidate.Before(options.Now) && len(Validate(candidate, candidate.Add(duration), limits, options)) == 0 && Conflict(candidate, candidate.Add(duration), bookings) == nil
	}
	candidates := []time.Time{}
	gridStart := open.Truncate(15 * time.Minute)
	if gridStart.Before(open) {
		gridStart = gridStart.Add(15 * time.Minute)
	}
	for candidate := gridStart; !candidate.Add(duration).After(closeTime); candidate = candidate.Add(15 * time.Minute) {
		if valid(candidate) {
			candidates = append(candidates, candidate)
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool { return abs(candidates[i].Sub(start)) < abs(candidates[j].Sub(start)) })
	var earlier, later *time.Time
	for _, candidate := range candidates {
		if candidate.Before(start) && earlier == nil {
			earlier = &candidate
		}
		if !candidate.Before(start) && later == nil {
			later = &candidate
		}
	}
	chosen := []time.Time{}
	if earlier != nil && later != nil {
		chosen = append(chosen, *earlier, *later)
	} else {
		chosen = append(chosen, candidates[:min(2, len(candidates))]...)
	}
	sort.SliceStable(chosen, func(i, j int) bool { return abs(chosen[i].Sub(start)) < abs(chosen[j].Sub(start)) })
	for _, candidate := range chosen {
		result = append(result, domain.Suggestion{Start: candidate, End: candidate.Add(duration), Kind: "same_day"})
	}
	otherDays := 0
	maxDays := limits.MaxAdvanceDays
	if options.Recurring {
		maxDays = limits.RecurringMaxWeeks * 7
	}
	for offset := 1; offset <= maxDays && otherDays < 3; offset++ {
		candidate := Local(start).AddDate(0, 0, offset)
		if Day(candidate).After(Day(options.Now).AddDate(0, 0, maxDays)) {
			break
		}
		if valid(candidate) {
			result = append(result, domain.Suggestion{Start: candidate, End: candidate.Add(duration), Kind: "other_day"})
			otherDays++
		}
	}
	return result
}

func abs(value time.Duration) time.Duration {
	if value < 0 {
		return -value
	}
	return value
}

// Expand validates and expands a bounded weekly rule using ISO weekdays.
func Expand(rule domain.SeriesRule, limits domain.Rules, now time.Time) ([]domain.Occurrence, []domain.Violation) {
	fail := func(code, message string) ([]domain.Occurrence, []domain.Violation) {
		return nil, []domain.Violation{{Code: code, Message: message}}
	}
	start, err := time.ParseInLocation("2006-01-02", rule.StartDate, Shanghai)
	if err != nil {
		return fail("invalid_range", "重复预约的开始日期不正确")
	}
	if (rule.Count > 0) == (rule.UntilDate != "") || (rule.Freq != "weekly" && rule.Freq != "biweekly") || len(rule.Weekdays) == 0 || rule.Count > 728 {
		return fail("invalid_range", "请设置重复规则，并选择次数或截止日期")
	}
	for index, weekday := range rule.Weekdays {
		if weekday < 1 || weekday > 7 || slices.Index(rule.Weekdays, weekday) != index {
			return fail("invalid_range", "星期请填 1–7，不能重复")
		}
	}
	until := start.AddDate(0, 0, limits.RecurringMaxWeeks*7)
	if rule.UntilDate != "" {
		until, err = time.ParseInLocation("2006-01-02", rule.UntilDate, Shanghai)
		if err != nil || until.Before(start) {
			return fail("invalid_range", "重复预约的截止日期不正确")
		}
	}
	ceiling := Day(now).AddDate(0, 0, limits.RecurringMaxWeeks*7)
	if until.After(ceiling) && rule.UntilDate != "" || start.After(ceiling) {
		return fail("series_too_long", "重复预约超出时间范围")
	}
	if until.After(ceiling) {
		until = ceiling
	}
	iso := func(day time.Time) int { return (int(day.Weekday())+6)%7 + 1 }
	weekStart := start.AddDate(0, 0, 1-iso(start))
	result := []domain.Occurrence{}
	for day := start; !day.After(until); day = day.AddDate(0, 0, 1) {
		week := int(day.Sub(weekStart).Hours()/24) / 7
		if rule.Freq == "biweekly" && week%2 != 0 || !slices.Contains(rule.Weekdays, iso(day)) {
			continue
		}
		begin, err := At(day, rule.StartTime)
		if err != nil {
			return fail("invalid_range", "开始时间不正确")
		}
		end, err := At(day, rule.EndTime)
		if err != nil || !end.After(begin) {
			return fail("invalid_range", "结束时间要晚于开始时间")
		}
		result = append(result, domain.Occurrence{Date: day.Format("2006-01-02"), Start: begin, End: end, Status: "ok"})
		if rule.Count > 0 && len(result) == rule.Count {
			return result, nil
		}
	}
	if rule.Count > len(result) {
		return fail("series_too_long", "重复预约超出时间范围")
	}
	return result, nil
}

// Summary renders a concise Chinese recurrence label.
func Summary(rule domain.SeriesRule) string {
	prefix := "每周"
	if rule.Freq == "biweekly" {
		prefix = "每两周"
	}
	weekdays := []rune("一二三四五六日")
	label := ""
	for _, day := range rule.Weekdays {
		if day >= 1 && day <= 7 {
			if label != "" {
				label += "、"
			}
			label += string(weekdays[day-1])
		}
	}
	return prefix + label + " " + rule.StartTime + "–" + rule.EndTime
}
