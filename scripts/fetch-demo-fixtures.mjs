// Fetches 2-day WX + 225-point precipitation grid for three demo-mode Manchester
// weather events: two older named storms (via the historical archive API,
// which only has reanalysis models — coarser than live and no probability
// product) and one recent wet day (via the regular forecast API with
// models=ukmo_seamless, the same data source the live app uses, so its
// resolution and probability match production).
// Run with: npm run fetch-demo-fixtures

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
mkdirSync(dir, { recursive: true });

const CENTER   = { lat: 53.4631, lon: -2.2913 };
const GRID_N   = 15, GRID_STEP = 0.025;
const ARCHIVE  = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

const EVENTS = [
  { name:'storm', source:'archive', start:'2025-01-24', end:'2025-01-25', note:'Storm Éowyn: 51mph gusts, heavy rain' },
  { name:'wet',   source:'recent',  start:'2026-06-11', end:'2026-06-12', note:'Wettest day in the last 92d: 15.3mm — real UKMO resolution + real probability, same source as live' },
  { name:'snow',  source:'archive', start:'2024-01-16', end:'2024-01-17', note:'Snow: sub-zero, WMO 71+73' },
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

// Archive API has no probability product at all (it's a forecast concept,
// there's nothing to report for an observed hour). For the archive-sourced
// demo events we fake a plausible, monotonic mm→% curve so the sparkline and
// %-column have something to render. Clearly synthetic — flagged in the note.
function fakeProbability(mm) {
  if (!mm || mm < 0.05) return 0;
  return Math.round(Math.min(97, 20 + Math.sqrt(mm / 4) * 70));
}

async function fetchArchiveEvent(ev) {
  const wxRes = await fetch(`${ARCHIVE}?${params({
    latitude: CENTER.lat, longitude: CENTER.lon,
    start_date: ev.start, end_date: ev.end,
    hourly: 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    daily:  'temperature_2m_max,temperature_2m_min,weather_code',
    wind_speed_unit: 'mph', timezone: 'auto',
  })}`).then(r => r.json());
  if (wxRes.error) throw new Error(`WX error: ${wxRes.reason}`);

  const wx = {
    hourly: {
      ...wxRes.hourly,
      precipitation_probability: wxRes.hourly.precipitation.map(fakeProbability),
    },
    daily: wxRes.daily,
    _fixture_note: `${ev.note} (precip probability synthesized from mm — archive API has no probability product)`,
  };

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
    _fixture_note: `Grid (225pt, ERA5 reanalysis ~25km — coarser than live UKMO) · ${ev.note}`,
  };
  return { wx, grid };
}

async function fetchRecentEvent(ev) {
  const common = { start_date: ev.start, end_date: ev.end, timezone: 'auto' };

  // Temp/wind/weather_code from UKMO — same model the live app uses.
  const wxRes = await fetch(`${FORECAST}?${params({
    latitude: CENTER.lat, longitude: CENTER.lon, ...common,
    hourly: 'temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code',
    daily:  'temperature_2m_max,temperature_2m_min,weather_code',
    models: 'ukmo_seamless', wind_speed_unit: 'mph',
  })}`).then(r => r.json());
  if (wxRes.error) throw new Error(`WX error: ${wxRes.reason}`);

  // Precipitation amount + probability both from the default ensemble call,
  // mirroring loadForecast() in index.html, so they stay mutually consistent.
  const prRes = await fetch(`${FORECAST}?${params({
    latitude: CENTER.lat, longitude: CENTER.lon, ...common,
    hourly: 'precipitation,precipitation_probability',
  })}`).then(r => r.json());
  if (prRes.error) throw new Error(`Probability error: ${prRes.reason}`);

  const idx = new Map(prRes.hourly.time.map((t,i) => [t,i]));
  const wx = {
    hourly: {
      ...wxRes.hourly,
      precipitation: wxRes.hourly.time.map(t => { const i = idx.get(t); return i==null ? null : prRes.hourly.precipitation[i]; }),
      precipitation_probability: wxRes.hourly.time.map(t => { const i = idx.get(t); return i==null ? null : prRes.hourly.precipitation_probability[i]; }),
    },
    daily: wxRes.daily,
    _fixture_note: ev.note,
  };

  const { lats, lons } = gridLatLons();
  const gridRes = await fetch(`${FORECAST}?${params({
    latitude: lats.join(','), longitude: lons.join(','), ...common,
    hourly: 'precipitation', models: 'ukmo_seamless',
  })}`).then(r => r.json());
  if (!Array.isArray(gridRes)) throw new Error(`Grid error: ${JSON.stringify(gridRes).slice(0,200)}`);

  const grid = {
    times:  gridRes[0].hourly.time,
    values: gridRes.map(d => d.hourly.precipitation),
    _fixture_note: `Grid (225pt, UKMO ~2km — same source as live) · ${ev.note}`,
  };
  return { wx, grid };
}

for (const ev of EVENTS) {
  console.log(`\n── ${ev.name}  ${ev.start} → ${ev.end}  [${ev.source}]`);

  const { wx, grid } = ev.source === 'archive' ? await fetchArchiveEvent(ev) : await fetchRecentEvent(ev);

  const wxFile = `manchester-${ev.name}-${ev.start}.json`;
  writeFileSync(join(dir, wxFile), JSON.stringify(wx, null, 2));
  const totalMm  = wx.hourly.precipitation.reduce((a,b) => a+(b||0), 0);
  const maxGust  = Math.max(...wx.hourly.wind_gusts_10m);
  const wmoSet   = [...new Set(wx.hourly.weather_code)].sort((a,b)=>a-b).join(',');
  const probRange = wx.hourly.precipitation_probability.filter(p => p != null);
  console.log(`  WX  ${wx.hourly.time.length}h  ${totalMm.toFixed(1)}mm  gust ${maxGust.toFixed(1)}mph  codes [${wmoSet}]  prob ${probRange.length ? Math.min(...probRange)+'–'+Math.max(...probRange)+'%' : 'MISSING'}`);

  const gridFile = `grid-${ev.name}-${ev.start}.json`;
  writeFileSync(join(dir, gridFile), JSON.stringify(grid));
  const flat = grid.values.flat();
  const nonzero = flat.filter(v => v > 0).length;
  const maxCell = Math.max(...flat);
  const distinctVals = new Set(flat.map(v => v.toFixed(2))).size;
  console.log(`  Grid ${grid.values.length}pt × ${grid.times.length}h  ${nonzero} non-zero cells  max ${maxCell.toFixed(2)}mm  ${distinctVals} distinct values (higher = less blocky)`);
}

console.log('\n✓ done');
