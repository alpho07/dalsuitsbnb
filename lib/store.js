// Storage for the WhatsApp bot. Picks a backend from the environment:
//   MySQL   DB_HOST + DB_NAME + DB_USER (+ DB_PASSWORD, DB_PORT)   Hostinger
//   Redis   KV_REST_API_URL + KV_REST_API_TOKEN (Upstash)          Vercel
//   memory  nothing set                                            local testing only
//
// MySQL tables (created automatically on first use):
//   dal_kv        sessions, handoff flags, webhook de-duplication (with expiry)
//   dal_bookings  one row per booking; rows delete themselves retentionDays after check-out
import { BIZ } from "./config.js";
import { nightsBetween, todayISO } from "./dates.js";

const env = process.env;
const REDIS_URL = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
export const storageMode = env.DB_HOST && env.DB_NAME && env.DB_USER ? "mysql" : REDIS_URL && REDIS_TOKEN ? "redis" : "memory";

/* ------------------------------------------------------------------ MySQL */

let poolPromise = null;
function pool() {
  if (!poolPromise) poolPromise = (async () => {
    const mysql = await import("mysql2/promise");
    const p = mysql.createPool({
      host: env.DB_HOST, port: Number(env.DB_PORT) || 3306, user: env.DB_USER, password: env.DB_PASSWORD,
      database: env.DB_NAME, connectionLimit: 4, charset: "utf8mb4", dateStrings: true
    });
    await p.query(`CREATE TABLE IF NOT EXISTS dal_kv (
      k VARCHAR(191) NOT NULL PRIMARY KEY, v MEDIUMTEXT NOT NULL, exp BIGINT NULL, INDEX (exp)
    ) CHARACTER SET utf8mb4`);
    await p.query(`CREATE TABLE IF NOT EXISTS dal_bookings (
      ref VARCHAR(32) NOT NULL PRIMARY KEY, suite VARCHAR(8) NOT NULL, check_in DATE NOT NULL, check_out DATE NOT NULL,
      guests INT NOT NULL DEFAULT 0, name VARCHAR(120) NOT NULL DEFAULT '', phone VARCHAR(20) NOT NULL DEFAULT '',
      status VARCHAR(16) NOT NULL, source VARCHAR(16) NOT NULL DEFAULT '', notes TEXT, data MEDIUMTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expires_at BIGINT NOT NULL, INDEX (check_in), INDEX (status), INDEX (expires_at)
    ) CHARACTER SET utf8mb4`);
    return p;
  })().catch(e => { poolPromise = null; throw e; });
  return poolPromise;
}
const q = async (sql, args = []) => (await (await pool()).query(sql, args))[0];
/** Run a parameterised query on the MySQL pool (MySQL mode only). */
export const sql = q;

let lastPurge = 0;
async function purgeExpired() {
  if (Date.now() - lastPurge < 10 * 60e3) return;
  lastPurge = Date.now();
  await q("DELETE FROM dal_kv WHERE exp IS NOT NULL AND exp < ?", [Date.now()]);
  await q("DELETE FROM dal_bookings WHERE expires_at < ?", [Date.now()]);
}

/* ------------------------------------------------------------------ Redis */

async function redis(...args) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  const j = await r.json();
  if (j.error) throw new Error("Redis: " + j.error);
  return j.result;
}

/* ----------------------------------------------------------------- memory */

const mem = globalThis.__dalMem || (globalThis.__dalMem = { kv: new Map(), sets: new Map() });
const memGet = k => { const e = mem.kv.get(k); if (!e) return null; if (e.exp && e.exp < Date.now()) { mem.kv.delete(k); return null; } return e.v; };
const memSet = (k, v, ttl) => mem.kv.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });

/* ------------------------------------------------------ key/value helpers */

async function get(k) {
  if (storageMode === "mysql") return (await q("SELECT v FROM dal_kv WHERE k = ? AND (exp IS NULL OR exp > ?)", [k, Date.now()]))[0]?.v ?? null;
  if (storageMode === "redis") return redis("GET", k);
  return memGet(k);
}
async function set(k, v, ttl) {
  if (storageMode === "mysql") return q("INSERT INTO dal_kv (k, v, exp) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), exp = VALUES(exp)", [k, v, ttl ? Date.now() + ttl * 1000 : null]);
  if (storageMode === "redis") return ttl ? redis("SET", k, v, "EX", ttl) : redis("SET", k, v);
  return memSet(k, v, ttl);
}
async function del(k) {
  if (storageMode === "mysql") return q("DELETE FROM dal_kv WHERE k = ?", [k]);
  if (storageMode === "redis") return redis("DEL", k);
  return mem.kv.delete(k);
}
const getJSON = async k => { const v = await get(k); return v ? JSON.parse(v) : null; };

/** Health check: confirms the database answers. */
export async function ping() {
  if (storageMode === "mysql") { await q("SELECT 1"); return true; }
  if (storageMode === "redis") return (await redis("PING")) === "PONG";
  return true;
}

