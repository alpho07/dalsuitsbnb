// Conversation logic for the DAL Suits BnB WhatsApp booking assistant.
import { BIZ, suiteById, money, optionOf } from "./config.js";
import { todayISO, addDays, nightsBetween, parseDate, fmt } from "./dates.js";
import * as db from "./store.js";
import * as wa from "./wa.js";
import { catalog } from "./units.js";
import { quote as priceQuote, offer } from "./pricing.js";

const ADMINS = (process.env.ADMIN_NUMBERS || "").split(",").map(s => normPhone(s)).filter(Boolean);
const T_ADMIN = process.env.WA_TEMPLATE_ADMIN_ALERT || "";   // optional approved template, 1 body param
const T_GUEST = process.env.WA_TEMPLATE_GUEST_UPDATE || "";  // optional approved template, 1 body param

export function normPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("254")) return d;
  if (d.startsWith("0")) return "254" + d.slice(1);
  if (d.length === 9) return "254" + d;
  return d;
}
const isAdmin = id => ADMINS.includes(id);
const suiteLabel = id => (id && id !== "any" ? `Suite ${id}${suiteById(id)?.block ? ` (Block ${suiteById(id).block})` : ""}` : "Any available suite");
const bookingLabel = b => `${suiteLabel(b.suite)} · ${optionOf(suiteById(b.suite) || { bedrooms: 2, roomRate: 1 }, b.option).label}`;
const asUnit = s => ({ id: s.unitId, price: s.rate, roomPrice: s.roomRate });
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function newRef(inISO) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = ""; for (let i = 0; i < 3; i++) r += abc[Math.floor(Math.random() * abc.length)];
  return `DAL-${inISO.slice(2).replace(/-/g, "")}-${r}`;
}

let DISCOUNTS = [];
async function refreshCatalog() { try { DISCOUNTS = (await catalog()).discounts; } catch (e) { console.error("Catalog load failed", e); } }

function quote(b) {
  const s = suiteById(b.suite);
  if (!s?.rate) return "Rate confirmed by the host";
  const q = priceQuote(asUnit(s), DISCOUNTS, b.in, b.out, b.option);
  const base = `${money(q.nightly)} × ${plural(q.nights, "night")}`;
  if (!q.discount) return `${base} = *${money(q.total)}*`;
  return `${base} = ${money(q.base)}\n🏷️ ${q.discount.label}: −${money(q.discount.amount)}\n💵 Total *${money(q.total)}*`;
}
const onePrice = (s, price, label) => {
  const o = offer({ id: s.unitId, price }, DISCOUNTS, todayISO());
  return `${label}${o ? `~${money(price)}~ ${money(o.nightly)}` : money(price)} per night${o ? ` (${o.label})` : ""}`;
};
const priceLine = s => {
  if (!s.rate) return "Rate on request";
  return s.roomRate ? `${onePrice(s, s.roomRate, "1 bedroom: ")}\n${onePrice(s, s.rate, "Whole suite: ")}` : onePrice(s, s.rate, "");
};
const listPrice = s => s.roomRate ? `from ${money(s.roomRate)}/night` : `${money(s.rate)}/night`;

function summary(b) {
  const n = nightsBetween(b.in, b.out);
  return [
    `🏠 ${bookingLabel(b)}`,
    `📅 ${fmt(b.in)} → ${fmt(b.out)} (${plural(n, "night")})`,
    `👥 ${plural(b.guests, "guest")}`,
    b.name ? `🙍 ${b.name}` : null,
    b.notes ? `📝 ${b.notes}` : null,
    `${quote(b).includes("Total") ? "" : "💵 "}${quote(b)}`
  ].filter(Boolean).join("\n");
}

/* ------------------------------------------------------------------ menus */

