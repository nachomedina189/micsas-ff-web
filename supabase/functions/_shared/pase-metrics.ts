// Càlcul dels indicadors de l'informe del pase (correu que rep Micsas quan
// el pizzero prem "Tancar pase" a cocina.html). Mòdul pur: no llegeix res
// de Supabase ni de Deno, només rep files ja carregades i retorna números,
// així es pot provar i previsualitzar fora de l'edge function.

export const SLOTS = ["20:00", "20:15", "20:30", "20:45", "21:00", "21:15", "21:30", "21:45", "22:00", "22:15", "22:30"];
export const SLOT_CAPACITY = 6;
// Pizzes de la carta (mateixos noms que CATALOG a place-order). Les que no
// s'han venut surten amb 0 a l'informe; qualsevol altra línia és beguda.
export const PIZZA_MENU = [
  "Margherita 1889", "Marinara Olivata", "Bianca Suprema", "Sottobosco", "Carbonara",
  "Inferno di 'Nduja", "Caramella Affumicata", "Antidiavola", "Nutellina",
];
// Pizzes temporalment fora de carta: no surten com a "0 vendes".
const OFF_MENU = new Set(["Caramella Affumicata"]);

// Objectius per pintar cada temps en verd/groc/vermell.
export const TARGETS = {
  kitchenMin: 10,   // Preparant → Llest
  rackMin: 5,       // Llest → En repartiment
  routeMin: 15,     // En repartiment → Entregat
  onTimePct: 85,    // entregades com a molt 15 min després de l'inici de la franja
  onTimeGraceMin: 15,
};

export interface OrderRow {
  id: string;
  delivery_date: string;            // YYYY-MM-DD
  status: string;
  payment_method: string;
  payment_status: string;
  total: number;
  tip_amount: number;
  pizza_count: number;
  slot_time: string | null;
  requested_slot: string | null;
  slot_allocations: Record<string, number> | null;
  created_at: string;               // ISO
  updated_at: string | null;        // ISO
  customer_key: string | null;      // telèfon normalitzat (o el seu hash)
}
export interface ItemRow { order_id: string; product_name: string; unit_price: number; quantity: number }
export interface StatusEventRow { order_id: string; status: string; changed_at: string }
export interface RejectionRow { delivery_date: string | null; pizza_count: number | null; reason: string }
export interface IncidentRow { order_id: string; kind: string }

export interface ReportInput {
  date: string;                     // data del pase
  orders: OrderRow[];               // totes les comandes fins a `date` (com a mínim les últimes 10 setmanes)
  items: ItemRow[];                 // línies de les comandes de les últimes 10 setmanes
  events: StatusEventRow[];         // canvis d'estat de les comandes dels dies que s'informen
  rejections: RejectionRow[];
  incidents: IncidentRow[];
  doughs: Record<string, { doughs: number; set: boolean }>;
  closedAt?: string | null;         // quan s'ha premut "Tancar pase"
}

// ── Utilitats ───────────────────────────────────────────────────────────
export function isConfirmed(o: OrderRow): boolean {
  return o.status !== "cancelled" && (o.payment_method === "cash" || o.payment_status === "paid");
}
const toMins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const round1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}
const madridFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
// Data i minuts del dia a Europe/Madrid d'un instant ISO.
export function madrid(iso: string): { date: string; mins: number } {
  const parts = madridFmt.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, mins: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}
// Minuts d'un instant respecte a la mitjanit de `date` (pot passar de 1440).
function minsOnDay(iso: string, date: string): number {
  const m = madrid(iso);
  if (m.date === date) return m.mins;
  return m.mins + (m.date > date ? 1440 : -1440);
}
const minutesBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

function slotPizzas(o: OrderRow): Record<string, number> {
  if (o.slot_allocations && Object.keys(o.slot_allocations).length) return o.slot_allocations;
  return o.slot_time ? { [o.slot_time]: o.pizza_count } : {};
}

// ── Resum bàsic d'un dia (per a comparatives i tendència) ───────────────
export interface DaySummary {
  date: string;
  orders: number;
  pizzas: number;
  revenue: number;
  tips: number;
  ticket: number;
  pizzasPerOrder: number;
  returning: number;
  returningPct: number;
  slots: Record<string, number>;
  products: Record<string, number>;
}

