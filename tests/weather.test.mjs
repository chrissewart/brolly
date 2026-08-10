import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import {
  ic, lbl, isRainCode,
  DROP, rainBars,
  podProb, weekTempBounds, daySummaryText,
  buildSampleData,
  localDateStr, dropLeadingDays, sliceHourly, hourlyDayGroups,
  feelsLikeValue, rainColor, sparkline,
} from '../lib/weather.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = name => JSON.parse(readFileSync(join(dir, 'fixtures', name)));

const storm = fixture('manchester-storm-2025-01-24.json');
const wet   = fixture('manchester-wet-2026-06-11.json');
const snow  = fixture('manchester-snow-2024-01-16.json');

// ── WMO code mapping ───────────────────────────────────────────────────────

test('clear sky icon', () => assert.equal(ic(0), '☀️'));
test('overcast icon',  () => assert.equal(ic(3), '☁️'));
test('rain icon',      () => assert.equal(ic(63), '🌧️'));
test('heavy snow icon',() => assert.equal(ic(75), '❄️'));
test('thunderstorm icon', () => assert.equal(ic(95), '⛈️'));
test('unknown code falls back', () => assert.equal(lbl(999), '—'));

test('rain codes flagged correctly', () => {
  assert.equal(isRainCode(0),  false);  // clear
  assert.equal(isRainCode(3),  false);  // overcast
  assert.equal(isRainCode(51), true);   // light drizzle
  assert.equal(isRainCode(63), true);   // rain
  assert.equal(isRainCode(75), true);   // heavy snow
});

// ── rainBars ───────────────────────────────────────────────────────────────

test('no rain → no drops', () =>
  assert.equal(rainBars(0, 0, 0), ''));

test('trace rain (<0.5mm) → 1 drop', () =>
  assert.equal(rainBars(0.3, 63, 80), DROP));

test('moderate rain (0.5–2mm) → 2 drops', () =>
  assert.equal(rainBars(1.0, 63, 80), DROP.repeat(2)));

test('heavy rain (≥2mm) → 3 drops', () =>
  assert.equal(rainBars(3.5, 82, 95), DROP.repeat(3)));

test('0mm but heavy code → 3 drops', () =>
  assert.equal(rainBars(0, 82, null), DROP.repeat(3)));

test('0mm but light code → 1 drop', () =>
  assert.equal(rainBars(0, 61, null), DROP));

test('0mm, no rain code, high prob → 1 drop', () =>
  assert.equal(rainBars(0, 0, 60), DROP));

test('0mm, no rain code, low prob → no drops', () =>
  assert.equal(rainBars(0, 0, 59), ''));

test('null mm falls through to code', () =>
  assert.equal(rainBars(null, 63, null), DROP.repeat(2)));

// ── weekTempBounds ─────────────────────────────────────────────────────────

test('returns correct min/max', () => {
  const h = { temperature_2m: [5, 10, 3, 15, 8] };
  assert.deepEqual(weekTempBounds(h), [3, 15]);
});

test('flat temps get padded ±1', () => {
  const h = { temperature_2m: [10, 10, 10] };
  assert.deepEqual(weekTempBounds(h), [9, 11]);
});

// ── podProb ────────────────────────────────────────────────────────────────

test('returns max prob in time window', () => {
  const h = {
    time: ['2025-01-01T09:00','2025-01-01T10:00','2025-01-01T11:00'],
    precipitation_probability: [20, 80, 60],
  };
  assert.equal(podProb(h, '2025-01-01', 9, 11), 80);
});

test('returns null when no data for date', () => {
  const h = {
    time: ['2025-01-01T09:00'],
    precipitation_probability: [50],
  };
  assert.equal(podProb(h, '2025-01-02', 9, 11), null);
});

test('ignores null probability values', () => {
  const h = {
    time: ['2025-01-01T09:00','2025-01-01T10:00'],
    precipitation_probability: [null, 45],
  };
  assert.equal(podProb(h, '2025-01-01', 9, 11), 45);
});

