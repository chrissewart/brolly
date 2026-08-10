// Pure, browser-agnostic weather logic.
// Imported by both index.html (as a module) and the test suite.

export const WMO = {
  0:["☀️","Clear",0],1:["🌤️","Mostly clear",0],2:["⛅","Partly cloudy",0],3:["☁️","Overcast",0],
  45:["🌫️","Fog",0],48:["🌫️","Freezing fog",0],
  51:["🌦️","Light drizzle",1],53:["🌦️","Drizzle",1],55:["🌧️","Heavy drizzle",1],
  56:["🌧️","Freezing drizzle",1],57:["🌧️","Freezing drizzle",1],
  61:["🌦️","Light rain",1],63:["🌧️","Rain",1],65:["🌩️","Heavy rain",1],
  66:["🌧️","Freezing rain",1],67:["🌧️","Freezing rain",1],
  71:["🌨️","Light snow",1],73:["🌨️","Snow",1],75:["❄️","Heavy snow",1],77:["❄️","Snow grains",1],
  80:["🌦️","Light showers",1],81:["🌧️","Showers",1],82:["⛈️","Heavy showers",1],
  85:["🌨️","Snow showers",1],86:["❄️","Snow showers",1],
  95:["⛈️","Thunderstorm",1],96:["⛈️","Thunder + hail",1],99:["⛈️","Thunder + hail",1],
};

export const meta       = c => WMO[c] || ["•","—",0];
export const ic         = c => meta(c)[0];
export const lbl        = c => meta(c)[1];
export const isRainCode = c => !!meta(c)[2];

export const DROP = "💧";

export function rainBars(mm, code, prob) {
  let n = 0;
  if (mm != null && mm > 0)
    n = mm < 0.5 ? 1 : mm < 2 ? 2 : 3;
  else if (isRainCode(code))
    n = code===82||code===65||code===75||code===95||code===96||code===99 ? 3
      : code===80||code===61||code===51||code===71 ? 1 : 2;
  else if (prob != null && prob >= 60)
    n = 1;
  return DROP.repeat(n);
}

export const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const PODS = [["morning",5,11],["midday",11,14],["afternoon",14,18],["evening",18,23]];

export function podProb(h, dateStr, fromH, toH) {
  let m = null;
  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].startsWith(dateStr)) continue;
    const hh = +h.time[i].slice(11,13);
    if (hh >= fromH && hh < toH && h.precipitation_probability[i] != null)
      m = Math.max(m ?? 0, h.precipitation_probability[i]);
  }
  return m;
}

export function weekTempBounds(h) {
  let lo = Infinity, hi = -Infinity;
  for (const v of h.temperature_2m) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo === hi) { lo -= 1; hi += 1; }
  return [lo, hi];
}

// Intensity scale: ONE fixed hue (matches --rain), continuously darkening
// with mm — shared with the radar overlay (index.html's precipStyle()) so
// "darker = heavier rain" means the same thing everywhere in the app.
// Replaces an earlier 6-band hue ramp (light blue→teal→yellow→orange→red):
// that read as genuinely *different* colours rather than "the same rain,
// more of it" (teal in particular registered as green to a real tester),
// and risked visually merging with the orange temp line at the red end.
// Calibrated against UK Met Office hourly rain-rate categories — light
// <2.5mm/h, moderate 2.5–10, heavy 10–50, violent >50 — but only to set how
// steeply the curve darkens, not as hard colour bands: RAIN_CAP_MM sits
// solidly inside "heavy" so the scale reaches full darkness well before the
// rare "violent" tier, rather than needing 50mm/h to look serious.
const RAIN_HUE = 197;
const RAIN_CAP_MM = 20;

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  const hex = v => v.toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

export function rainColor(mm) {
  const v = mm == null || mm < 0 ? 0 : mm;
  const t = Math.min(1, Math.sqrt(v / RAIN_CAP_MM));
  return hslToHex(RAIN_HUE, 45 + t * 20, 88 - t * 70);
}

