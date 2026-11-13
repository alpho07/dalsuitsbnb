// Units (suites), their photos, and discounts. MySQL in production; an in-memory copy for
// local testing. Tables are created and seeded on first use.
import { storageMode, sql, listBookings } from "./store.js";
import { BIZ, SEED_UNITS, toSuite } from "./config.js";
import { todayISO } from "./dates.js";

const DB = storageMode === "mysql";
const M = globalThis.__dalUnits || (globalThis.__dalUnits = { units: [], photos: [], discounts: [], seq: 1, seeded: false });

/* ------------------------------------------------------------ schema */

let ready = null;
function ensure() {
  if (!DB) {
    if (!M.seeded) {
      M.seeded = true;
      for (const u of SEED_UNITS) M.units.push({ id: M.seq++, name: `Suite ${u.code}`, active: true, ...u });
    }
    return Promise.resolve();
  }
  if (!ready) ready = (async () => {
    await sql(`CREATE TABLE IF NOT EXISTS dal_units (
      id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(16) NOT NULL UNIQUE, name VARCHAR(80) NOT NULL,
      block VARCHAR(16) NOT NULL DEFAULT '', bedrooms TINYINT NOT NULL DEFAULT 1, sleeps TINYINT NOT NULL DEFAULT 2,
      price INT NOT NULL DEFAULT 0, room_price INT NULL, room_sleeps TINYINT NULL,
      description TEXT, features TEXT, active TINYINT NOT NULL DEFAULT 1,
      sort INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4`);
    await sql(`CREATE TABLE IF NOT EXISTS dal_photos (
      id INT AUTO_INCREMENT PRIMARY KEY, unit_id INT NOT NULL, mime VARCHAR(32) NOT NULL, data MEDIUMBLOB NOT NULL,
      bytes INT NOT NULL, caption VARCHAR(140) NOT NULL DEFAULT '', sort INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX (unit_id)
    ) CHARACTER SET utf8mb4`);
    await sql(`CREATE TABLE IF NOT EXISTS dal_discounts (
      id INT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(80) NOT NULL DEFAULT '', unit_id INT NULL,
      kind VARCHAR(8) NOT NULL, value INT NOT NULL, min_nights INT NOT NULL DEFAULT 1,
      starts DATE NULL, ends DATE NULL, active TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4`);
    await migrate();
    const [{ n }] = await sql("SELECT COUNT(*) AS n FROM dal_units");
    if (!Number(n)) for (const u of SEED_UNITS) {
      await sql("INSERT INTO dal_units (code, name, block, bedrooms, sleeps, price, room_price, room_sleeps, description, features, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [u.code, `Suite ${u.code}`, u.block, u.bedrooms, u.sleeps, u.price, u.roomPrice, u.roomSleeps, u.description, JSON.stringify(u.features), u.sort]);
    }
  })().catch(e => { ready = null; throw e; });
  return ready;
}

/** Upgrades databases created before the 1-bedroom option (database/migrations/001_room_option.sql). */
async function migrate() {
  // Suites are now listed as 110.1B / 110.2B, so the old "book one bedroom or the whole suite" wording goes.
  await sql("UPDATE dal_units SET description = ? WHERE description = ?",
    ["Modern, stylish two-bedroom suite with a cozy sitting area.", "Modern, stylish two-bedroom suite with a cozy sitting area. Book one bedroom or the whole suite."]).catch(() => {});
  const cols = (await sql("SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dal_units'")).map(r => r.c);
  if (cols.includes("room_price")) return;
  await sql("ALTER TABLE dal_units ADD COLUMN room_price INT NULL AFTER price, ADD COLUMN room_sleeps TINYINT NULL AFTER room_price");
  // The first seed listed 110/123 as 1-bedroom KES 2,500 and 115/117 as 2-bedroom KES 5,000.
  // Every suite is 2 bedrooms, bookable as 1 bedroom (KES 2,500) or whole (KES 5,000).
  // Only rows still exactly as first seeded are changed; anything edited at /admin is left alone.
  for (const u of SEED_UNITS) {
    await sql(`UPDATE dal_units SET bedrooms = ?, sleeps = ?, price = ?, room_price = ?, room_sleeps = ?, description = ?
               WHERE code = ? AND ((bedrooms = 1 AND sleeps = 2 AND price = 2500) OR (bedrooms = 2 AND sleeps = 4 AND price = 5000))`,
      [u.bedrooms, u.sleeps, u.price, u.roomPrice, u.roomSleeps, u.description, u.code]);
  }
}

/* ------------------------------------------------------------- shapes */

const unitRow = r => ({
  id: r.id, code: r.code, name: r.name, block: r.block, bedrooms: Number(r.bedrooms), sleeps: Number(r.sleeps),
  price: Number(r.price), roomPrice: r.room_price == null ? null : Number(r.room_price),
  roomSleeps: r.room_sleeps == null ? null : Number(r.room_sleeps),
  description: r.description || "", features: safeJSON(r.features, []),
  active: !!Number(r.active), sort: Number(r.sort)
});
const discountRow = r => ({
  id: r.id, label: r.label || "", unitId: r.unit_id == null ? null : Number(r.unit_id), kind: r.kind,
  value: Number(r.value), minNights: Number(r.min_nights) || 1, starts: r.starts || null, ends: r.ends || null,
  active: !!Number(r.active)
});
function safeJSON(s, fallback) { try { return Array.isArray(s) ? s : JSON.parse(s || "null") ?? fallback; } catch { return fallback; } }
const bySort = (a, b) => a.sort - b.sort || String(a.code).localeCompare(String(b.code));

/* -------------------------------------------------------------- units */

export async function listUnits({ includeInactive = false } = {}) {
  await ensure();
  let units, photos;
  if (DB) {
    units = (await sql(`SELECT * FROM dal_units ${includeInactive ? "" : "WHERE active = 1"} ORDER BY sort, code`)).map(unitRow);
    photos = await sql("SELECT id, unit_id, caption, sort, bytes FROM dal_photos ORDER BY sort, id");
  } else {
    units = M.units.filter(u => includeInactive || u.active).map(u => ({ ...u, features: [...u.features] })).sort(bySort);
    photos = M.photos.map(p => ({ id: p.id, unit_id: p.unitId, caption: p.caption, sort: p.sort, bytes: p.data.length })).sort((a, b) => a.sort - b.sort || a.id - b.id);
  }
  for (const u of units) u.photos = photos.filter(p => Number(p.unit_id) === u.id)
    .map(p => ({ id: p.id, url: `/media/${p.id}`, caption: p.caption, bytes: Number(p.bytes) }));
  return units;
}

export async function getUnit(id) {
  return (await listUnits({ includeInactive: true })).find(u => u.id === Number(id)) || null;
}

export async function createUnit(u) {
  await ensure();
  const all = await listUnits({ includeInactive: true });
  if (all.some(x => x.code.toLowerCase() === u.code.toLowerCase())) throw httpError(409, `A unit with number ${u.code} already exists.`);
  const sort = u.sort ?? (Math.max(0, ...all.map(x => x.sort)) + 1);
  let id;
  if (DB) {
    const r = await sql("INSERT INTO dal_units (code, name, block, bedrooms, sleeps, price, room_price, room_sleeps, description, features, active, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [u.code, u.name, u.block, u.bedrooms, u.sleeps, u.price, u.roomPrice ?? null, u.roomSleeps ?? null, u.description, JSON.stringify(u.features), u.active ? 1 : 0, sort]);
    id = r.insertId;
  } else {
    id = M.seq++; M.units.push({ ...u, id, sort });
  }
  invalidate();
  return getUnit(id);
}

export async function updateUnit(id, u) {
  await ensure();
  const cur = await getUnit(id);
  if (!cur) throw httpError(404, "Unit not found.");
  const given = Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined));
  const next = { ...cur, ...given, code: cur.code }; // the unit number is fixed once bookings can refer to it
  if (DB) {
    await sql("UPDATE dal_units SET name=?, block=?, bedrooms=?, sleeps=?, price=?, room_price=?, room_sleeps=?, description=?, features=?, active=?, sort=? WHERE id=?",
      [next.name, next.block, next.bedrooms, next.sleeps, next.price, next.roomPrice ?? null, next.roomSleeps ?? null, next.description, JSON.stringify(next.features), next.active ? 1 : 0, next.sort, cur.id]);
  } else {
    Object.assign(M.units.find(x => x.id === cur.id), { ...next, photos: undefined });
  }
  invalidate();
  return getUnit(cur.id);
}