async function sendMenu(to, name) {
  const hi = name ? `Hi ${name.split(" ")[0]}! ` : "Hi! ";
  return wa.buttons(to,
    `${hi}Welcome to *${BIZ.name}*, Nyarach Kobura, Rongo.\n\nModern, stylish suites: clean, spacious and cozy, with fast Wi-Fi and a Smart TV (Netflix & YouTube). Perfect for couples, families and anyone who needs a quiet place to rest.\n\nWhat would you like to do?`,
    [{ id: "m_book", title: "Book a suite" }, { id: "m_suites", title: "Suites & rates" }, { id: "m_contact", title: "Location & host" }],
    "Type HOST any time to chat with a person");
}

async function sendSuites(to) {
  const lines = BIZ.suites.map(s =>
    `*Suite ${s.id}*${s.block ? " · Block " + s.block : ""} · ${s.tag}\n${s.desc}\n${priceLine(s)}`);
  await wa.text(to, `Our suites\n\n${lines.join("\n\n")}\n\nEvery suite: ${BIZ.amenities}.\nCheck-in from ${BIZ.checkIn}, check-out by ${BIZ.checkOut}.\nPhotos: ${BIZ.siteUrl}/#gallery`);
  return wa.buttons(to, "Ready to book?", [{ id: "m_book", title: "Book a suite" }, { id: "m_contact", title: "Location & host" }]);
}

async function sendContact(to) {
  await wa.location(to, BIZ.lat, BIZ.lng, BIZ.name, BIZ.address);
  return wa.text(to, `📍 ${BIZ.address}\nDirections: ${BIZ.mapsUrl}\n\n📞 Call: ${BIZ.phones.join(" / ")}\n\nType *HOST* to chat with a person, or *MENU* to go back.`);
}

async function askSuite(to, s) {
  s.step = "suite";
  return wa.list(to, "Which suite would you like?", "Choose suite", [
    ...BIZ.suites.slice(0, 9).map(x => ({ id: "s_" + x.id, title: `Suite ${x.id}${x.block ? " · Block " + x.block : ""}`, description: `${x.tag}${x.rate ? " · " + listPrice(x) : ""}` })),
    { id: "s_any", title: "Any available suite", description: "We'll give you the best free suite" }
  ]);
}
async function askCheckin(to, s) { s.step = "checkin"; return wa.text(to, "📅 What date will you *check in*?\nFor example: 20/12, 20 Dec, or tomorrow."); }
async function askCheckout(to, s) { s.step = "checkout"; return wa.text(to, `Check-in: *${fmt(s.in)}*.\nWhat date will you *check out*? Or reply with the number of nights, e.g. 2.`); }
async function askGuests(to, s) {
  s.step = "guests";
  return wa.list(to, "How many guests?", "Choose", [
    { id: "g_1", title: "1 guest" }, { id: "g_2", title: "2 guests" }, { id: "g_3", title: "3 guests" },
    { id: "g_4", title: "4 guests" }, { id: "g_5", title: "5 or more", description: "We'll arrange more than one suite" }
  ]);
}
async function askOption(to, s) {
  s.step = "option";
  const ref = s.suite !== "any" ? suiteById(s.suite) : BIZ.suites.find(x => x.roomRate);
  return wa.buttons(to, `Would you like 1 bedroom or the whole suite?\nEither way the suite stays private to you.`, [
    { id: "o_room", title: `1 bedroom ${money(ref.roomRate)}`.slice(0, 20) },
    { id: "o_suite", title: `Whole ${money(ref.rate)}`.slice(0, 20) }
  ], `1 bedroom: up to ${ref.roomSleeps || 2} guests · whole suite: up to ${ref.sleeps}`);
}
/** After guests are known: ask 1 bedroom vs whole suite when that choice exists, else go on. */
async function afterGuests(to, s, profileName) {
  const ref = s.suite !== "any" ? suiteById(s.suite) : BIZ.suites.find(x => x.roomRate);
  if (!s.option && ref?.roomRate && s.guests <= (ref.roomSleeps || 2)) return askOption(to, s);
  if (!s.option || (s.option === "room" && s.guests > (ref?.roomSleeps || 2))) s.option = "suite";
  return checkAvailability(to, s, profileName);
}
async function askName(to, s, profileName) {
  s.step = "name";
  if (profileName) return wa.buttons(to, "Whose name should the booking be under? Tap below or type a name.", [{ id: "n_profile", title: profileName.slice(0, 20) }]);
  return wa.text(to, "Whose name should the booking be under?");
}
async function askConfirm(to, s) {
  s.step = "confirm";
  return wa.buttons(to, `Please check your booking:\n\n${summary(s)}\n\nSend this request?`,
    [{ id: "c_yes", title: "Confirm request" }, { id: "c_dates", title: "Change dates" }, { id: "c_no", title: "Cancel" }]);
}