test('returns null when all values are null', () => {
  const h = {
    time: ['2025-01-01T09:00'],
    precipitation_probability: [null],
  };
  assert.equal(podProb(h, '2025-01-01', 9, 11), null);
});

// ── daySummaryText ─────────────────────────────────────────────────────────

function makeProbHourly(dateStr, morningP, middayP, afternoonP, eveningP) {
  // minimal hourly with one reading per pod
  const times = [
    `${dateStr}T08:00`, // morning [5,11)
    `${dateStr}T12:00`, // midday  [11,14)
    `${dateStr}T15:00`, // afternoon [14,18)
    `${dateStr}T19:00`, // evening [18,23)
  ];
  return {
    time: times,
    precipitation_probability: [morningP, middayP, afternoonP, eveningP],
  };
}

test('all pods dry → "dry"', () => {
  const h = makeProbHourly('2025-01-01', 10, 5, 0, 15);
  assert.match(daySummaryText(h, '2025-01-01', 'Today'), /dry/);
});

test('all pods wet → "rain on and off all day"', () => {
  const h = makeProbHourly('2025-01-01', 80, 70, 90, 60);
  assert.match(daySummaryText(h, '2025-01-01', 'Today'), /rain on and off all day/);
});

test('some pods wet, some iffy', () => {
  const h = makeProbHourly('2025-01-01', 70, 30, 10, 5);
  const s = daySummaryText(h, '2025-01-01', 'Today');
  assert.match(s, /rain likely morning/);
  assert.match(s, /chance of a shower midday/);
});

test('no probability data → unavailable message', () => {
  const h = { time: ['2025-01-01T09:00'], precipitation_probability: [null] };
  assert.match(daySummaryText(h, '2025-01-01', 'Today'), /not available/);
});

test('name appears in output', () => {
  const h = makeProbHourly('2025-01-01', 10, 5, 0, 0);
  assert.match(daySummaryText(h, '2025-01-01', 'Tomorrow'), /Tomorrow/);
});

// ── buildSampleData (deterministic via anchor) ─────────────────────────────

test('sample data structure is complete', () => {
  const { hourly, daily } = buildSampleData('2025-06-01T00:00:00');
  assert.equal(hourly.time.length, 96);
  assert.equal(daily.time.length, 7);
  for (const key of ['temperature_2m','precipitation_probability','precipitation',
                     'wind_speed_10m','wind_gusts_10m','weather_code']) {
    assert.equal(hourly[key].length, 96, `missing hourly.${key}`);
  }
});

test('sample day 1 (storm) has gusts ≥30mph', () => {
  const { hourly } = buildSampleData('2025-06-01T00:00:00');
  const day1Gusts = hourly.wind_gusts_10m.slice(24, 48);
  assert.ok(day1Gusts.some(g => g >= 30), 'storm day should have high gusts');
});

test('sample day 2 (snow) is sub-zero overnight', () => {
  const { hourly } = buildSampleData('2025-06-01T00:00:00');
  const day2Temps = hourly.temperature_2m.slice(48, 72);
  assert.ok(day2Temps.some(t => t < 0), 'snow day should have sub-zero temps');
});

test('same anchor → same output', () => {
  const a = buildSampleData('2025-06-01T00:00:00');
  const b = buildSampleData('2025-06-01T00:00:00');
  assert.deepEqual(a, b);
});

// ── real historic fixtures ─────────────────────────────────────────────────

test('storm fixture: gusts exceed 30mph', () => {
  const maxGust = Math.max(...storm.hourly.wind_gusts_10m);
  assert.ok(maxGust >= 30, `expected gust ≥30mph, got ${maxGust}`);
});

test('storm fixture: rain codes present', () => {
  const rainCodes = storm.hourly.weather_code.filter(isRainCode);
  assert.ok(rainCodes.length > 0, 'storm day should have rain weather codes');
});

test('storm fixture: rainBars shows drops for rainy hours', () => {
  const h = storm.hourly;
  const rainyHour = h.weather_code.findIndex(isRainCode);
  assert.ok(rainyHour >= 0);
  const bars = rainBars(h.precipitation[rainyHour], h.weather_code[rainyHour], null);
  assert.ok(bars.length > 0, 'rainy hour should show at least one drop');
});

