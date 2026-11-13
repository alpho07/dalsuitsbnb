import { BIZ } from "./config.js";

// All dates are plain ISO strings (YYYY-MM-DD) in Nairobi local time.
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function todayISO(now = Date.now()) {
  return new Date(now + BIZ.tzOffsetHours * 3600e3).toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function nightsBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}
export function fmt(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const m = MONTHS[d.getUTCMonth()];
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${m[0].toUpperCase() + m.slice(1)} ${d.getUTCFullYear()}`;
}
function valid(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(iso + "T00:00:00Z");
  return t.getUTCDate() === d ? iso : null; // rejects 31/02
}
function withYear(m, d, y, today) {
  if (y != null) { if (y < 100) y += 2000; return valid(y, m, d); }
  const ty = Number(today.slice(0, 4));
  const iso = valid(ty, m, d);
  if (!iso) return null;
  return iso < today ? valid(ty + 1, m, d) : iso; // "20/1" in December means next January
}

/** Parse what a guest types: 20/12, 20-12-2026, 2026-12-20, 20 Dec, Dec 20th, today, tomorrow, kesho. */
export function parseDate(input, today = todayISO()) {
  const t = String(input || "").trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ");
  if (!t) return null;
  if (/^(today|leo)$/.test(t)) return today;
  if (/^(tomorrow|tmrw|tmr|kesho)$/.test(t)) return addDays(today, 1);
  let m;
  if ((m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return valid(+m[1], +m[2], +m[3]);
  if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/))) return withYear(+m[2], +m[1], m[3] ? +m[3] : null, today);
  const mon = s => MONTHS.indexOf(s.slice(0, 3)) + 1;
  if ((m = t.match(/^(\d{1,2})\s+([a-z]{3,9})(?:\s+(\d{2,4}))?$/)) && mon(m[2])) return withYear(mon(m[2]), +m[1], m[3] ? +m[3] : null, today);
  if ((m = t.match(/^([a-z]{3,9})\s+(\d{1,2})(?:\s+(\d{2,4}))?$/)) && mon(m[1])) return withYear(mon(m[1]), +m[2], m[3] ? +m[3] : null, today);
  return null;
}