/* ---------------------------------------------------------- availability */

async function checkAvailability(to, s, profileName) {
  const free = await db.freeSuites(s.in, s.out, s.guests);
  if (s.suite !== "any" && free.some(x => x.id === s.suite)) return s.name ? askConfirm(to, s) : askName(to, s, profileName);
  if (s.suite === "any" && free.length) { s.suite = free[0].id; return s.name ? askConfirm(to, s) : askName(to, s, profileName); }
  if (free.length) {
    s.step = "alt";
    return wa.list(to, `Sorry, Suite ${s.suite} is booked for ${fmt(s.in)} → ${fmt(s.out)}. These suites are free:`, "See free suites",
      [...free.map(x => ({ id: "s_" + x.id, title: `Suite ${x.id} · Block ${x.block}`, description: x.tag })),
       { id: "c_dates", title: "Change dates" }]);
  }
  s.step = "full";
  return wa.buttons(to, `Sorry, we're fully booked for ${fmt(s.in)} → ${fmt(s.out)}.`,
    [{ id: "c_dates", title: "Try other dates" }, { id: "m_host", title: "Talk to host" }]);
}

/* -------------------------------------------------------- create booking */

async function submit(to, s) {
  // re-check in case someone else booked while this guest was typing
  const free = await db.freeSuites(s.in, s.out, s.guests);
  if (!free.some(x => x.id === s.suite)) return checkAvailability(to, s);
  let ref = s.ref && !(await db.getBooking(s.ref)) ? s.ref : newRef(s.in);
  while (await db.getBooking(ref)) ref = newRef(s.in);
  const b = await db.saveBooking({
    ref, suite: s.suite, option: s.option || "suite", in: s.in, out: s.out, guests: s.guests, name: s.name, notes: s.notes || "",
    phone: to, source: s.source || "whatsapp", status: "pending",
    createdAt: Date.now(), holdUntil: Date.now() + BIZ.pendingHoldHours * 3600e3
  });
  await db.clearSession(to);
  await wa.text(to, `✅ Request sent! Your reference is *${b.ref}*.\n\n${summary(b)}\n\nThe suite is held for you while the host confirms, usually within the hour. ${BIZ.payment}\n\nType *MY BOOKING* to check status, or *HOST* to chat with a person.`);
  await notifyAdmins(`🛎️ New booking request ${b.ref}\n\n${summary(b)}\n📱 +${b.phone}\n\nReply:\nCONFIRM ${b.ref}\nDECLINE ${b.ref} reason`, `${b.ref}: ${bookingLabel(b)}, ${fmt(b.in)} to ${fmt(b.out)}, ${b.name}, +${b.phone}`);
  return b;
}

async function notifyAdmins(body, templateParam) {
  for (const a of ADMINS) await wa.textOrTemplate(a, body, T_ADMIN, [templateParam]);
}
async function notifyGuest(phone, body, templateParam) {
  return wa.textOrTemplate(phone, body, T_GUEST, [templateParam]);
}

/* ------------------------------------------------- website request parsing */

