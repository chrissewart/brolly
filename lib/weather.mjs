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

export function sparkline(h, dateStr, tlo, thi) {
  const rain = [], temp = [];
  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].startsWith(dateStr)) continue;
    const hh = +h.time[i].slice(11,13);
    rain.push([hh, h.precipitation_probability[i]]);
    temp.push([hh, h.temperature_2m[i]]);
  }
  if (!rain.length) return "";
  const rp = rain.filter(([,y]) => y != null);
  const rainPath = rp.length ? rp.map(([x,y],n) => (n?"L":"M")+x+" "+(100-y)).join(" ") : "";
  const rainArea = rp.length ? rainPath+` L${rp[rp.length-1][0]} 100 L${rp[0][0]} 100 Z` : "";
  const sc = v => 100 - ((v-tlo)/(thi-tlo))*100;
  const tempPath = temp.map(([x,y],n) => (n?"L":"M")+x+" "+sc(y).toFixed(1)).join(" ");
  return `<svg class="spark" viewBox="0 0 23 100" preserveAspectRatio="none">
    <rect x="0" y="0" width="23" height="100" fill="#eef2f0"/>
    ${[6,12,18].map(x=>`<line x1="${x}" y1="0" x2="${x}" y2="100" stroke="#d4d9d6" stroke-width="0.3"/>`).join("")}
    ${rainArea?`<path d="${rainArea}" fill="#0d7fa3" fill-opacity="0.2"/>`:""}
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