function summarize(date: string, all: OrderRow[], itemsByOrder: Map<string, ItemRow[]>, seenBefore: Set<string>): DaySummary {
  const orders = all.filter((o) => o.delivery_date === date && isConfirmed(o));
  const pizzas = sum(orders.map((o) => o.pizza_count || 0));
  const revenue = sum(orders.map((o) => Number(o.total) || 0));
  const tips = sum(orders.map((o) => Number(o.tip_amount) || 0));
  const returning = orders.filter((o) => o.customer_key && seenBefore.has(o.customer_key)).length;
  const slots: Record<string, number> = Object.fromEntries(SLOTS.map((s) => [s, 0]));
  for (const o of orders) for (const [s, q] of Object.entries(slotPizzas(o))) slots[s] = (slots[s] ?? 0) + Number(q);
  const products: Record<string, number> = {};
  for (const o of orders) for (const it of itemsByOrder.get(o.id) ?? []) products[it.product_name] = (products[it.product_name] ?? 0) + it.quantity;
  return {
    date, orders: orders.length, pizzas, revenue, tips,
    ticket: orders.length ? revenue / orders.length : 0,
    pizzasPerOrder: orders.length ? pizzas / orders.length : 0,
    returning, returningPct: orders.length ? (returning / orders.length) * 100 : 0,
    slots, products,
  };
}

// Resum de tots els dies amb comandes confirmades fins a `date` inclòs,
// ordenats del més antic al més recent.
export function daySummaries(input: ReportInput): DaySummary[] {
  const itemsByOrder = new Map<string, ItemRow[]>();
  for (const it of input.items) {
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  }
  const dates = [...new Set(input.orders.filter((o) => isConfirmed(o) && o.delivery_date <= input.date).map((o) => o.delivery_date))].sort();
  if (!dates.includes(input.date)) dates.push(input.date);
  const seen = new Set<string>();
  const out: DaySummary[] = [];
  for (const d of dates) {
    out.push(summarize(d, input.orders, itemsByOrder, seen));
    for (const o of input.orders) if (o.delivery_date === d && isConfirmed(o) && o.customer_key) seen.add(o.customer_key);
  }
  return out;
}

// ── Informe complet d'un pase (plantilla B) ─────────────────────────────
export interface ProductRow { name: string; qty: number; revenue: number; prev: number | null }
export interface Insight { level: "bad" | "warn" | "good" | "info"; title: string; text: string }

export interface PaseReport {
  date: string;
  closedAt: string | null;
  day: DaySummary;
  prevSameDay: DaySummary | null;
  avg4: { orders: number; pizzas: number; revenue: number; ticket: number; pizzasPerOrder: number; tips: number } | null;
  drinks: number;
  products: ProductRow[];
  fullSlots: string[];
  emptySlots: string[];
  displaced: number;
  peakHour: { from: string; to: string; pizzas: number } | null;
  pizzasPerHour: number;
  ordersPerHour: number;
  timing: { before: number; morning: number; evening: number; during: number };  // pizzes
  payments: { card: number; cash: number };
  abandoned: { orders: number; pizzas: number };
  cancelled: number;
  doughs: { total: number; set: boolean; used: number; left: number };
  ops: {
    measured: number;                // comandes amb hores reals de cada estat
    kitchenMin: number | null;
    rackMin: number | null;
    routeMin: number | null;
    onTimePct: number | null;
    avgLateMin: number | null;
    lateBuckets: { onTime: number; m15_30: number; m30_45: number; over45: number };
    approx: boolean;                 // true si la puntualitat surt de updated_at
    trips: number;
    ordersPerTrip: number | null;
    tripMin: number | null;          // sortida → última entrega del viatge
  };
  incidents: { total: number; orders: number; byKind: Record<string, number>; accuracyPct: number | null };
  rejections: { total: number; pizzas: number; byReason: Record<string, number> };
  insights: Insight[];
}

const lastEvent = (evs: StatusEventRow[], status: string) =>
  evs.filter((e) => e.status === status).map((e) => e.changed_at).sort().pop() ?? null;

