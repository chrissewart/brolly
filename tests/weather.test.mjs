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
} from '../lib/weather.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = name => JSON.parse(readFileSync(join(dir, 'fixtures', name)));

const storm = fixture('manchester-storm-2025-01-24.json');
const wet   = fixture('manchester-wet-2023-10-20.json');
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
  assert.ok(total >= 20, `expected ≥20mm total, got ${total.toFixed(1)}mm`);
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
