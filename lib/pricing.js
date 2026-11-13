// Pricing rules, shared by the website API, the WhatsApp bot and the admin dashboard.
// A unit has a nightly price (KES). A discount is either a percentage of the stay or a
// fixed KES amount off per night. It can target one unit or all units (unitId null), need
// a minimum number of nights, and be limited to stays that START between `starts` and `ends`.
// Discounts never stack: the guest gets the single best one.

export const nightsBetween = (a, b) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

const kes = n => "KES " + Number(n).toLocaleString("en-KE");

export function describe(d) {
  if (d.label) return d.label;
  let s = d.kind === "percent" ? `${d.value}% off` : `${kes(d.value)} off per night`;
  if ((d.minNights || 1) > 1) s += ` for ${d.minNights}+ nights`;
  return s;
}

export function applies(d, unit, inISO, nights) {
  if (!d.active) return false;
  if (d.unitId != null && d.unitId !== unit.id) return false;
  if (nights < (d.minNights || 1)) return false;
  if (d.starts && inISO < d.starts) return false;
  if (d.ends && inISO > d.ends) return false;
  return true;
}

export function amountOff(d, price, nights) {
  const base = price * nights;
  return d.kind === "percent" ? Math.round(base * d.value / 100) : Math.min(base, d.value * nights);
}

/** Full price for a stay. */
export function quote(unit, discounts, inISO, outISO) {
  const nights = nightsBetween(inISO, outISO);
  const base = unit.price * nights;
  let best = null;
  for (const d of discounts || []) {
    if (!applies(d, unit, inISO, nights)) continue;
    const amount = amountOff(d, unit.price, nights);
    if (amount > 0 && (!best || amount > best.amount)) best = { id: d.id, label: describe(d), amount };
  }
  return { nights, nightly: unit.price, base, discount: best, total: Math.max(0, base - (best?.amount || 0)) };
}

/** The offer to advertise on a unit card today: best discount running now, per night. */
export function offer(unit, discounts, todayISO) {
  let best = null;
  for (const d of discounts || []) {
    const n = Math.max(1, d.minNights || 1);
    if (!d.active || (d.unitId != null && d.unitId !== unit.id)) continue;
    if (d.ends && todayISO > d.ends) continue;
    const perNight = Math.round(amountOff(d, unit.price, n) / n);
    if (perNight > 0 && (!best || perNight > best.perNight)) best = { id: d.id, label: describe(d), perNight, minNights: n, starts: d.starts || null, ends: d.ends || null };
  }
  return best && { ...best, nightly: unit.price - best.perNight };
}
