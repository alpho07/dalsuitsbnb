// Business details used by the WhatsApp bot and the backend.
// Units, prices and discounts live in the database and are managed at /admin.
// SEED_UNITS is only used to fill an empty database on first run (and as a fallback
// when no database is configured).

// Every suite has 2 bedrooms. Guests book either the whole suite (price, sleeps) or
// just 1 bedroom (roomPrice, roomSleeps); a 1-bedroom booking still keeps the suite private.
export const SEED_UNITS = [
  { code: "110", block: "A", bedrooms: 2, sleeps: 4, price: 5000, roomPrice: 2500, roomSleeps: 2, sort: 1,
    description: "Modern, stylish two-bedroom suite with a cozy sitting area. Book one bedroom or the whole suite.",
    features: ["Fast Wi-Fi", "Smart TV: Netflix & YouTube", "Private bathroom"] },
  { code: "123", block: "A", bedrooms: 2, sleeps: 4, price: 5000, roomPrice: 2500, roomSleeps: 2, sort: 2,
    description: "Clean, spacious two-bedroom suite. Quiet and secluded, ideal for resting.",
    features: ["Fast Wi-Fi", "Smart TV: Netflix & YouTube", "Work desk"] },
  { code: "115", block: "B", bedrooms: 2, sleeps: 4, price: 5000, roomPrice: 2500, roomSleeps: 2, sort: 3,
    description: "Spacious, cozy two-bedroom suite. Perfect for families.",
    features: ["Fast Wi-Fi", "Smart TV: Netflix & YouTube", "Lounge"] },
  { code: "117", block: "B", bedrooms: 2, sleeps: 4, price: 5000, roomPrice: 2500, roomSleeps: 2, sort: 4,
    description: "Secluded two-bedroom corner suite, made for rest and longer stays.",
    features: ["Fast Wi-Fi", "Smart TV: Netflix & YouTube", "Corner unit"] }
];

/** Shape the bot uses for a unit. */
export const toSuite = u => ({
  id: u.code, unitId: u.id ?? null, block: u.block, sleeps: u.sleeps, bedrooms: u.bedrooms, rate: u.price,
  roomRate: u.roomPrice || null, roomSleeps: u.roomSleeps || null, desc: u.description,
  tag: `${u.bedrooms} bedroom${u.bedrooms > 1 ? "s" : ""} · sleeps ${u.sleeps}`
});
/** Price, guests and label for a booking option: "room" (1 bedroom) or "suite" (whole suite). */
export const optionOf = (s, option) => option === "room" && s?.roomRate
  ? { option: "room", rate: s.roomRate, sleeps: s.roomSleeps || 2, label: "1 bedroom" }
  : { option: "suite", rate: s?.rate, sleeps: s?.sleeps, label: s?.bedrooms > 1 ? `whole suite (${s.bedrooms} bedrooms)` : "whole suite" };

export const BIZ = {
  name: "DAL Suits BnB",
  address: "Nyarach Kobura, Rongo Town, Migori County",
  lat: -0.7351897,
  lng: 34.5943577,
  mapsUrl: "https://maps.google.com/?q=-0.7351897,34.5943577",
  siteUrl: process.env.SITE_URL || "https://dalsuitsbnb.com",
  phones: ["0711 943 866", "0143 247 740", "0182 744 059"],
  checkIn: "2:00 pm",
  checkOut: "10:00 am",
  tzOffsetHours: 3,            // Africa/Nairobi, no daylight saving
  pendingHoldHours: 24,        // unconfirmed requests stop blocking dates after this
  maxNights: 60,
  retentionDays: 90,           // booking records auto-delete this long after check-out
  payment: process.env.PAYMENT_INSTRUCTIONS || "We'll share M-Pesa payment details when we confirm.",
  suites: SEED_UNITS.map(toSuite),           // replaced at runtime from the database (lib/units.js)
  amenities: "Fast Wi-Fi · Smart TV with Netflix & YouTube · Clean, spacious & cozy"
};

export const suiteById = id => BIZ.suites.find(s => s.id === String(id));
export const money = n => "KES " + Number(n).toLocaleString("en-KE");
