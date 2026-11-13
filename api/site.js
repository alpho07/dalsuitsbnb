// Public, read-only endpoints the website uses.
import express from "express";
import { catalog, getPhoto } from "../lib/units.js";
import { quote, offer } from "../lib/pricing.js";
import { todayISO } from "../lib/dates.js";
import { createWebsiteBooking } from "../lib/bookings.js";
import { notifyNewBooking } from "../lib/bot.js";

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

// POST /api/bookings -> saves a booking request from the website form
// Spam brake: 20 saved requests per hour per IP (mobile networks share IPs, so keep it generous).
const recent = new Map(); // ip -> timestamps of saved requests
site.post("/api/bookings", express.json({ limit: "20kb" }), async (req, res, next) => {
  try {
    const ip = req.ip || "?", now = Date.now();
    const list = (recent.get(ip) || []).filter(t => now - t < 3600e3);
    if (list.length >= 20) return res.status(429).json({ error: "Too many booking requests from this connection. Please WhatsApp or call us." });
    if (req.body?.website) return res.status(201).json({ ok: true }); // honeypot: bots fill hidden fields
    const { booking, available, label } = await createWebsiteBooking(req.body);
    list.push(now); recent.set(ip, list);
    notifyNewBooking(booking).catch(e => console.error("Host alert failed", e));
    res.status(201).json({ ok: true, ref: booking.ref, status: booking.status, available, suite: booking.suite, option: booking.option, listing: label?.split(" · ")[0].replace("Suite ", "") ?? null, label, total: booking.quote?.total ?? null });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
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
