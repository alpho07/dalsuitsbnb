// DAL Suits BnB: website + WhatsApp booking bot, as one Express app for Hostinger Node.js hosting.
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GET as whatsappGET, POST as whatsappPOST } from "./api/whatsapp.js";
import { GET as availabilityGET } from "./api/availability.js";
import { storageMode } from "./lib/store.js";
import { site } from "./api/site.js";
import { admin } from "./api/admin.js";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

// The API handlers use the standard Request/Response objects; adapt Express to them.
function toRequest(req, body) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  return new Request(`${req.protocol}://${req.get("host")}${req.originalUrl}`, {
    method: req.method, headers, body: body && body.length ? body : undefined
  });
}
const handle = fn => async (req, res) => {
  try {
    const out = await fn(toRequest(req, Buffer.isBuffer(req.body) ? req.body : null));
    res.status(out.status);
    out.headers.forEach((v, k) => res.setHeader(k, v));
    res.send(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    console.error(req.method, req.originalUrl, e);
    res.status(500).json({ error: "Server error" });
  }
};

app.get("/api/whatsapp", handle(whatsappGET));
app.post("/api/whatsapp", express.raw({ type: "*/*", limit: "1mb" }), handle(whatsappPOST)); // raw body for signature check
app.get("/api/availability", handle(availabilityGET));
app.use(site);   // /api/units, /api/quote, /media/:id
app.use(admin);  // /admin/api/*

// Admin dashboard (never indexed)
app.get(["/admin", "/admin/"], (req, res) => {
  res.set({ "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" });
  res.sendFile(join(here, "admin", "index.html"));
});

// Old-style links like /bnb-rongo.html redirect to the clean URL so Google sees one address per page.
app.get(/^\/(.+)\.html$/, (req, res, next) => req.params[0] === "index" ? res.redirect(301, "/") : res.redirect(301, "/" + req.params[0]));
app.get("/og-image.png", (req, res) => res.redirect(301, "/og-image.jpg"));
app.use(express.static(join(here, "public"), { maxAge: "1h", index: "index.html", extensions: ["html"] }));
app.use((req, res) => res.status(404).sendFile(join(here, "public", "index.html")));

app.listen(PORT, () => console.log(`DAL Suits BnB listening on ${PORT} (storage: ${storageMode})`));
