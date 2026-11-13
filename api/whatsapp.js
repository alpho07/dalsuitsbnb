// WhatsApp webhook: https://dalsuitsbnb.com/api/whatsapp
import { processWebhook } from "../lib/bot.js";
import { validSignature, DRY } from "../lib/wa.js";
import { storageMode, ping } from "../lib/store.js";

export async function GET(request) {
  const u = new URL(request.url);
  if (u.searchParams.get("health") !== null) {
    let db = "ok";
    try { await ping(); } catch (e) { db = "error: " + e.message; }
    return Response.json({
      ok: db === "ok",
      storage: storageMode,                       // "mysql" on Hostinger, "redis" on Vercel; never "memory" in production
      database: db,
      whatsapp: DRY ? "dry-run (WA_TOKEN missing)" : (process.env.WA_PROVIDER || "meta"),
      phoneNumberId: !!process.env.WA_PHONE_NUMBER_ID,
      verifyToken: !!process.env.WA_VERIFY_TOKEN,
      signatureCheck: !!process.env.WA_APP_SECRET,
      admins: (process.env.ADMIN_NUMBERS || "").split(",").filter(Boolean).length
    });
  }
  const ok = u.searchParams.get("hub.mode") === "subscribe" &&
    process.env.WA_VERIFY_TOKEN && u.searchParams.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN;
  return ok ? new Response(u.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Forbidden", { status: 403 });
}

export async function POST(request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  let body;
  try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  try { await processWebhook(body); } catch (e) { console.error("Webhook error", e); }
  return new Response("OK", { status: 200 }); // always 200 so WhatsApp doesn't retry-storm
}