test('wet fixture: substantial total precipitation', () => {
  const total = wet.hourly.precipitation.reduce((a, b) => a + b, 0);
  // Wettest day found in a live 92-day lookback (2026-06-11, 15.3mm) — real
  // UKMO data has no equivalent of the old archive fixture's cherry-picked
  // 41.8mm storm total, so the bar here is lower but still clearly "wet".
  assert.ok(total >= 15, `expected ≥15mm total, got ${total.toFixed(1)}mm`);
});

test('wet fixture: heavy rain codes present (51–65)', () => {
  const heavy = wet.hourly.weather_code.filter(c => c >= 51 && c <= 65);
  assert.ok(heavy.length > 0, 'wet day should have drizzle/rain codes');
});

test('snow fixture: sub-zero temperatures', () => {
  const minTemp = Math.min(...snow.hourly.temperature_2m);
  assert.ok(minTemp < 0, `expected sub-zero temps, got ${minTemp}°C min`);
});

test('snow fixture: snow weather codes present', () => {
  const snowCodes = snow.hourly.weather_code.filter(c => c >= 71 && c <= 77);
  assert.ok(snowCodes.length > 0, 'snow day should have WMO 71–77 codes');
});

test('snow fixture: snow icon rendered', () => {
  const snowCode = snow.hourly.weather_code.find(c => c >= 71 && c <= 77);
  assert.ok(['🌨️','❄️'].includes(ic(snowCode)), `unexpected icon for code ${snowCode}`);
});

test('all fixtures have required hourly fields', () => {
  const required = ['time','temperature_2m','precipitation','precipitation_probability',
                    'wind_speed_10m','wind_gusts_10m','weather_code'];
  for (const [name, fx] of [['storm',storm],['wet',wet],['snow',snow]]) {
    for (const field of required) {
      assert.ok(field in fx.hourly, `${name} fixture missing hourly.${field}`);
    }
  }
});

// ── localDateStr / dropLeadingDays / sliceHourly / hourlyDayGroups ─────────
// Backing "look back one day" + "7 days of hourly, lazily rendered".