export function buildPaseReport(input: ReportInput, summaries = daySummaries(input)): PaseReport {
  const date = input.date;
  const day = summaries.find((s) => s.date === date)!;
  const earlier = summaries.filter((s) => s.date < date && s.orders > 0);
  const prevSameDay = [...earlier].reverse().find((s) => weekday(s.date) === weekday(date)) ?? null;
  const last4 = earlier.slice(-4);
  const avg = (f: (s: DaySummary) => number) => sum(last4.map(f)) / last4.length;
  const avg4 = last4.length ? {
    orders: avg((s) => s.orders), pizzas: avg((s) => s.pizzas), revenue: avg((s) => s.revenue),
    ticket: sum(last4.map((s) => s.revenue)) / Math.max(1, sum(last4.map((s) => s.orders))),
    pizzasPerOrder: sum(last4.map((s) => s.pizzas)) / Math.max(1, sum(last4.map((s) => s.orders))),
    tips: avg((s) => s.tips),
  } : null;

  const dayOrders = input.orders.filter((o) => o.delivery_date === date);
  const confirmed = dayOrders.filter(isConfirmed);
  const confirmedIds = new Set(confirmed.map((o) => o.id));
  const dayItems = input.items.filter((it) => confirmedIds.has(it.order_id));

  // Pizzes i begudes
  const prodMap = new Map<string, { qty: number; revenue: number }>();
  for (const name of PIZZA_MENU) if (!OFF_MENU.has(name)) prodMap.set(name, { qty: 0, revenue: 0 });
  let drinks = 0;
  for (const it of dayItems) {
    if (!PIZZA_MENU.includes(it.product_name)) { drinks += it.quantity; continue; }
    const p = prodMap.get(it.product_name) ?? { qty: 0, revenue: 0 };
    p.qty += it.quantity;
    p.revenue += it.quantity * Number(it.unit_price);
    prodMap.set(it.product_name, p);
  }
  const products: ProductRow[] = [...prodMap.entries()]
    .map(([name, p]) => ({ name, qty: p.qty, revenue: p.revenue, prev: prevSameDay ? (prevSameDay.products[name] ?? 0) : null }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

  // Franges
  const fullSlots = SLOTS.filter((s) => (day.slots[s] ?? 0) >= SLOT_CAPACITY);
  const emptySlots = SLOTS.filter((s) => (day.slots[s] ?? 0) === 0);
  const displaced = confirmed.filter((o) => o.requested_slot && o.slot_time && toMins(o.slot_time) > toMins(o.requested_slot)).length;
  let peakHour: PaseReport["peakHour"] = null;
  for (let i = 0; i + 3 < SLOTS.length; i++) {
    const p = sum(SLOTS.slice(i, i + 4).map((s) => day.slots[s] ?? 0));
    if (!peakHour || p > peakHour.pizzas) {
      const end = toMins(SLOTS[i]) + 60;
      peakHour = { from: SLOTS[i], to: `${Math.floor(end / 60)}:${String(end % 60).padStart(2, "0")}`, pizzas: p };
    }
  }
  const serviceHours = (toMins(SLOTS[SLOTS.length - 1]) + 15 - toMins(SLOTS[0])) / 60;

  // Quan s'ha fet la comanda (en pizzes)
  const timing = { before: 0, morning: 0, evening: 0, during: 0 };
  for (const o of confirmed) {
    const m = madrid(o.created_at);
    const k = m.date < date ? "before" : m.mins < 18 * 60 ? "morning" : m.mins < 20 * 60 ? "evening" : "during";
    timing[k] += o.pizza_count || 0;
  }

  const payments = { card: confirmed.filter((o) => o.payment_method !== "cash").length, cash: confirmed.filter((o) => o.payment_method === "cash").length };
  const abandonedOrders = dayOrders.filter((o) => o.payment_method !== "cash" && o.payment_status !== "paid");
  const abandoned = { orders: abandonedOrders.length, pizzas: sum(abandonedOrders.map((o) => o.pizza_count || 0)) };
  const cancelled = dayOrders.filter((o) => o.status === "cancelled" && (o.payment_method === "cash" || o.payment_status === "paid")).length;

  const d = input.doughs[date] ?? { doughs: 40, set: false };
  const doughs = { total: d.doughs, set: d.set, used: day.pizzas, left: Math.max(0, d.doughs - day.pizzas) };

  // Temps reals a partir de l'historial d'estats
  const evByOrder = new Map<string, StatusEventRow[]>();
  for (const e of input.events) {
    if (!confirmedIds.has(e.order_id)) continue;
    const arr = evByOrder.get(e.order_id) ?? [];
    arr.push(e);
    evByOrder.set(e.order_id, arr);
  }
  const kitchen: number[] = [], rack: number[] = [], route: number[] = [], late: number[] = [];
  let approx = false;
  let measured = 0;
  const departures: { at: string; orderId: string }[] = [];
  const deliveredAt = new Map<string, string>();
  for (const o of confirmed) {
    const evs = evByOrder.get(o.id) ?? [];
    const prep = lastEvent(evs, "preparing"), ready = lastEvent(evs, "ready"), out = lastEvent(evs, "out_for_delivery");
    let deliv = lastEvent(evs, "delivered");
    if (evs.length) measured++;
    if (prep && ready && minutesBetween(prep, ready) >= 0) kitchen.push(minutesBetween(prep, ready));
    if (ready && out && minutesBetween(ready, out) >= 0) rack.push(minutesBetween(ready, out));
    if (out && deliv && minutesBetween(out, deliv) >= 0) route.push(minutesBetween(out, deliv));
    if (out) departures.push({ at: out, orderId: o.id });
    if (!deliv && o.status === "delivered" && o.updated_at) { deliv = o.updated_at; approx = true; }
    if (deliv) {
      deliveredAt.set(o.id, deliv);
      if (o.slot_time) late.push(minsOnDay(deliv, date) - toMins(o.slot_time));
    }
  }
  // Viatges: comandes que surten juntes (mateix toc o amb menys de 2 min de diferència)
  departures.sort((a, b) => a.at.localeCompare(b.at));
  const trips: { start: string; orders: string[] }[] = [];
  for (const dep of departures) {
    const t = trips[trips.length - 1];
    if (t && minutesBetween(t.start, dep.at) <= 2) t.orders.push(dep.orderId);
    else trips.push({ start: dep.at, orders: [dep.orderId] });
  }
  const tripDur = trips.map((t) => {
    const ends = t.orders.map((id) => deliveredAt.get(id)).filter((x): x is string => !!x).sort();
    return ends.length ? minutesBetween(t.start, ends[ends.length - 1]) : null;
  }).filter((x): x is number => x !== null && x >= 0);
  const lateBuckets = { onTime: 0, m15_30: 0, m30_45: 0, over45: 0 };
  for (const l of late) {
    if (l <= TARGETS.onTimeGraceMin) lateBuckets.onTime++;
    else if (l <= 30) lateBuckets.m15_30++;
    else if (l <= 45) lateBuckets.m30_45++;
    else lateBuckets.over45++;
  }
  const ops = {
    measured,
    kitchenMin: median(kitchen), rackMin: median(rack), routeMin: median(route),
    onTimePct: late.length ? (lateBuckets.onTime / late.length) * 100 : null,
    avgLateMin: late.length ? sum(late.map((l) => Math.max(0, l))) / late.length : null,
    lateBuckets, approx,
    trips: trips.length,
    ordersPerTrip: trips.length ? departures.length / trips.length : null,
    tripMin: median(tripDur),
  };

  const dayIncidents = input.incidents.filter((i) => confirmedIds.has(i.order_id));
  const byKind: Record<string, number> = {};
  for (const i of dayIncidents) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  const incidentOrders = new Set(dayIncidents.map((i) => i.order_id)).size;
  const incidents = {
    total: dayIncidents.length, orders: incidentOrders, byKind,
    accuracyPct: confirmed.length ? ((confirmed.length - incidentOrders) / confirmed.length) * 100 : null,
  };

  const dayRej = input.rejections.filter((r) => r.delivery_date === date);
  const byReason: Record<string, number> = {};
  for (const r of dayRej) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  const rejections = { total: dayRej.length, pizzas: sum(dayRej.map((r) => r.pizza_count || 0)), byReason };

  const report: PaseReport = {
    date, closedAt: input.closedAt ?? null, day, prevSameDay, avg4, drinks, products,
    fullSlots, emptySlots, displaced, peakHour,
    pizzasPerHour: day.pizzas / serviceHours, ordersPerHour: day.orders / serviceHours,
    timing, payments, abandoned, cancelled, doughs, ops, incidents, rejections, insights: [],
  };
  report.insights = paseInsights(report);
  return report;
}

const KIND_LABEL: Record<string, string> = {
  cremada: "cremada", equivocada: "equivocada", falta: "falta algun producte", retard: "retard", queixa: "queixa", altres: "altres",
};
const REASON_LABEL: Record<string, string> = {
  soldout: "masses exhaurides", no_slots: "cap franja lliure", too_late: "massa tard", slot_closed: "franja tancada",
};
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} i ${xs[xs.length - 1]}`;

function paseInsights(r: PaseReport): Insight[] {
  const out: Insight[] = [];
  if (r.rejections.total > 0) {
    const reasons = Object.entries(r.rejections.byReason).map(([k, v]) => `${REASON_LABEL[k] ?? k} ${v}`).join(", ");
    out.push({ level: "bad", title: `${plural(r.rejections.total, "client no ha pogut", "clients no han pogut")} demanar`, text: `${plural(r.rejections.pizzas, "pizza perduda", "pizzes perdudes")} (${reasons}).` });
  }
  if (r.incidents.total > 0) {
    const kinds = Object.entries(r.incidents.byKind).map(([k, v]) => `${v} ${KIND_LABEL[k] ?? k}`).join(", ");
    out.push({ level: "bad", title: plural(r.incidents.total, "incidència", "incidències"), text: `${kinds}. ${Math.round(r.incidents.accuracyPct ?? 100)} % de comandes sense cap problema.` });
  }
  if (r.ops.onTimePct !== null && !r.ops.approx && r.ops.onTimePct < TARGETS.onTimePct) {
    out.push({ level: "bad", title: `Només el ${Math.round(r.ops.onTimePct)} % ha arribat a temps`, text: `L'objectiu és ${TARGETS.onTimePct} % o més (com a molt ${TARGETS.onTimeGraceMin} min després de l'hora de la franja).` });
  }
  if (r.ops.rackMin !== null && r.ops.rackMin > TARGETS.rackMin) {
    out.push({ level: "warn", title: `Les pizzes esperen ${Math.round(r.ops.rackMin)} min abans de sortir`, text: `De «Llest» a «En repartiment». Per sobre de ${TARGETS.rackMin} min la pizza perd qualitat.` });
  }
  if (r.doughs.set && r.doughs.left === 0 && r.day.pizzas > 0) {
    out.push({ level: "warn", title: `S'han exhaurit les ${r.doughs.total} masses`, text: r.rejections.total ? "I hi ha hagut clients que no han pogut demanar. Val la pena fer-ne més un dia com aquest." : "Un dia com aquest, val la pena fer-ne alguna més." });
  } else if (r.doughs.left >= 5 && r.day.pizzas > 0) {
    out.push({ level: "info", title: `Han sobrat ${r.doughs.left} masses`, text: `${r.doughs.used} venudes de ${r.doughs.total}${r.doughs.set ? "" : " (número per defecte, no s'havia posat a cuina)"}.` });
  }
  if (r.fullSlots.length) {
    const disp = r.displaced ? ` ${plural(r.displaced, "client ha", "clients han")} hagut d'agafar una hora més tard.` : "";
    out.push({ level: "warn", title: `${plural(r.fullSlots.length, "franja plena", "franges plenes")}: ${list(r.fullSlots)}`, text: `${r.emptySlots.length ? `En canvi, ${list(r.emptySlots)} ${r.emptySlots.length === 1 ? "va quedar buida" : "van quedar buides"}.` : "Cap franja buida."}${disp}` });
  }
  if (r.abandoned.orders > 0) {
    out.push({ level: "warn", title: `${plural(r.abandoned.orders, "pagament amb targeta no completat", "pagaments amb targeta no completats")}`, text: `${plural(r.abandoned.pizzas, "pizza", "pizzes")} que no s'han venut. Pot ser gent que s'ho ha repensat o un problema amb el pagament.` });
  }
  const zero = r.products.filter((p) => p.qty === 0).map((p) => p.name);
  if (zero.length && r.day.pizzas > 0) {
    out.push({ level: "info", title: `${list(zero)}: cap venda`, text: "Candidates a promocionar o a canviar." });
  }
  if (r.prevSameDay && r.prevSameDay.pizzas > 0) {
    const g = ((r.day.pizzas - r.prevSameDay.pizzas) / r.prevSameDay.pizzas) * 100;
    if (g >= 15) out.push({ level: "good", title: `${Math.round(g)} % més pizzes que l'anterior ${dayName(r.date)}`, text: `${r.day.pizzas} davant de ${r.prevSameDay.pizzas}.` });
    if (g <= -15) out.push({ level: "warn", title: `${Math.round(-g)} % menys pizzes que l'anterior ${dayName(r.date)}`, text: `${r.day.pizzas} davant de ${r.prevSameDay.pizzas}.` });
  }
  if (r.day.orders >= 4 && r.day.returningPct >= 40) {
    out.push({ level: "good", title: `${Math.round(r.day.returningPct)} % de clients que repeteixen`, text: `${r.day.returning} de ${r.day.orders} comandes són de clients que ja havien demanat.` });
  }
  const order = { bad: 0, warn: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]).slice(0, 6);
}