/** The website's "Send on WhatsApp" button sends a message in this exact shape. */
export function parseSiteRequest(textIn) {
  if (!/Booking request DAL-/i.test(textIn)) return null;
  const line = k => (textIn.match(new RegExp("^" + k + ":\\s*(.+)$", "im")) || [])[1]?.trim();
  const ref = (textIn.match(/Booking request (DAL-[A-Z0-9-]+)/i) || [])[1]?.toUpperCase();
  const suiteTxt = line("Suite") || "";
  const suite = (suiteTxt.match(/Suite ([A-Za-z0-9-]+)/) || [])[1] || "any";
  const dateOf = v => parseDate((v || "").replace(/\(.*\)/, "").trim());
  const s = {
    ref, suite, in: dateOf(line("Check-in")), out: dateOf(line("Check-out")),
    guests: Number(line("Guests")) || 1, name: line("Name") || "", notes: line("Notes") || "", source: "website",
    option: /\b1 bedroom\b/i.test(suiteTxt) ? "room" : "suite"
  };
  const arrival = (line("Check-in") || "").match(/\(([^)]+)\)/)?.[1];
  if (arrival) s.notes = [s.notes, "Arrival: " + arrival].filter(Boolean).join(" · ");
  return s.in && s.out && s.out > s.in ? s : null;
}

/* ------------------------------------------------------------ admin side */

const ADMIN_HELP = `Admin commands:
• LIST – upcoming bookings
• TODAY – arrivals & departures today
• CONFIRM <ref> [suite]
• DECLINE <ref> [reason]
• BLOCK <suite> <from> <to> [note] – e.g. BLOCK 110 20/12 23/12 repairs
• FREE <ref> – cancel a booking or block
• RESUME <phone> – switch the bot back on for a guest
• ADMIN – this help`;

async function handleAdmin(from, raw) {
  const t = raw.trim();
  const [cmd, ...rest] = t.split(/\s+/);
  const C = cmd.toUpperCase();
  const reply = async body => { await wa.text(from, body); return true; };

  if (C === "ADMIN" || C === "HELP") return reply(ADMIN_HELP);

  if (C === "LIST" || C === "BOOKINGS") {
    const list = await db.upcoming();
    if (!list.length) return reply("No upcoming bookings.");
    return reply(list.map(b => `${b.status === "pending" ? "⏳" : b.status === "blocked" ? "⛔" : "✅"} *${b.ref}* · ${b.suite}${b.option === "room" ? " (1 bedroom)" : ""}\n${fmt(b.in)} → ${fmt(b.out)} · ${b.name}${b.phone ? " · +" + b.phone : ""}`).join("\n\n"));
  }

  if (C === "TODAY") {
    const t0 = todayISO(), list = (await db.listBookings()).filter(b => db.isActive(b) && b.status !== "blocked");
    const arr = list.filter(b => b.in === t0), dep = list.filter(b => b.out === t0);
    return reply(`Today ${fmt(t0)}\n\nArrivals:\n${arr.map(b => `• ${b.suite} ${b.name} +${b.phone}`).join("\n") || "none"}\n\nDepartures:\n${dep.map(b => `• ${b.suite} ${b.name}`).join("\n") || "none"}`);
  }

  if (C === "CONFIRM" || C === "DECLINE" || C === "FREE" || C === "UNBLOCK") {
    const b = rest[0] && await db.getBooking(rest[0]);
    if (!b) return reply(`I can't find booking ${rest[0] || ""}. Send LIST to see references.`);

    if (C === "CONFIRM") {
      const want = rest[1] && suiteById(rest[1]) ? rest[1] : b.suite;
      const free = await db.freeSuites(b.in, b.out, b.guests, b.ref);
      const pick = free.find(x => x.id === want) || (rest[1] ? null : free[0]);
      if (!pick) return reply(`Suite ${want} isn't free for ${fmt(b.in)} → ${fmt(b.out)}. Free: ${free.map(x => x.id).join(", ") || "none"}.`);
      b.suite = pick.id; b.status = "confirmed"; b.confirmedAt = Date.now();
      await db.saveBooking(b);
      await notifyGuest(b.phone, `🎉 Your booking is confirmed!\n\nRef: *${b.ref}*\n${summary(b)}\n\nCheck-in from ${BIZ.checkIn}, check-out by ${BIZ.checkOut}.\n${BIZ.payment}\n\n📍 Directions: ${BIZ.mapsUrl}\nSee you soon at ${BIZ.name}!`,
        `${b.ref} is confirmed: ${bookingLabel(b)}, ${fmt(b.in)} to ${fmt(b.out)}`);
      return reply(`✅ ${b.ref} confirmed in Suite ${b.suite}. Guest notified.`);
    }
    if (C === "DECLINE") {
      const reason = rest.slice(1).join(" ");
      b.status = "declined"; await db.saveBooking(b);
      await notifyGuest(b.phone, `Sorry, we can't take booking ${b.ref} (${fmt(b.in)} → ${fmt(b.out)}).${reason ? "\nReason: " + reason : ""}\n\nType *BOOK* to try other dates, or *HOST* to chat with us.`,
        `${b.ref} could not be accepted${reason ? ": " + reason : ""}`);
      return reply(`${b.ref} declined. Guest notified.`);
    }
    b.status = "cancelled"; await db.saveBooking(b);
    return reply(`${b.ref} cancelled; ${b.suite} is free again for those dates.`);
  }

  if (C === "BLOCK") {
    const [sid, a, z, ...note] = rest;
    const s = suiteById(sid), inISO = parseDate(a), outISO = parseDate(z);
    if (!s || !inISO || !outISO || outISO <= inISO) return reply("Format: BLOCK 110 20/12 23/12 note");
    const free = await db.freeSuites(inISO, outISO, 1);
    if (!free.some(x => x.id === s.id)) return reply(`Suite ${s.id} already has a booking in that period. Send LIST.`);
    const b = await db.saveBooking({ ref: newRef(inISO), suite: s.id, in: inISO, out: outISO, guests: 0, name: note.join(" ") || "Blocked", phone: "", source: "admin", status: "blocked", createdAt: Date.now() });
    return reply(`⛔ Suite ${s.id} blocked ${fmt(inISO)} → ${fmt(outISO)} (${b.ref}).`);
  }

  if (C === "RESUME") {
    const p = normPhone(rest[0]);
    if (!p) return reply("Format: RESUME 0712345678");
    await db.clearHandoff(p);
    return reply(`Bot switched back on for +${p}.`);
  }
  return false;
}