export async function deleteUnit(id) {
  const cur = await getUnit(id);
  if (!cur) throw httpError(404, "Unit not found.");
  const t = todayISO();
  const future = (await listBookings()).filter(b => b.suite === cur.code && b.out >= t && ["pending", "confirmed", "blocked"].includes(b.status));
  if (future.length) throw httpError(409, `Unit ${cur.code} has ${future.length} upcoming booking(s). Hide it instead, or cancel those bookings first.`);
  if (DB) {
    await sql("DELETE FROM dal_photos WHERE unit_id = ?", [cur.id]);
    await sql("DELETE FROM dal_discounts WHERE unit_id = ?", [cur.id]);
    await sql("DELETE FROM dal_units WHERE id = ?", [cur.id]);
  } else {
    M.photos = M.photos.filter(p => p.unitId !== cur.id);
    M.discounts = M.discounts.filter(d => d.unitId !== cur.id);
    M.units = M.units.filter(u => u.id !== cur.id);
  }
  invalidate();
}

/* ------------------------------------------------------------- photos */

export async function addPhoto(unitId, { mime, data, caption = "" }) {
  const unit = await getUnit(unitId);
  if (!unit) throw httpError(404, "Unit not found.");
  const sort = unit.photos.length;
  let id;
  if (DB) id = (await sql("INSERT INTO dal_photos (unit_id, mime, data, bytes, caption, sort) VALUES (?,?,?,?,?,?)", [unit.id, mime, data, data.length, caption, sort])).insertId;
  else { id = M.seq++; M.photos.push({ id, unitId: unit.id, mime, data, caption, sort }); }
  invalidate();
  return { id, url: `/media/${id}`, caption, bytes: data.length };
}