// ── Resum setmanal (plantilla C) ────────────────────────────────────────
export interface WeeklyReport {
  weekDates: string[];               // pases d'aquesta setmana (dv + dg)
  week: { orders: number; pizzas: number; revenue: number; ticket: number; returningPct: number };
  prevWeek: { orders: number; pizzas: number; revenue: number; ticket: number; returningPct: number } | null;
  trend: DaySummary[];               // últims 8 pases
  friAvg: { pizzas: number; revenue: number } | null;
  sunAvg: { pizzas: number; revenue: number } | null;
  heat: { label: string; values: Record<string, number> }[];   // mitjana de pizzes per franja (dv / dg)
  ranking: { name: string; week: number; prevWeek: number; total: number }[];
  ops: { onTimePct: number | null; incidents: number; rejections: number; rejectedPizzas: number; leftover: number; doughsSet: boolean };
  insights: Insight[];
}

function aggregate(days: DaySummary[]) {
  const orders = sum(days.map((d) => d.orders)), pizzas = sum(days.map((d) => d.pizzas)), revenue = sum(days.map((d) => d.revenue));
  const returning = sum(days.map((d) => d.returning));
  return { orders, pizzas, revenue, ticket: orders ? revenue / orders : 0, returningPct: orders ? (returning / orders) * 100 : 0 };
}