test('localDateStr zero-pads month and day', () => {
  assert.equal(localDateStr(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(localDateStr(new Date(2026, 10, 23)), '2026-11-23');
});

test('dropLeadingDays trims every array by n from the front', () => {
  const daily = {time:['a','b','c'], temperature_2m_max:[1,2,3]};
  assert.deepEqual(dropLeadingDays(daily, 1), {time:['b','c'], temperature_2m_max:[2,3]});
});

test('dropLeadingDays is a no-op for n=0', () => {
  const daily = {time:['a','b']};
  assert.equal(dropLeadingDays(daily, 0), daily); // same reference, no copy
});

test('sliceHourly trims every field in lockstep', () => {
  const h = {time:['t0','t1','t2'], temperature_2m:[1,2,3]};
  assert.deepEqual(sliceHourly(h, 1), {time:['t1','t2'], temperature_2m:[2,3]});
});

test('sliceHourly is a no-op for idx=0', () => {
  const h = {time:['t0','t1']};
  assert.equal(sliceHourly(h, 0), h);
});

test('hourlyDayGroups buckets consecutive hours by local date', () => {
  const h = {time:[
    '2026-08-10T22:00','2026-08-10T23:00',
    '2026-08-11T00:00','2026-08-11T01:00','2026-08-11T02:00',
  ]};
  const groups = hourlyDayGroups(h);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {date:'2026-08-10', idxs:[0,1]});
  assert.deepEqual(groups[1], {date:'2026-08-11', idxs:[2,3,4]});
});

test('hourlyDayGroups respects fromIdx (partial first day)', () => {
  const h = {time:['2026-08-10T10:00','2026-08-10T11:00','2026-08-11T00:00']};
  const groups = hourlyDayGroups(h, 1);
  assert.deepEqual(groups, [{date:'2026-08-10', idxs:[1]}, {date:'2026-08-11', idxs:[2]}]);
});

test('hourlyDayGroups on empty range returns no groups', () => {
  const h = {time:['2026-08-10T10:00']};
  assert.deepEqual(hourlyDayGroups(h, 1), []);
});

// ── feelsLikeValue ───────────────────────────────────────────────────────

test('feelsLikeValue: rounds and returns even when equal to actual', () => {
  assert.equal(feelsLikeValue(16.4, 16.1), 16);
});

test('feelsLikeValue: colder feel', () => {
  assert.equal(feelsLikeValue(16, 13.6), 14);
});

test('feelsLikeValue: warmer feel', () => {
  assert.equal(feelsLikeValue(21, 24.2), 24);
});

test('feelsLikeValue: missing apparent temp → null', () => {
  assert.equal(feelsLikeValue(16, null), null);
  assert.equal(feelsLikeValue(16, undefined), null);
});

test('feelsLikeValue: missing actual temp → null', () => {
  assert.equal(feelsLikeValue(null, 16), null);
});

// ── rainColor / sparkline intensity ─────────────────────────────────────

test('rainColor: monotonically darkens as mm increases (no banding)', () => {
  // Below the cap, every distinct mm level should map to a distinct shade —
  // no jumping between a fixed set of bands.
  const samples = [0, 0.5, 1, 2.4, 5, 10, 15].map(rainColor);
  const uniqueCount = new Set(samples).size;
  assert.equal(uniqueCount, samples.length, 'every mm level below the cap should map to a distinct shade');
});

test('rainColor: fixed hue throughout — always reads as blue, never drifts toward green/red', () => {
  for (const mm of [0, 1, 2.4, 10, 30, 100]) {
    const hex = rainColor(mm);
    assert.match(hex, /^#[0-9a-f]{6}$/);
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    assert.ok(b >= r, `expected blue-dominant colour for ${mm}mm, got ${hex}`);
  }
});

test('rainColor: caps out at full darkness beyond RAIN_CAP_MM, does not keep changing', () => {
  assert.equal(rainColor(20), rainColor(50));
  assert.equal(rainColor(20), rainColor(1000));
});

test('rainColor: null/negative mm treated as zero (lightest shade)', () => {
  assert.equal(rainColor(null), rainColor(0));
  assert.equal(rainColor(undefined), rainColor(0));
  assert.equal(rainColor(-1), rainColor(0));
});

test('sparkline: gradient has one stop per known-probability hour, no per-hour rects', () => {
  const h = {
    time: ['2026-08-10T00:00', '2026-08-10T01:00', '2026-08-10T02:00'],
    precipitation_probability: [80, 20, null],
    precipitation: [8, 0.2, null],
    temperature_2m: [10, 11, 12],
  };
  const svg = sparkline(h, '2026-08-10', 5, 15);
  // Only ever one background rect now — the rain area is a single gradient-
  // filled <path>, not one <rect> per hour (that read as discrete bars with
  // a visible gap between every hour).
  assert.equal((svg.match(/<rect/g) || []).length, 1);
  assert.equal((svg.match(/<stop/g) || []).length, 2); // the null-probability hour is skipped
  assert.ok(svg.includes(rainColor(8)));
  assert.ok(svg.includes(rainColor(0.2)));
  assert.ok(svg.includes('linearGradient'));
});

test('sparkline: no known probability → no gradient/rain area, empty string only when no hours match', () => {
  const h = { time: ['2026-08-10T00:00'], precipitation_probability: [null], precipitation: [null], temperature_2m: [10] };
  const svg = sparkline(h, '2026-08-10', 5, 15);
  assert.equal((svg.match(/<stop/g) || []).length, 0);
  assert.ok(!svg.includes('url(#rg'));
});

test('sparkline: unmatched date returns empty string', () => {
  const h = { time: ['2026-08-10T00:00'], precipitation_probability: [50], precipitation: [1], temperature_2m: [10] };
  assert.equal(sparkline(h, '2099-01-01', 5, 15), '');
});
