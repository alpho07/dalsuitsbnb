// Public, read-only endpoints the website uses.
import express from "express";
import { catalog, getPhoto } from "../lib/units.js";
import { quote, offer } from "../lib/pricing.js";
import { todayISO } from "../lib/dates.js";

export const site = express.Router();
const iso = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/units -> active units with photos, prices and today's offer
site.get("/api/units", async (req, res, next) => {
  try {
    const { units, discounts } = await catalog();
    const t = todayISO();
    res.set("Cache-Control", "public, max-age=60");
    res.json({
      units: units.map(u => ({
        id: u.id, code: u.code, name: u.name, block: u.block, bedrooms: u.bedrooms, sleeps: u.sleeps,
        price: u.price, roomPrice: u.roomPrice, roomSleeps: u.roomSleeps, description: u.description, features: u.features,
        photos: u.photos.map(p => ({ url: p.url, caption: p.caption })),
        offer: offer(u, discounts, t),
        roomOffer: u.roomPrice ? offer({ id: u.id, price: u.roomPrice }, discounts, t) : null
      }))
    });
  } catch (e) { next(e); }
});

// GET /api/quote?unit=110&in=2026-12-20&out=2026-12-22&option=room|suite -> price with the best discount
site.get("/api/quote", async (req, res, next) => {
  try {
    const { unit: code, in: a, out: b } = req.query;
    if (!iso.test(a || "") || !iso.test(b || "") || b <= a) return res.status(400).json({ error: "Use in and out dates as YYYY-MM-DD, check-out after check-in." });
    const { units, discounts } = await catalog();
    const u = units.find(x => x.code === String(code));
    if (!u) return res.status(404).json({ error: "Unknown unit." });
    res.set("Cache-Control", "no-store");
    res.json({ unit: u.code, ...quote(u, discounts, a, b, req.query.option === "room" ? "room" : "suite") });
  } catch (e) { next(e); }
});

// GET /media/:id -> photo bytes (ids never change content, so cache for a year)
site.get("/media/:id(\\d+)", async (req, res, next) => {
  try {
    const p = await getPhoto(req.params.id);
    if (!p) return res.status(404).end();
    res.set({ "Content-Type": p.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
    res.send(Buffer.from(p.data));
  } catch (e) { next(e); }
});
