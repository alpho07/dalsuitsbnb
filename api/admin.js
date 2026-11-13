// Admin API (signed-in only): units, photos, discounts, bookings overview.
import express from "express";
import { login, logout, requireAdmin, isSignedIn, adminEnabled } from "../lib/auth.js";
import * as U from "../lib/units.js";
import { upcoming } from "../lib/store.js";
import { quote } from "../lib/pricing.js";

export const admin = express.Router();
const json = express.json({ limit: "100kb" });
const fail = (status, message) => U.httpError(status, message);

/* ------------------------------------------------------------ validation */

const str = (v, max, field, { required = false } = {}) => {
  const s = String(v ?? "").trim();
  if (required && !s) throw fail(400, `${field} is required.`);
  if (s.length > max) throw fail(400, `${field} must be ${max} characters or fewer.`);
  return s;
};
const int = (v, min, max, field) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw fail(400, `${field} must be a whole number from ${min} to ${max}.`);
  return n;
};
const date = (v, field) => {
  if (v == null || v === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw fail(400, `${field} must be a date.`);
  return v;
};

function unitInput(b, creating) {
  const u = {
    name: str(b.name, 80, "Name", { required: true }),
    block: str(b.block, 16, "Block"),
    bedrooms: int(b.bedrooms, 1, 10, "Bedrooms"),
    sleeps: int(b.sleeps, 1, 20, "Sleeps"),
    price: int(b.price, 0, 1000000, "Whole-unit price per night"),
    roomPrice: b.roomPrice == null || b.roomPrice === "" ? null : int(b.roomPrice, 0, 1000000, "1-bedroom price per night"),
    roomSleeps: b.roomSleeps == null || b.roomSleeps === "" ? null : int(b.roomSleeps, 1, 20, "Guests for 1 bedroom"),
    description: str(b.description, 1000, "Description"),
    features: (Array.isArray(b.features) ? b.features : String(b.features || "").split(","))
      .map(f => String(f).trim()).filter(Boolean).slice(0, 12).map(f => f.slice(0, 40)),
    active: b.active !== false,
    sort: b.sort == null || b.sort === "" ? undefined : int(b.sort, 0, 9999, "Order")
  };
  if (u.roomPrice != null && u.bedrooms < 2) throw fail(400, "A 1-bedroom price only applies to units with 2 or more bedrooms.");
  if (u.roomPrice != null && u.roomPrice >= u.price) throw fail(400, "The 1-bedroom price should be lower than the whole-unit price.");
  if (u.roomPrice != null && !u.roomSleeps) u.roomSleeps = Math.max(1, Math.min(2, u.sleeps));
  if (u.roomPrice == null) u.roomSleeps = null;
  if (creating) {
    u.code = str(b.code, 12, "Unit number", { required: true });
    if (!/^[A-Za-z0-9-]+$/.test(u.code)) throw fail(400, "Unit number can use letters, digits and hyphens only.");
  }
  return u;
}

async function discountInput(b) {
  const kind = b.kind === "amount" ? "amount" : "percent";
  const d = {
    label: str(b.label, 80, "Label"),
    unitId: b.unitId == null || b.unitId === "" ? null : Number(b.unitId),
    kind,
    value: kind === "percent" ? int(b.value, 1, 90, "Percentage") : int(b.value, 1, 1000000, "Amount off per night"),
    minNights: int(b.minNights ?? 1, 1, 60, "Minimum nights"),
    starts: date(b.starts, "Start date"),
    ends: date(b.ends, "End date"),
    active: b.active !== false
  };
  if (d.starts && d.ends && d.ends < d.starts) throw fail(400, "End date must be on or after the start date.");
  if (d.unitId != null) {
    const u = await U.getUnit(d.unitId);
    if (!u) throw fail(400, "That unit no longer exists.");
    const lowest = Math.min(u.price, u.roomPrice || u.price);
    if (kind === "amount" && d.value >= lowest) throw fail(400, `The amount off must be less than the unit's lowest price (KES ${lowest}).`);
  }
  return d;
}

/* --------------------------------------------------------------- session */

admin.post("/admin/api/login", json, login);
admin.post("/admin/api/logout", logout);
admin.get("/admin/api/me", (req, res) => res.json({ signedIn: isSignedIn(req), enabled: adminEnabled() }));

admin.use("/admin/api", requireAdmin);
const h = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

/* ----------------------------------------------------------------- units */

admin.get("/admin/api/units", h(async (req, res) => res.json({ units: await U.listUnits({ includeInactive: true }) })));
admin.post("/admin/api/units", json, h(async (req, res) => res.status(201).json(await U.createUnit(unitInput(req.body, true)))));
admin.put("/admin/api/units/:id", json, h(async (req, res) => res.json(await U.updateUnit(req.params.id, unitInput(req.body, false)))));
admin.delete("/admin/api/units/:id", h(async (req, res) => { await U.deleteUnit(req.params.id); res.json({ ok: true }); }));

/* ---------------------------------------------------------------- photos */

const IMAGE_TYPES = { "image/jpeg": [0xff, 0xd8], "image/png": [0x89, 0x50], "image/webp": [0x52, 0x49] };
admin.post("/admin/api/units/:id/photos", express.raw({ type: Object.keys(IMAGE_TYPES), limit: "6mb" }), h(async (req, res) => {
  const mime = (req.headers["content-type"] || "").split(";")[0];
  const magic = IMAGE_TYPES[mime];
  if (!magic || !Buffer.isBuffer(req.body) || req.body.length < 100 || req.body[0] !== magic[0] || req.body[1] !== magic[1])
    throw fail(415, "Upload a JPEG, PNG or WebP image.");
  res.status(201).json(await U.addPhoto(req.params.id, { mime, data: req.body, caption: str(req.query.caption, 140, "Caption") }));
}));
admin.put("/admin/api/photos/:pid", json, h(async (req, res) => { await U.updatePhoto(req.params.pid, { caption: str(req.body.caption, 140, "Caption") }); res.json({ ok: true }); }));
admin.delete("/admin/api/photos/:pid", h(async (req, res) => { await U.deletePhoto(req.params.pid); res.json({ ok: true }); }));
admin.put("/admin/api/units/:id/photo-order", json, h(async (req, res) => {
  if (!Array.isArray(req.body.ids)) throw fail(400, "ids must be a list.");
  await U.orderPhotos(req.params.id, req.body.ids.map(Number)); res.json({ ok: true });
}));

/* ------------------------------------------------------------- discounts */

admin.get("/admin/api/discounts", h(async (req, res) => res.json({ discounts: await U.listDiscounts() })));
admin.post("/admin/api/discounts", json, h(async (req, res) => res.status(201).json(await U.saveDiscount(await discountInput(req.body)))));
admin.put("/admin/api/discounts/:id", json, h(async (req, res) => res.json(await U.saveDiscount(await discountInput(req.body), req.params.id))));
admin.delete("/admin/api/discounts/:id", h(async (req, res) => { await U.deleteDiscount(req.params.id); res.json({ ok: true }); }));

/* ------------------------------------------------------- bookings + quote */

admin.get("/admin/api/bookings", h(async (req, res) => res.json({ bookings: await upcoming() })));
admin.get("/admin/api/quote", h(async (req, res) => {
  const u = await U.getUnit(req.query.unitId);
  if (!u) throw fail(404, "Unit not found.");
  res.json(quote(u, await U.listDiscounts({ activeOnly: true }), req.query.in, req.query.out, req.query.option));
}));

/* ---------------------------------------------------------------- errors */

admin.use("/admin/api", (err, req, res, next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ error: "That file is too large (max 6 MB)." });
  if (!err.status) console.error("Admin API error", err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "Something went wrong on the server." });
});