export async function getPhoto(id) {
  await ensure();
  if (DB) return (await sql("SELECT mime, data FROM dal_photos WHERE id = ?", [Number(id)]))[0] || null;
  return M.photos.find(p => p.id === Number(id)) || null;
}

export async function updatePhoto(id, { caption }) {
  await ensure();
  if (DB) await sql("UPDATE dal_photos SET caption = ? WHERE id = ?", [caption, Number(id)]);
  else { const p = M.photos.find(x => x.id === Number(id)); if (p) p.caption = caption; }
  invalidate();
}

export async function deletePhoto(id) {
  await ensure();
  if (DB) await sql("DELETE FROM dal_photos WHERE id = ?", [Number(id)]);
  else M.photos = M.photos.filter(p => p.id !== Number(id));
  invalidate();
}

/** ids in display order; the first is the cover photo. */
export async function orderPhotos(unitId, ids) {
  await ensure();
  for (const [i, id] of ids.entries()) {
    if (DB) await sql("UPDATE dal_photos SET sort = ? WHERE id = ? AND unit_id = ?", [i, Number(id), Number(unitId)]);
    else { const p = M.photos.find(x => x.id === Number(id) && x.unitId === Number(unitId)); if (p) p.sort = i; }
  }
  invalidate();
}

/* ---------------------------------------------------------- discounts */

export async function listDiscounts({ activeOnly = false } = {}) {
  await ensure();
  const rows = DB ? (await sql("SELECT * FROM dal_discounts ORDER BY active DESC, id DESC")).map(discountRow) : M.discounts.map(d => ({ ...d }));
  return activeOnly ? rows.filter(d => d.active && (!d.ends || d.ends >= todayISO())) : rows;
}

export async function saveDiscount(d, id = null) {
  await ensure();
  const vals = [d.label, d.unitId, d.kind, d.value, d.minNights, d.starts, d.ends, d.active ? 1 : 0];
  if (DB) {
    if (id) await sql("UPDATE dal_discounts SET label=?, unit_id=?, kind=?, value=?, min_nights=?, starts=?, ends=?, active=? WHERE id=?", [...vals, Number(id)]);
    else id = (await sql("INSERT INTO dal_discounts (label, unit_id, kind, value, min_nights, starts, ends, active) VALUES (?,?,?,?,?,?,?,?)", vals)).insertId;
  } else {
    if (id) Object.assign(M.discounts.find(x => x.id === Number(id)) || {}, d);
    else { id = M.seq++; M.discounts.unshift({ ...d, id }); }
  }
  invalidate();
  return (await listDiscounts()).find(x => x.id === Number(id));
}

export async function deleteDiscount(id) {
  await ensure();
  if (DB) await sql("DELETE FROM dal_discounts WHERE id = ?", [Number(id)]);
  else M.discounts = M.discounts.filter(d => d.id !== Number(id));
  invalidate();
}

/* ------------------------------------------------- catalogue for site/bot */

let cache = null, cachedAt = 0;
export function invalidate() { cache = null; }

/** Active units + active discounts, cached for 30 s. Also refreshes BIZ.suites for the bot. */
export async function catalog() {
  if (cache && Date.now() - cachedAt < 30e3) return cache;
  if (storageMode === "redis") { // Vercel copy: no admin backend, use the seed list
    cache = { units: SEED_UNITS.map((u, i) => ({ ...u, id: i + 1, name: `Suite ${u.code}`, active: true, photos: [] })), discounts: [] };
  } else {
    cache = { units: await listUnits(), discounts: await listDiscounts({ activeOnly: true }) };
  }
  cachedAt = Date.now();
  BIZ.suites.splice(0, BIZ.suites.length, ...cache.units.map(toSuite));
  return cache;
}

export function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