export function sparkline(h, dateStr, tlo, thi) {
  const rain = [], temp = [];
  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].startsWith(dateStr)) continue;
    const hh = +h.time[i].slice(11,13);
    rain.push([hh, h.precipitation_probability[i], h.precipitation[i]]);
    temp.push([hh, h.temperature_2m[i]]);
  }
  if (!rain.length) return "";
  const rp = rain.filter(([,y]) => y != null);
  const rainPath = rp.length ? rp.map(([x,y],n) => (n?"L":"M")+x+" "+(100-y)).join(" ") : "";
  const rainArea = rp.length ? rainPath+` L${rp[rp.length-1][0]} 100 L${rp[0][0]} 100 Z` : "";
  // One continuous area (same shape as the old flat-colour version), filled
  // with a gradient built from each hour's real mm reading — not per-hour
  // <rect> segments, which read as discrete bars with a visible seam
  // between every hour (a tester's exact complaint: "bars with white lines
  // between them... the reality is continuous"). A gradient blends smoothly
  // hour to hour while still being driven by real per-hour data.
  const gradId = "rg" + dateStr.replace(/-/g, "");
  const stops = rp.map(([x,,mm]) => `<stop offset="${(x/23*100).toFixed(2)}%" stop-color="${rainColor(mm)}"/>`).join("");
  const sc = v => 100 - ((v-tlo)/(thi-tlo))*100;
  const tempPath = temp.map(([x,y],n) => (n?"L":"M")+x+" "+sc(y).toFixed(1)).join(" ");
  return `<svg class="spark" viewBox="0 0 23 100" preserveAspectRatio="none">
    <defs>${stops?`<linearGradient id="${gradId}" x1="0" x2="23" y1="0" y2="0" gradientUnits="userSpaceOnUse">${stops}</linearGradient>`:""}</defs>
    <rect x="0" y="0" width="23" height="100" fill="#eef2f0"/>
    ${[6,12,18].map(x=>`<line x1="${x}" y1="0" x2="${x}" y2="100" stroke="#d4d9d6" stroke-width="0.3"/>`).join("")}
    ${rainArea?`<path d="${rainArea}" fill="url(#${gradId})" fill-opacity="0.88"/>`:""}
    ${rainPath?`<path d="${rainPath}" fill="none" stroke="#0d7fa3" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`:""}
    <path d="${tempPath}" fill="none" stroke="#c46a1f" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="miter" stroke-linecap="butt"/>
  </svg>
  <div class="axlbl"><span style="left:26.1%">6</span><span style="left:52.2%">12</span><span style="left:78.3%">18</span></div>`;
}

export function daySummaryText(h, dateStr, name) {
  const parts = PODS.map(([n,a,b]) => ({n, p: podProb(h, dateStr, a, b)}));
  const known = parts.filter(p => p.p != null);
  if (!known.length) return `<b>${name}:</b> hourly detail not available this far out.`;
  const wet  = known.filter(p => p.p >= 50).map(p => p.n);
  const iffy = known.filter(p => p.p >= 25 && p.p < 50).map(p => p.n);
  let s;
  if (!wet.length && !iffy.length) s = "dry";
  else if (wet.length === known.length) s = "rain on and off all day";
  else {
    s = wet.length ? "rain likely "+wet.join(" & ") : "";
    if (iffy.length) s += (s?", ":"")+"chance of a shower "+iffy.join(" & ");
  }
  return `<b>${name}:</b> ${s}.`;
}

// ── Hourly look-back / 7-day list helpers ───────────────────────────────────
// Pure grouping/trimming logic backing two roadmap items — "look back one
// day" and "7 days of hourly, lazily rendered" — kept here so both can be
// unit tested without a DOM; index.html only turns the groups into HTML.

export function localDateStr(d) {
  const z = n => String(n).padStart(2, "0");
  return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate());
}

// Drops the leading `n` entries off every array in a daily/hourly-shaped
// block. Used to strip the extra past_days lookback off the *daily* block
// only — the top week-strip should still start at today; only the hourly
// list wants yesterday.
export function dropLeadingDays(block, n) {
  if (!n) return block;
  const out = {};
  for (const k in block) out[k] = block[k].slice(n);
  return out;
}

export function sliceHourly(h, idx) {
  if (!idx) return h;
  const out = {};
  for (const k in h) out[k] = h[k].slice(idx);
  return out;
}

// Buckets hourly rows from index `fromIdx` onward into consecutive-day
// groups, each `{date: "YYYY-MM-DD", idxs: [i, i+1, ...]}` — the shared
// building block for both the eagerly-rendered days and the
// scroll-triggered later ones.
export function hourlyDayGroups(h, fromIdx = 0) {
  const groups = [];
  let cur = null;
  for (let i = fromIdx; i < h.time.length; i++) {
    const date = h.time[i].slice(0, 10);
    if (!cur || cur.date !== date) { cur = {date, idxs: []}; groups.push(cur); }
    cur.idxs.push(i);
  }
  return groups;
}

