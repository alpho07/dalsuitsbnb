// GET /api/availability?in=2026-12-20&out=2026-12-22&guests=2  ->  { available: ["110","123"], nights: 2 }
// Returns suite numbers only; no guest data leaves the store.
import { freeSuites } from "../lib/store.js";
import { catalog } from "../lib/units.js";
import { nightsBetween, todayISO } from "../lib/dates.js";

const iso = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const a = q.get("in"), b = q.get("out"), guests = Math.max(1, Number(q.get("guests")) || 1);
  if (!iso.test(a || "") || !iso.test(b || "") || b <= a || a < todayISO()) {
    return Response.json({ error: "Use in=YYYY-MM-DD&out=YYYY-MM-DD with check-out after check-in, from today." }, { status: 400 });
  }
  await catalog(); // current units from the database
  const free = await freeSuites(a, b, guests);
  return Response.json({ available: free.map(s => s.id), nights: nightsBetween(a, b) }, { headers: { "Cache-Control": "no-store" } });
}
