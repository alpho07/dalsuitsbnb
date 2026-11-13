// Booking requests from the website form. They are saved the moment the guest submits,
// before WhatsApp opens, so nothing is lost if the guest never presses send.
import { BIZ, suiteById, optionOf } from "./config.js";
import { todayISO, addDays, nightsBetween } from "./dates.js";
import * as db from "./store.js";
import { catalog } from "./units.js";
import { quote } from "./pricing.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^DAL-\d{6}-[A-Z0-9]{3}$/;
const ARRIVALS = ["morning", "afternoon", "evening", "late night"];

export function normPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("254")) return d;
  if (d.startsWith("0")) return "254" + d.slice(1);
  if (d.length === 9) return "254" + d;
  return d;
}

function newRef(inISO) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = ""; for (let i = 0; i < 3; i++) r += abc[Math.floor(Math.random() * abc.length)];
  return `DAL-${inISO.slice(2).replace(/-/g, "")}-${r}`;
}

class BadRequest extends Error { constructor(m) { super(m); this.status = 400; } }

/** Validates the form fields; throws BadRequest with a guest-friendly message. */
export function validate(body) {
  const b = body || {};
  const t = todayISO();
  const s = v => String(v ?? "").trim();
  const req = {
    suite: s(b.suite) || "any",
    option: b.option === "room" ? "room" : "suite",
    in: s(b.in), out: s(b.out),
    guests: Number(b.guests),
    name: s(b.name).replace(/\s+/g, " "),
    phone: normPhone(b.phone),
    email: s(b.email).toLowerCase(),
    notes: s(b.notes).replace(/\s+/g, " "),
    arrival: s(b.arrival).toLowerCase(),
    ref: s(b.ref).toUpperCase()
  };
  if (!ISO.test(req.in) || !ISO.test(req.out)) throw new BadRequest("Choose your check-in and check-out dates.");
  if (req.in < t) throw new BadRequest("Check-in can't be in the past.");
  if (req.in > addDays(t, 365)) throw new BadRequest("We take bookings up to a year ahead.");
  if (req.out <= req.in) throw new BadRequest("Check-out must be after check-in.");
  if (nightsBetween(req.in, req.out) > BIZ.maxNights) throw new BadRequest(`For stays over ${BIZ.maxNights} nights, please call us for a monthly rate.`);
  if (!Number.isInteger(req.guests) || req.guests < 1 || req.guests > 20) throw new BadRequest("Choose the number of guests.");
  if (req.name.length < 2 || req.name.length > 60) throw new BadRequest("Enter your full name.");
  if (!/^254[17]\d{8}$/.test(req.phone)) throw new BadRequest("Enter a valid Kenyan phone number, e.g. 0712 345 678.");
  if (req.email && (req.email.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(req.email))) throw new BadRequest("Check the email address, or leave it blank.");
  if (req.notes.length > 500) req.notes = req.notes.slice(0, 500);
  if (!ARRIVALS.includes(req.arrival)) req.arrival = "";
  if (req.suite !== "any" && !/^[A-Za-z0-9-]{1,16}$/.test(req.suite)) throw new BadRequest("Choose a suite.");
  return req;
}

/**
 * Saves a website booking request. Returns { booking, available }.
 * A free suite is held as "pending" (like a WhatsApp request) for BIZ.pendingHoldHours.
 * If nothing suitable is free the request is still saved, as "unavailable", so the host can
 * follow up; it doesn't block any suite.
 */
export async function createWebsiteBooking(body) {
  const req = validate(body);
  const { units, discounts } = await catalog();
  if (req.suite !== "any" && !suiteById(req.suite)) throw new BadRequest("That suite isn't available to book online.");

  const free = await db.freeSuites(req.in, req.out, req.guests);
  let suite = req.suite;
  if (suite === "any") suite = (free.find(s => req.option !== "room" || s.roomRate) || free[0])?.id || "any";
  const available = suite !== "any" && free.some(s => s.id === suite);

  // A 1-bedroom booking only fits as many guests as one bedroom allows.
  const s = suiteById(suite);
  let option = req.option;
  if (option === "room" && (!s?.roomRate || req.guests > (s.roomSleeps || 2))) option = "suite";

  const unit = units.find(u => u.code === suite);
  const q = unit ? quote(unit, discounts, req.in, req.out, option) : null;

  let ref = REF.test(req.ref) && !(await db.getBooking(req.ref)) ? req.ref : newRef(req.in);
  while (await db.getBooking(ref)) ref = newRef(req.in);

  const notes = [req.notes, req.arrival ? `Arrival: ${req.arrival}` : "", req.suite === "any" && available ? "Asked for any suite" : ""]
    .filter(Boolean).join(" · ");
  const booking = await db.saveBooking({
    ref, suite, option, in: req.in, out: req.out, guests: req.guests, name: req.name, phone: req.phone,
    email: req.email, notes, source: "website",
    status: available ? "pending" : "unavailable",
    createdAt: Date.now(), holdUntil: available ? Date.now() + BIZ.pendingHoldHours * 3600e3 : 0,
    quote: q ? { nightly: q.nightly, nights: q.nights, base: q.base, discount: q.discount, total: q.total } : null,
    clientRef: req.ref && req.ref !== ref ? req.ref : undefined
  });
  return { booking, available, label: s ? optionOf(s, option).label : null };
}
