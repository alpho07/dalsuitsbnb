// Business details used by the WhatsApp bot and the backend.
// Units, prices and discounts live in the database and are managed at /admin.
// SEED_UNITS is only used to fill an empty database on first run (and as a fallback
// when no database is configured).

// Every physical suite has 2 bedrooms and is offered to guests as two listings:
// "<code>.1B" (1 bedroom: roomPrice, roomSleeps) and "<code>.2B" (2 bedrooms: price, sleeps).
// Both listings are the same rooms, so booking one makes the other unavailable for those dates.
export const SEED_UNITS = [
  { code: "110", block: "A", bedrooms: 2, sleeps: 4, price: 5000, roomPrice: 2500, roomSleeps: 2, sort: 1,
    description: "Modern, stylish two-bedroom suite with a cozy sitting area.",
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
/** Price, guests and label for a booking option: "room" (1 bedroom) or "suite" (all bedrooms). */
export const optionOf = (s, option) => option === "room" && s?.roomRate
  ? { option: "room", rate: s.roomRate, sleeps: s.roomSleeps || 2, bedrooms: 1, label: "1 bedroom" }
  : { option: "suite", rate: s?.rate, sleeps: s?.sleeps, bedrooms: s?.bedrooms || 1, label: `${s?.bedrooms || 1} bedroom${(s?.bedrooms || 1) > 1 ? "s" : ""}` };

/** Guest-facing code of a booking: "110.1B" (1 bedroom) or "110.2B" (whole 2-bedroom suite). */
export const listingCode = (code, option, bedrooms = 2) => `${code}.${option === "room" ? 1 : bedrooms || 1}B`;

/** The listings guests choose from: two per suite that has a 1-bedroom price, otherwise one. */
export const listingsOf = s => [
  ...(s.roomRate ? [{ code: listingCode(s.id, "room"), unit: s.id, option: "room", bedrooms: 1, sleeps: s.roomSleeps || 2, rate: s.roomRate, block: s.block }] : []),
  { code: listingCode(s.id, "suite", s.bedrooms), unit: s.id, option: "suite", bedrooms: s.bedrooms, sleeps: s.sleeps, rate: s.rate, block: s.block }
];
export const allListings = () => BIZ.suites.flatMap(listingsOf);

/** "110.1B" -> { unit: "110", option: "room" }; "110" or "110.2B" -> whole suite. Null if no such suite. */
export function parseListing(text) {
  const m = String(text || "").trim().match(/^([A-Za-z0-9-]+?)(?:[.\s-]?(\d+)\s*B(?:R|ED(?:ROOMS?)?)?)?$/i);
  if (!m) return null;
  const s = suiteById(m[1]);
  if (!s) return null;
  const option = m[2] && Number(m[2]) === 1 && s.roomRate && s.bedrooms > 1 ? "room" : "suite";
  return { unit: s.id, option, code: listingCode(s.id, option, s.bedrooms) };
}

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