/* ------------------------------------------------------------ guest side */

const GREETING = /^(hi+|hello|hey|hallo|habari|mambo|niaje|sasa|hujambo|good (morning|afternoon|evening)|menu|start|bot)\b/i;

async function myBookings(to) {
  const t0 = todayISO();
  const mine = (await db.listBookings()).filter(b => b.phone === to && b.out >= t0 && ["pending", "confirmed"].includes(b.status));
  if (!mine.length) return wa.buttons(to, "You have no upcoming bookings with us.", [{ id: "m_book", title: "Book a suite" }]);
  return wa.text(to, mine.map(b => `*${b.ref}* · ${b.status === "confirmed" ? "✅ Confirmed" : db.isActive(b) ? "⏳ Waiting for host" : "⌛ Expired, please rebook"}\n${summary(b)}`).join("\n\n") + "\n\nTo cancel, type CANCEL followed by the reference.");
}

async function startHandoff(to, name) {
  await db.setHandoff(to, 12);
  await db.clearSession(to);
  await wa.text(to, `Sure. The host will reply here shortly. You can also call ${BIZ.phones[0]}.\n\n(Type *MENU* to use the booking assistant again.)`);
  await notifyAdmins(`💬 ${name || "A guest"} (+${to}) asked to chat with a person. The bot is paused for them for 12 hours.`, `+${to} asked to chat with the host`);
}

