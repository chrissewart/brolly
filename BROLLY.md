# Brolly — handoff brief

A single-file weather PWA for the UK, biased toward **runners** deciding what to
wear and when to go. Built in a sandboxed chat; moving to Claude Code to work
against live APIs and deploy. `weather.html` in this folder is the working
reference implementation — start from it.

## Core design philosophy (do not lose these)

1. **Hourly detail is the main event; daily is deliberately compact.** UK
   forecasts decay fast, so beyond ~48h there's little point in detail. Days 3+
   in the daily strip are visually faded. Detail spends screen space where it's
   trustworthy.
2. **Honesty about uncertainty** beats impressive-looking fake precision.
3. **Runner's use case is primary**: "will I get wet, and at which point in the
   run" — e.g. pick a route so you get rained on at the *end* of a long run, not
   the start.

## Layout

- **Header**: location + "updated" time / sample-data warning.
- **Daily strip** (horizontal scroll): per day — name, WMO icon, hi/lo temp, and
  a 24h sparkline showing rain probability (0–100%) plus a thin temperature line
  scaled to the **week** min/max so days are comparable. Vertical rules at
  06/12/18, axis labels under them. Days 3+ faded.
- **Summary line**: plain-English part-of-day outlook (morning/midday/afternoon/
  evening) for today + tomorrow, computed from hourly rain-probability maxima.
- **Hourly list**: today + tomorrow only (chopped at end of tomorrow so the
  day-after never half-appears). Columns: time · WMO icon · temp · rain droplets
  · rain % · wind (arrow + speed/gust). High wind (≥30mph sustained or gust)
  flagged red. Tap an hour → detail view; tap a day card → its summary + scroll.
- **Detail view** (full screen): stats (temp/rain%/wind/gust), condition text,
  radar map, and a **scrub control** — drag from centre, further = faster, moves
  the viewed hour forward/back. Swipe right to go back. Radar only exists for
  ~past 2h + 30min nowcast; beyond that the map dims with "forecast only".

## Data architecture

- **Forecast**: Open-Meteo, no API key. Temp/wind/weather_code from
  `models=ukmo_seamless` (Met Office UKV — best UK model). **Precipitation amount
  AND probability both from the default ensemble call** so they're mutually
  consistent (UKMO publishes no probability product — mixing sources caused a bug
  where 94% probability landed on an hour UKMO called dry).
- **Radar**: RainViewer free tier (past 2h + ~30min nowcast). `maxNativeZoom:7`
  so tiles upscale rather than erroring at high zoom.
- **Icons**: WMO weather codes (0–99) from the API mapped to emoji + label. The
  classification is the API's, not inferred. Heavy categories use darker glyphs.
- **Wind**: mph. **Sample/fallback** data is procedurally generated (day0 showery,
  day1 storm w/ high wind, day2 wintry sub-zero snow) and used when the live API
  is unreachable — clearly flagged "⚠ sample data".

## Open issues to tackle first in Claude Code

1. **TEMPERATURE BUG (priority).** User reports our temps read colder than the
   Pixel Weather app and colder than lived experience. Diagnose against raw JSON:
   `https://api.open-meteo.com/v1/forecast?latitude=53.4631&longitude=-2.2913&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m&models=ukmo_seamless&wind_speed_unit=mph&timezone=auto&forecast_days=1`
   Compare raw `temperature_2m` ⟷ what Brolly renders ⟷ Pixel. If raw matches
   Brolly → it's model choice (UKMO vs whatever Pixel uses) or feels-like vs
   air-temp, i.e. expected. If raw is warmer than Brolly renders → real bug, check
   units and hour-index alignment between the two API calls.
2. **Validate sample data against real data** generally — sample was internally
   consistent by construction and hid issue #1.
3. **Tune**: droplet opacity (currently 55%), wind threshold (30mph), week vs
   per-day temp-line scaling.

## Roadmap / nice-to-haves

- **Future precipitation overlay** (the interesting one): true forecast-radar
  tiles are all paid. Free, keyless alternative — fetch Open-Meteo hourly precip
  for an ~80-point grid around the user (it accepts coordinate lists) and draw an
  interpolated heatmap on a canvas overlay, out to 48h. Coarse model output, but
  honest and fits the no-server architecture.
- **Location search** (Open-Meteo free geocoding endpoint).
- **Offline cache** of last response for quick glances.
- **Data-source toggle** (UKMO ⟷ global blend) to compare against window.

## Deployment

- It's one self-contained HTML file → add `manifest.json` + a small service
  worker → "Add to Home Screen" installs it as a PWA.
- **GitHub Pages** works for the static file. **But** if a keyed radar/precip API
  is ever adopted, the key would ship to the client and get scraped — put a free
  **Cloudflare Worker** in front to hold the key server-side and proxy tile
  requests. At that point **Cloudflare Pages + Functions** hosts the app and proxy
  together and is the better home than GH Pages.
- App name: **Brolly**.
