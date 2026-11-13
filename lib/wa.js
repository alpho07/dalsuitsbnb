// Thin WhatsApp Cloud API client. Works with Meta directly or a BSP that exposes the
// Cloud API format (e.g. 360dialog, needed for "coexistence" on a Business app number).
//   Meta:       WA_TOKEN + WA_PHONE_NUMBER_ID   (POST graph.facebook.com/<ver>/<id>/messages)
//   360dialog:  WA_PROVIDER=360dialog + WA_TOKEN (POST waba-v2.360dialog.io/messages, D360-API-KEY)
import crypto from "node:crypto";

const PROVIDER = (process.env.WA_PROVIDER || "meta").toLowerCase();
const TOKEN = process.env.WA_TOKEN;
const PHONE_ID = process.env.WA_PHONE_NUMBER_ID;
const VER = process.env.WA_GRAPH_VERSION || "v21.0";
export const DRY = !TOKEN || process.env.WA_DRY_RUN === "1";
export const outbox = globalThis.__dalOutbox || (globalThis.__dalOutbox = []);

function endpoint() {
  if (PROVIDER === "360dialog") return { url: (process.env.WA_API_BASE || "https://waba-v2.360dialog.io") + "/messages", headers: { "D360-API-KEY": TOKEN } };
  return { url: `https://graph.facebook.com/${VER}/${PHONE_ID}/messages`, headers: { Authorization: `Bearer ${TOKEN}` } };
}

export async function send(to, payload) {
  const body = { messaging_product: "whatsapp", recipient_type: "individual", to, ...payload };
  if (DRY) { outbox.push(body); return { ok: true, dry: true }; }
  const { url, headers } = endpoint();
  const r = await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("WA send failed", r.status, JSON.stringify(j)); return { ok: false, error: j.error || j }; }
  return { ok: true, id: j.messages?.[0]?.id };
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export const text = (to, body) => send(to, { type: "text", text: { body: clip(body, 4096), preview_url: false } });

export const buttons = (to, body, btns, footer) => send(to, {
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: clip(body, 1024) },
    ...(footer ? { footer: { text: clip(footer, 60) } } : {}),
    action: { buttons: btns.slice(0, 3).map(b => ({ type: "reply", reply: { id: b.id, title: clip(b.title, 20) } })) }
  }
});

export const list = (to, body, buttonText, rows, header) => send(to, {
  type: "interactive",
  interactive: {
    type: "list",
    ...(header ? { header: { type: "text", text: clip(header, 60) } } : {}),
    body: { text: clip(body, 1024) },
    action: {
      button: clip(buttonText, 20),
      sections: [{ title: "Options", rows: rows.slice(0, 10).map(r => ({ id: r.id, title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })) }]
    }
  }
});

export const location = (to, lat, lng, name, address) =>
  send(to, { type: "location", location: { latitude: lat, longitude: lng, name, address } });

export const template = (to, name, params = [], lang = process.env.WA_TEMPLATE_LANG || "en") => send(to, {
  type: "template",
  template: { name, language: { code: lang }, components: params.length ? [{ type: "body", parameters: params.map(p => ({ type: "text", text: String(p) })) }] : [] }
});

/** Free-form text first; if WhatsApp refuses because the 24h window is closed, fall back to an approved template. */
export async function textOrTemplate(to, body, templateName, params) {
  const r = await text(to, body);
  if (r.ok || !templateName) return r;
  return template(to, templateName, params);
}

export function markRead(messageId) {
  if (DRY || !messageId) return;
  const { url, headers } = endpoint();
  return fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }) }).catch(() => {});
}

export function validSignature(raw, header) {
  const secret = process.env.WA_APP_SECRET;
  if (!secret) return true; // not configured (e.g. BSP without signatures)
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