export async function handleMessage({ from, profileName, input }) {
  const id = input.id || "";
  const raw = (input.text || "").trim();
  const low = raw.toLowerCase();

  if (isAdmin(from) && raw && await handleAdmin(from, raw)) return;

  // A person is handling this chat: stay quiet unless the guest asks for the menu.
  if (await db.isHandoff(from)) {
    if (/^(menu|bot|book)$/i.test(raw)) await db.clearHandoff(from);
    else return;
  }

  // Website "Send on WhatsApp" request: jump straight to the check.
  const site = parseSiteRequest(raw);
  if (site) {
    const s = { ...site, step: "checking" };
    await wa.text(from, `Thanks${site.name ? " " + site.name.split(" ")[0] : ""}! Checking availability for your request…`);
    await checkAvailability(from, s, profileName);
    return db.setSession(from, s);
  }

  if (/^(host|agent|human|person|talk to (a )?(person|host|human))$/i.test(raw) || id === "m_host") return startHandoff(from, profileName);
  if (/^(my booking|my bookings|status)$/i.test(raw)) return myBookings(from);

  const cancelRef = raw.match(/^cancel\s+(DAL-[A-Z0-9-]+)$/i)?.[1];
  if (cancelRef) {
    const b = await db.getBooking(cancelRef);
    if (!b || b.phone !== from) return wa.text(from, "I couldn't find that booking on your number. Type MY BOOKING to see yours.");
    b.status = "cancelled"; await db.saveBooking(b);
    await notifyAdmins(`❌ Guest cancelled ${b.ref} (${b.suite}, ${fmt(b.in)} → ${fmt(b.out)}, ${b.name}).`, `${b.ref} cancelled by guest`);
    return wa.text(from, `Booking ${b.ref} is cancelled. We hope to host you another time.`);
  }

  let s = (await db.getSession(from)) || { step: "idle" };

  if (/^(cancel|stop|exit|quit)$/i.test(raw) || id === "c_no") {
    await db.clearSession(from);
    return wa.buttons(from, "No problem, nothing was booked.", [{ id: "m_book", title: "Start again" }, { id: "m_suites", title: "Suites & rates" }]);
  }
  if (id === "m_suites" || /^(suites|rooms|rates|prices|price)$/i.test(raw)) return sendSuites(from);
  if (id === "m_contact" || /^(location|directions|where|address|contact)$/i.test(raw)) return sendContact(from);
  if (id === "m_book" || /^(book|booking|reserve|start again)$/i.test(raw)) { s = { step: "idle" }; await askSuite(from, s); return db.setSession(from, s); }
  if (s.step === "idle" || /^(menu|restart)$/i.test(raw)) { await db.clearSession(from); return sendMenu(from, profileName); }

  switch (s.step) {
    case "suite":
    case "alt": {
      if (id === "c_dates") { await askCheckin(from, s); break; }
      const typed = BIZ.suites.find(x => new RegExp(`(^|\\s)${x.id.replace(/[-]/g, "\\-")}(\\s|$)`, "i").test(raw))?.id;
      const pick = id.startsWith("s_") ? id.slice(2) : (typed || (/any/i.test(raw) ? "any" : null));
      if (!pick) { await (s.step === "alt" ? wa.text(from, "Please pick one of the free suites, or Change dates.") : askSuite(from, s)); return db.setSession(from, s); }
      s.suite = pick;
      if (s.step === "alt") { await checkAvailability(from, s, profileName); break; }
      await askCheckin(from, s); break;
    }
    case "checkin": {
      const d = parseDate(raw);
      if (!d) { await wa.text(from, "Sorry, I didn't get that date. Try 20/12 or 20 Dec."); break; }
      if (d < todayISO()) { await wa.text(from, "That date has passed. Which date will you check in?"); break; }
      if (d > addDays(todayISO(), 365)) { await wa.text(from, "We take bookings up to a year ahead. Please choose an earlier date."); break; }
      s.in = d; delete s.out; await askCheckout(from, s); break;
    }
    case "checkout": {
      let out = null;
      const n = raw.match(/^(\d{1,2})\s*(nights?|days?|usiku)?$/i);
      if (n) out = addDays(s.in, Number(n[1]));
      else out = parseDate(raw);
      if (!out) { await wa.text(from, "Please send a check-out date (e.g. 22/12) or a number of nights (e.g. 2)."); break; }
      if (out <= s.in) { await wa.text(from, `Check-out must be after ${fmt(s.in)}.`); break; }
      if (nightsBetween(s.in, out) > BIZ.maxNights) { await wa.text(from, `For stays over ${BIZ.maxNights} nights, type HOST and we'll arrange a monthly rate.`); break; }
      s.out = out;
      if (s.guests) { await afterGuests(from, s, profileName); break; }
      await askGuests(from, s); break;
    }
    case "guests": {
      const g = id.startsWith("g_") ? Number(id.slice(2)) : Number(raw.match(/\d+/)?.[0]);
      if (!g || g < 1) { await askGuests(from, s); break; }
      s.guests = g;
      const largest = Math.max(1, ...BIZ.suites.map(x => x.sleeps));
      if (g > largest) s.notes = [s.notes, `Group of ${g}: needs more than one suite`].filter(Boolean).join(" · ");
      if (s.suite !== "any" && (suiteById(s.suite)?.sleeps || 0) < Math.min(g, largest)) s.suite = "any";
      delete s.option;
      await afterGuests(from, s, profileName); break;
    }
    case "option": {
      const o = id === "o_room" || /^(1|one|room|bedroom|1 bedroom)$/i.test(raw) ? "room"
        : id === "o_suite" || /^(2|two|whole|suite|whole suite|both)$/i.test(raw) ? "suite" : null;
      if (!o) { await askOption(from, s); break; }
      s.option = o;
      await checkAvailability(from, s, profileName); break;
    }
    case "name": {
      const name = id === "n_profile" ? profileName : raw;
      if (!name || name.length < 2 || name.length > 60) { await askName(from, s, profileName); break; }
      s.name = name.replace(/\s+/g, " "); await askConfirm(from, s); break;
    }
    case "confirm":
    case "checking": {
      if (id === "c_yes" || /^(yes|confirm|ok|okay|ndio|sawa)$/i.test(raw)) { await submit(from, s); return; }
      if (id === "c_dates" || /date/i.test(raw)) { await askCheckin(from, s); break; }
      if (s.step === "checking") { await checkAvailability(from, s, profileName); break; }
      await askConfirm(from, s); break;
    }
    case "full": {
      if (id === "c_dates" || /date/i.test(raw)) { await askCheckin(from, s); break; }
      await sendMenu(from, profileName); await db.clearSession(from); return;
    }
    default: await db.clearSession(from); return sendMenu(from, profileName);
  }
  return db.setSession(from, s);
}

