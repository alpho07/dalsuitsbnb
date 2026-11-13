// Admin sign-in: one shared password (ADMIN_PASSWORD) and a signed, HttpOnly session cookie.
import crypto from "node:crypto";

const COOKIE = "dal_admin";
const HOURS = 12;
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
export const adminEnabled = () => (process.env.ADMIN_PASSWORD || "").length >= 10;

const sign = v => crypto.createHmac("sha256", secret()).update(v).digest("base64url");
const same = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(/;\s*/).filter(Boolean).map(c => {
    const i = c.indexOf("="); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
  }));
}

export function isSignedIn(req) {
  if (!adminEnabled()) return false;
  const v = cookies(req)[COOKIE];
  if (!v) return false;
  const [exp, mac] = v.split(".");
  return Number(exp) > Date.now() && same(mac, sign(exp));
}

function setCookie(req, res, value, maxAgeSec) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`);
}

// Simple brute-force brake: 5 wrong passwords per IP per 15 minutes.
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), list = (attempts.get(ip) || []).filter(t => now - t < 15 * 60e3);
  attempts.set(ip, list);
  return list.length >= 5;
}

export function login(req, res) {
  if (!adminEnabled()) return res.status(503).json({ error: "Admin is switched off. Set ADMIN_PASSWORD (10+ characters) in the hosting environment variables." });
  const ip = req.ip || "?";
  if (tooMany(ip)) return res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
  if (!same(req.body?.password || "", process.env.ADMIN_PASSWORD)) {
    attempts.get(ip).push(Date.now());
    return res.status(401).json({ error: "Wrong password." });
  }
  const exp = String(Date.now() + HOURS * 3600e3);
  setCookie(req, res, `${exp}.${sign(exp)}`, HOURS * 3600);
  res.json({ ok: true });
}

export function logout(req, res) { setCookie(req, res, "", 0); res.json({ ok: true }); }

/** Guards admin API routes. Mutations must also come from this site (CSRF defence with SameSite). */
export function requireAdmin(req, res, next) {
  if (!isSignedIn(req)) return res.status(401).json({ error: "Please sign in." });
  if (req.method !== "GET") {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "Cross-site request blocked." });
  }
  next();
}