// ── Feels-like temperature ───────────────────────────────────────────────
// Rounded feels-like value to display, or null when unavailable (demo
// fixtures don't carry apparent_temperature). Deliberately does NOT
// suppress the value just because it rounds the same as the actual temp —
// an earlier version did that, and hiding/showing a value hour-to-hour
// depending on whether they happened to match made the row layout visibly
// jitter (temp shifting sideways, detail-view stats jumping up/down) as you
// scrolled. Whether apparent_temperature exists at all is uniform across an
// entire fetch (present for every hour live, absent for every hour in
// demo mode) — that's the only thing safe to key visibility off of.
export function feelsLikeValue(actual, feels) {
  if (feels == null || actual == null) return null;
  return Math.round(feels);
}

// anchor: Date or ISO string — injectable so tests can be deterministic
export function buildSampleData(anchor = new Date()) {
  const hourly = {
    time:[], temperature_2m:[], precipitation_probability:[], precipitation:[],
    wind_speed_10m:[], wind_gusts_10m:[], wind_direction_10m:[], weather_code:[],
  };
  const start = new Date(anchor);
  start.setMinutes(0,0,0);
  start.setHours(0);
  const z = n => String(n).padStart(2,"0");
  const localIso = d =>
    d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())+"T"+z(d.getHours())+":00";

  for (let i = 0; i < 96; i++) {
    const dt = new Date(start.getTime()+i*3600e3), h = dt.getHours(), day = Math.floor(i/24);
    hourly.time.push(localIso(dt));
    let temp, p, mm, ws, wg, code, dir = 240+Math.round(20*Math.sin(i/9));
    if (day === 0) {
      temp = 14.5+4.5*Math.sin((h-9)/24*2*Math.PI);
      p = Math.max(0,Math.min(90,Math.round(20+45*Math.sin((h-10)/9))));
      mm=p>70?1.8:p>55?0.4:0; ws=10+(p>50?4:0); wg=ws+8;
      code=mm>=2?82:mm>=0.5?80:mm>0?61:p>35?3:(h>5&&h<21?2:1);
    } else if (day === 1) {
      temp = 11+3*Math.sin((h-9)/24*2*Math.PI);
      p = Math.max(20,Math.min(98,Math.round(60+30*Math.sin(h/4))));
      mm=p>80?3.5:p>60?1.5:0.3; ws=28+Math.round(10*Math.sin(h/3)); wg=ws+12; dir=210;
      code=mm>=2?82:mm>=0.5?63:61;
    } else {
      temp = -3+3*Math.sin((h-12)/24*2*Math.PI);
      p = Math.max(0,Math.min(85,Math.round(35+35*Math.sin((h-9)/8))));
      mm=p>60?1.2:p>40?0.5:0; ws=8; wg=15;
      code=mm>=1?75:mm>0?73:p>30?71:(h>6&&h<18?2:3);
    }
    hourly.temperature_2m.push(Math.round(temp*10)/10);
    hourly.precipitation_probability.push(p);
    hourly.precipitation.push(Math.round(mm*10)/10);
    hourly.wind_speed_10m.push(Math.round(ws));
    hourly.wind_gusts_10m.push(Math.round(wg));
    hourly.wind_direction_10m.push(dir);
    hourly.weather_code.push(code);
  }

  const daily = {time:[], temperature_2m_max:[], temperature_2m_min:[], weather_code:[]};
  for (let d = 0; d < 7; d++) {
    const dt = new Date(start.getTime()+d*86400e3), ds = localIso(dt).slice(0,10);
    daily.time.push(ds);
    if (d < 4) {
      const ts = [], cs = [];
      hourly.time.forEach((t,i) => {
        if (t.startsWith(ds)) { ts.push(hourly.temperature_2m[i]); cs.push(hourly.weather_code[i]); }
      });
      daily.temperature_2m_max.push(Math.round(Math.max(...ts)));
      daily.temperature_2m_min.push(Math.round(Math.min(...ts)));
      const worst = [82,75,73,71,63,61,80,3,2,1].find(c => cs.includes(c));
      daily.weather_code.push(worst ?? 2);
    } else {
      daily.temperature_2m_max.push(12+d-4);
      daily.temperature_2m_min.push(5);
      daily.weather_code.push([2,80,3][d-4]);
    }
  }
  return {hourly, daily};
}