/* --------------------------------------------------------------- webhook */

function inputOf(m) {
  if (m.type === "text") return { text: m.text?.body || "" };
  if (m.type === "interactive") {
    const r = m.interactive?.button_reply || m.interactive?.list_reply || {};
    return { id: r.id || "", text: r.title || "" };
  }
  if (m.type === "button") return { id: m.button?.payload || "", text: m.button?.text || "" };
  return { unsupported: m.type };
}

export async function processWebhook(body) {
  await refreshCatalog(); // current units, prices and offers from the database
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      // Coexistence: the host replied from the WhatsApp Business app, so let them take over.
      for (const echo of v.message_echoes || []) if (echo.to) await db.setHandoff(normPhone(echo.to), 12);

      const names = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name || ""]));
      for (const m of v.messages || []) {
        if (!(await db.firstSeen(m.id))) continue;
        const from = normPhone(m.from);
        await wa.markRead(m.id);
        const input = inputOf(m);
        try {
          if (input.unsupported) {
            if (!(await db.isHandoff(from))) await wa.text(from, "Thanks! I can only read text and button replies. Type *MENU* to book, or *HOST* to chat with a person.");
            continue;
          }
          await handleMessage({ from, profileName: names[m.from] || "", input });
        } catch (e) {
          console.error("Bot error", e);
          await wa.text(from, `Sorry, something went wrong on our side. Please call ${BIZ.phones[0]} or type HOST.`).catch(() => {});
        }
      }
    }
  }
}
