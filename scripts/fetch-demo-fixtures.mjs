// Fetches 2-day WX + 225-point precipitation grid from the Open-Meteo
// archive API for three historic Manchester weather events.
// Run with: npm run fetch-demo-fixtures

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
mkdirSync(dir, { recursive: true });

const CENTER  = { lat: 53.4631, lon: -2.2913 };
const GRID_N  = 15, GRID_STEP = 0.025;
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

const EVENTS = [
  { name:'storm', start:'2025-01-24', end:'2025-01-25', note:'Storm Éowyn: 51mph gusts, heavy rain' },
  { name:'wet',   start:'2023-10-20', end:'2023-10-21', note:'Very wet: 41.8mm, heavy rain codes' },
  { name:'snow',  start:'2024-01-16', end:'2024-01-17', note:'Snow: sub-zero, WMO 71+73' },
];

function gridLatLons() {
  const half = Math.floor(GRID_N / 2) * GRID_STEP;
  const lats = [], lons = [];
  for (let r = 0; r < GRID_N; r++)
    for (let c = 0; c < GRID_N; c++) {
      lats.push((CENTER.lat - half + r * GRID_STEP).toFixed(4));
      lons.push((CENTER.lon - half + c * GRID_STEP).toFixed(4));
    }
  return { lats, lons };
}

function params(obj) {
  return Object.entries(obj).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

for (const ev of EVENTS) {
  console.log(`\n── ${ev.name}  ${ev.start} → ${ev.end}`);

  // ── WX: single-location hourly + daily ──────────────────────────────────
  const wxRes = await fetch(`${ARCHIVE}?${params({
    latitude: CENTER.lat, longitude: CENTER.lon,
    start_date: ev.start, end_date: ev.end,
    hourly: 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    daily:  'temperature_2m_max,temperature_2m_min,weather_code',
    wind_speed_unit: 'mph', timezone: 'auto',
  })}`).then(r => r.json());

  if (wxRes.error) throw new Error(`WX error: ${wxRes.reason}`);

  const wx = {
    hourly: { ...wxRes.hourly, precipitation_probability: wxRes.hourly.time.map(() => null) },
    daily:  wxRes.daily,
    _fixture_note: ev.note,
  };
  const wxFile = `manchester-${ev.name}-${ev.start}.json`;
  writeFileSync(join(dir, wxFile), JSON.stringify(wx, null, 2));
  const totalMm  = wx.hourly.precipitation.reduce((a,b) => a+b, 0);
  const maxGust  = Math.max(...wx.hourly.wind_gusts_10m);
  const wmoSet   = [...new Set(wx.hourly.weather_code)].sort((a,b)=>a-b).join(',');
  console.log(`  WX  ${wx.hourly.time.length}h  ${totalMm.toFixed(1)}mm  gust ${maxGust.toFixed(1)}mph  codes [${wmoSet}]`);

  // ── Grid: 225-point multi-location ──────────────────────────────────────
  const { lats, lons } = gridLatLons();
  const gridRes = await fetch(`${ARCHIVE}?${params({
    latitude:  lats.join(','), longitude: lons.join(','),
    start_date: ev.start, end_date: ev.end,
    hourly: 'precipitation', timezone: 'auto',
  })}`).then(r => r.json());

  if (!Array.isArray(gridRes)) throw new Error(`Grid error: ${JSON.stringify(gridRes).slice(0,200)}`);

  const grid = {
    times:  gridRes[0].hourly.time,
    values: gridRes.map(d => d.hourly.precipitation),
    _fixture_note: `Grid (225pt) · ${ev.note}`,
  };
  const gridFile = `grid-${ev.name}-${ev.start}.json`;
  writeFileSync(join(dir, gridFile), JSON.stringify(grid));
  const nonzero = grid.values.flat().filter(v => v > 0).length;
  const maxCell = Math.max(...grid.values.flat());
  console.log(`  Grid ${grid.values.length}pt × ${grid.times.length}h  ${nonzero} non-zero cells  max ${maxCell.toFixed(2)}mm`);
}

console.log('\n✓ done');
