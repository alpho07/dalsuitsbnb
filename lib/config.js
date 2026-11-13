// Business details used by the WhatsApp bot. Keep in step with CONFIG in index.html.
// Nightly rates can be set without code via the RATES env var, e.g. {"110":3500,"123":3500,"115":4500,"117":4500}

function parseRates() {
  try { return JSON.parse(process.env.RATES || "{}"); } catch { return {}; }
}
const RATES = parseRates();

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
  suites: [
    { id: "110", block: "A", sleeps: 2, tag: "Perfect for couples",
      desc: "Modern, stylish ground-floor suite with a queen bed, cozy sitting area and private bathroom." },
    { id: "123", block: "A", sleeps: 2, tag: "Quiet & secluded",
      desc: "Clean, spacious upper-floor suite with natural light and a work desk. Ideal for resting." },
    { id: "115", block: "B", sleeps: 3, tag: "Great for families",
      desc: "Spacious, cozy suite with a lounge and kitchenette." },
    { id: "117", block: "B", sleeps: 3, tag: "Secluded corner suite",
      desc: "Corner suite with a kitchenette, made for rest and longer stays." }
  ].map(s => ({ ...s, rate: Number(RATES[s.id]) || null })),
  amenities: "Fast Wi-Fi · Smart TV with Netflix & YouTube · Hot shower · Clean, spacious & cozy"
};

export const suiteById = id => BIZ.suites.find(s => s.id === String(id));
export const money = n => "KES " + Number(n).toLocaleString("en-KE");