// `date` és l'últim pase de la setmana (normalment el diumenge). La setmana
// és aquest dia i el divendres anterior.
export function buildWeeklyReport(input: ReportInput, summaries = daySummaries(input), dayReports: PaseReport[] = []): WeeklyReport {
  const date = input.date;
  const weekStart = addDays(date, -6);
  const withOrders = summaries.filter((s) => s.orders > 0);
  const weekDays = summaries.filter((s) => s.date >= weekStart && s.date <= date && (s.orders > 0 || s.date === date));
  const prevDays = withOrders.filter((s) => s.date >= addDays(weekStart, -7) && s.date < weekStart);
  const trend = withOrders.slice(-8);
  const avgOf = (days: DaySummary[]) => days.length ? { pizzas: sum(days.map((d) => d.pizzas)) / days.length, revenue: sum(days.map((d) => d.revenue)) / days.length } : null;
  const fri = trend.filter((s) => weekday(s.date) === 5), sun = trend.filter((s) => weekday(s.date) === 0);
  const heatRow = (label: string, days: DaySummary[]) => ({
    label, values: Object.fromEntries(SLOTS.map((sl) => [sl, days.length ? sum(days.map((d) => d.slots[sl] ?? 0)) / days.length : 0])),
  });
  const heat = [heatRow("Divendres", fri), heatRow("Diumenge", sun)].filter((_, i) => (i === 0 ? fri : sun).length);

  const names = new Set<string>();
  for (const s of trend) for (const n of Object.keys(s.products)) if (PIZZA_MENU.includes(n)) names.add(n);
  for (const n of PIZZA_MENU) if (!OFF_MENU.has(n)) names.add(n);
  const ranking = [...names].map((name) => ({
    name,
    week: sum(weekDays.map((d) => d.products[name] ?? 0)),
    prevWeek: sum(prevDays.map((d) => d.products[name] ?? 0)),
    total: sum(trend.map((d) => d.products[name] ?? 0)),
  })).sort((a, b) => b.week - a.week || b.total - a.total);

  const measuredOnTime = dayReports.filter((r) => r.ops.onTimePct !== null && !r.ops.approx);
  const lateTotal = sum(measuredOnTime.map((r) => sum(Object.values(r.ops.lateBuckets))));
  const ops = {
    onTimePct: lateTotal ? (sum(measuredOnTime.map((r) => r.ops.lateBuckets.onTime)) / lateTotal) * 100 : null,
    incidents: sum(dayReports.map((r) => r.incidents.total)),
    rejections: sum(dayReports.map((r) => r.rejections.total)),
    rejectedPizzas: sum(dayReports.map((r) => r.rejections.pizzas)),
    leftover: sum(dayReports.map((r) => r.doughs.left)),
    doughsSet: dayReports.length > 0 && dayReports.every((r) => r.doughs.set),
  };

  const report: WeeklyReport = {
    weekDates: weekDays.map((d) => d.date),
    week: aggregate(weekDays),
    prevWeek: prevDays.length ? aggregate(prevDays) : null,
    trend, friAvg: avgOf(fri), sunAvg: avgOf(sun), heat, ranking, ops, insights: [],
  };
  report.insights = weeklyInsights(report);
  return report;
}