export async function firstSeen(msgId) {
  if (!msgId) return true;
  const k = "seen:" + msgId;
  if (storageMode === "mysql") {
    await q("DELETE FROM dal_kv WHERE k = ? AND exp < ?", [k, Date.now()]);
    const r = await q("INSERT IGNORE INTO dal_kv (k, v, exp) VALUES (?, '1', ?)", [k, Date.now() + 86400e3]);
    return r.affectedRows === 1;
  }
  if (storageMode === "redis") return (await redis("SET", k, "1", "NX", "EX", 86400)) === "OK";
  if (memGet(k)) return false;
  memSet(k, "1", 86400); return true;
}

export const getSession = id => getJSON("sess:" + id);
export const setSession = (id, s) => set("sess:" + id, JSON.stringify({ ...s, at: Date.now() }), 6 * 3600);
export const clearSession = id => del("sess:" + id);

export const isHandoff = async id => !!(await get("hand:" + id));
export const setHandoff = (id, hours = 12) => set("hand:" + id, "1", Math.round(hours * 3600));
export const clearHandoff = id => del("hand:" + id);

/* --------------------------------------------------------------- bookings */

const keepUntil = b => Date.parse(b.out + "T00:00:00Z") + BIZ.retentionDays * 864e5;

export async function getBooking(ref) {
  const r = String(ref).toUpperCase();
  if (storageMode === "mysql") {
    const row = (await q("SELECT data FROM dal_bookings WHERE ref = ? AND expires_at > ?", [r, Date.now()]))[0];
    return row ? JSON.parse(row.data) : null;
  }
  return getJSON("bk:" + r);
}

export async function saveBooking(b) {
  if (storageMode === "mysql") {
    await q(`INSERT INTO dal_bookings (ref, suite, check_in, check_out, guests, name, phone, status, source, notes, data, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE suite = VALUES(suite), check_in = VALUES(check_in), check_out = VALUES(check_out),
               guests = VALUES(guests), name = VALUES(name), phone = VALUES(phone), status = VALUES(status),
               source = VALUES(source), notes = VALUES(notes), data = VALUES(data), expires_at = VALUES(expires_at)`,
      [b.ref, b.suite, b.in, b.out, b.guests || 0, (b.name || "").slice(0, 120), b.phone || "", b.status, b.source || "", b.notes || "", JSON.stringify(b), keepUntil(b)]);
    return b;
  }
  const ttl = Math.max(86400, Math.round((keepUntil(b) - Date.now()) / 1000));
  await set("bk:" + b.ref, JSON.stringify(b), ttl);
  if (storageMode === "redis") await redis("SADD", "bookings", b.ref);
  else { const s = mem.sets.get("bookings") || new Set(); s.add(b.ref); mem.sets.set("bookings", s); }
  return b;
}

export async function listBookings() {
  if (storageMode === "mysql") {
    await purgeExpired();
    return (await q("SELECT data FROM dal_bookings WHERE expires_at > ? ORDER BY check_in", [Date.now()])).map(r => JSON.parse(r.data));
  }
  const refs = storageMode === "redis" ? await redis("SMEMBERS", "bookings") : [...(mem.sets.get("bookings") || [])];
  if (!refs.length) return [];
  const vals = storageMode === "redis" ? await redis("MGET", ...refs.map(r => "bk:" + r)) : refs.map(r => memGet("bk:" + r));
  const out = [], gone = [];
  vals.forEach((v, i) => v ? out.push(JSON.parse(v)) : gone.push(refs[i]));
  if (gone.length) {
    if (storageMode === "redis") await redis("SREM", "bookings", ...gone);
    else gone.forEach(r => mem.sets.get("bookings").delete(r));
  }
  return out.sort((a, b) => a.in.localeCompare(b.in));
}

/** A booking holds its suite while confirmed, blocked, or pending within the hold window. */
export function isActive(b, now = Date.now()) {
  if (b.status === "confirmed" || b.status === "blocked") return true;
  if (b.status === "pending") return now < (b.holdUntil || 0);
  return false;
}
const overlaps = (a, b) => a.in < b.out && b.in < a.out;

/** Suites free for [inISO, outISO) that sleep at least `guests`. */
export async function freeSuites(inISO, outISO, guests = 1, ignoreRef = null) {
  const active = (await listBookings()).filter(b => isActive(b) && b.ref !== ignoreRef && b.suite && b.suite !== "any");
  const largest = Math.max(1, ...BIZ.suites.map(s => s.sleeps)); // bigger groups get flagged for two units
  return BIZ.suites.filter(s => s.sleeps >= Math.min(guests, largest) &&
    !active.some(b => b.suite === s.id && overlaps(b, { in: inISO, out: outISO })));
}

export async function upcoming() {
  const t = todayISO();
  return (await listBookings()).filter(b => b.out >= t && (isActive(b) || b.status === "pending"));
}
export const nights = b => nightsBetween(b.in, b.out);