function weeklyInsights(w: WeeklyReport): Insight[] {
  const out: Insight[] = [];
  if (w.prevWeek && w.prevWeek.pizzas > 0) {
    const g = ((w.week.pizzas - w.prevWeek.pizzas) / w.prevWeek.pizzas) * 100;
    out.push({
      level: g >= 0 ? "good" : "warn",
      title: `${g >= 0 ? "+" : "−"}${Math.abs(Math.round(g))} % de pizzes respecte a la setmana passada`,
      text: `${w.week.pizzas} aquesta setmana, ${w.prevWeek.pizzas} l'anterior.`,
    });
  }
  if (w.friAvg && w.sunAvg && w.friAvg.pizzas > 0) {
    const diff = ((w.sunAvg.pizzas - w.friAvg.pizzas) / w.friAvg.pizzas) * 100;
    if (Math.abs(diff) >= 10) {
      const best = diff > 0 ? "diumenge" : "divendres";
      out.push({ level: "info", title: `El ${best} ven un ${Math.abs(Math.round(diff))} % més`, text: `Mitjana: divendres ${round1(w.friAvg.pizzas)} pizzes, diumenge ${round1(w.sunAvg.pizzas)}. Té sentit preparar més masses el ${best}.` });
    }
  }
  const risers = w.ranking.filter((r) => r.week - r.prevWeek >= 3).sort((a, b) => (b.week - b.prevWeek) - (a.week - a.prevWeek));
  if (risers.length) out.push({ level: "good", title: `${risers[0].name} puja`, text: `${risers[0].week} aquesta setmana davant de ${risers[0].prevWeek} la passada.` });
  const fallers = w.ranking.filter((r) => r.prevWeek - r.week >= 3).sort((a, b) => (b.prevWeek - b.week) - (a.prevWeek - a.week));
  if (fallers.length) out.push({ level: "warn", title: `${fallers[0].name} baixa`, text: `${fallers[0].week} aquesta setmana davant de ${fallers[0].prevWeek} la passada.` });
  let hot: { label: string; slot: string; v: number } | null = null;
  for (const row of w.heat) for (const [slot, v] of Object.entries(row.values)) if (!hot || v > hot.v) hot = { label: row.label, slot, v };
  if (hot && hot.v > 0) out.push({ level: "info", title: `Franja més forta: ${hot.label.toLowerCase()} a les ${hot.slot}`, text: `${round1(hot.v)} pizzes de mitjana (el forn n'admet ${SLOT_CAPACITY}).` });
  if (w.ops.rejections > 0) out.push({ level: "bad", title: `${plural(w.ops.rejections, "client no ha pogut", "clients no han pogut")} demanar`, text: `${plural(w.ops.rejectedPizzas, "pizza perduda", "pizzes perdudes")} aquesta setmana.` });
  const order = { bad: 0, warn: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]).slice(0, 5);
}

// ── Noms en català ──────────────────────────────────────────────────────
const DAYS = ["diumenge", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte"];
const DAYS_SHORT = ["dg", "dl", "dt", "dc", "dj", "dv", "ds"];
const MONTHS = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"];
export const dayName = (iso: string) => DAYS[weekday(iso)];
export const dayShort = (iso: string) => DAYS_SHORT[weekday(iso)];
export function monthOf(iso: string): string {
  const m = MONTHS[Number(iso.slice(5, 7)) - 1];
  return /^[aeiou]/.test(m) ? `d'${m}` : `de ${m}`;
}
// "Divendres 2 d'octubre"
export function longDate(iso: string): string {
  const s = `${dayName(iso)} ${Number(iso.slice(8, 10))} ${monthOf(iso)}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// "dv. 25/9"
export const shortDate = (iso: string) => `${dayShort(iso)}. ${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
