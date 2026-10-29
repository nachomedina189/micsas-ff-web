// Plantilles HTML dels correus de l'informe del pase (B: informe complet
// del pase; C: resum setmanal). Estil "dashboard" fosc. Tot es fa amb
// taules i estils en línia, sense imatges ni JavaScript, perquè els
// gràfics es vegin igual a Gmail, Apple Mail i al mòbil.

import {
  SLOTS, SLOT_CAPACITY, TARGETS, longDate, shortDate, dayShort, dayName, plural,
  type PaseReport, type WeeklyReport, type Insight,
} from "./pase-metrics.ts";

const C = {
  bg: "#09090B", card: "#131316", tile: "#1A1A1E", border: "#27272C", head: "#1F1F23",
  text: "#F4F4F5", muted: "#9A9AA3", faint: "#62626B",
  bar: "#3F3F46", barHi: "#E4E4E7", track: "#26262B",
  green: "#34D399", greenBg: "#0E2A1F", greenBd: "#14532D",
  red: "#F87171", redBg: "#2B1314", redBd: "#7F1D1D",
  amber: "#FBBF24", amberBg: "#2A200B", amberBd: "#78350F",
  brand: "#E23F2E",
};
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

// ── Format ──────────────────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number, d = 0) => n.toFixed(d).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const euro = (n: number, d = 0) => `${num(n, d)} €`;
const mins = (n: number | null) => n === null ? "–" : `${num(n, n < 10 ? 1 : 0)} min`;
const hhmm = (iso: string | null) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ca-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
};

// ── Peces ───────────────────────────────────────────────────────────────
const td = (style: string, inner: string, attrs = "") => `<td ${attrs} style="font-family:${FONT};${style}">${inner}</td>`;
const table = (inner: string, style = "", attrs = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ${attrs} style="border-collapse:separate;${style}">${inner}</table>`;
const spacer = (h: number) => `<tr><td height="${h}" style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</td></tr>`;

function pill(text: string, tone: "good" | "bad" | "warn" | "neutral"): string {
  const t = {
    good: [C.green, C.greenBg, C.greenBd], bad: [C.red, C.redBg, C.redBd],
    warn: [C.amber, C.amberBg, C.amberBd], neutral: [C.muted, C.tile, C.border],
  }[tone];
  return `<span style="display:inline-block;padding:3px 8px;border-radius:6px;border:1px solid ${t[2]};background:${t[1]};color:${t[0]};font-family:${FONT};font-size:11px;font-weight:600;line-height:1.4;">${text}</span>`;
}

// Fletxa i % de canvi. `invert` = baixar és bo (p. ex. temps).
function delta(cur: number, prev: number | null | undefined, opts: { unit?: "pct" | "abs"; invert?: boolean; d?: number; suffix?: string } = {}): string {
  if (prev === null || prev === undefined || (opts.unit !== "abs" && prev === 0)) return "";
  const diff = cur - prev;
  if (Math.abs(diff) < 1e-9) return `<span style="color:${C.muted};font-size:12px;font-weight:600;">= 0</span>`;
  const up = diff > 0;
  const good = opts.invert ? !up : up;
  const v = opts.unit === "abs" ? `${num(Math.abs(diff), opts.d ?? 0)}${opts.suffix ?? ""}` : `${num(Math.abs(diff / prev) * 100, 0)} %`;
  return `<span style="color:${good ? C.green : C.red};font-size:12px;font-weight:600;white-space:nowrap;">${up ? "▲" : "▼"} ${v}</span>`;
}

function card(title: string, subtitle: string, body: string, right = ""): string {
  return `<tr><td style="padding:0 0 16px;">${table(`
    <tr>${td(`padding:20px 20px 0;`, `
      ${table(`<tr>
        ${td("vertical-align:top;", `<div style="color:${C.text};font-size:15px;font-weight:700;line-height:1.3;">${title}</div>${subtitle ? `<div style="color:${C.muted};font-size:12px;line-height:1.5;margin-top:2px;">${subtitle}</div>` : ""}`)}
        ${right ? td("vertical-align:top;text-align:right;white-space:nowrap;", right, 'align="right"') : ""}
      </tr>`)}`)}</tr>
    <tr>${td("padding:16px 20px 20px;", body)}</tr>
  `, `background:${C.card};border:1px solid ${C.border};border-radius:14px;`, `bgcolor="${C.card}"`)}</td></tr>`;
}

// Rajola de KPI: etiqueta, valor gran, canvi i comparació.
function kpi(label: string, value: string, change: string, foot: string): string {
  return table(`<tr>${td(`padding:14px 14px 13px;`, `
    <div style="color:${C.muted};font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;">${label}</div>
    <div style="color:${C.text};font-size:24px;font-weight:700;line-height:1.2;margin-top:6px;">${value}</div>
    <div style="margin-top:6px;line-height:1.3;">${change || `<span style="color:${C.faint};font-size:12px;">–</span>`}${foot ? ` <span style="color:${C.faint};font-size:11px;">${foot}</span>` : ""}</div>
  `)}</tr>`, `background:${C.card};border:1px solid ${C.border};border-radius:12px;`, `bgcolor="${C.card}"`);
}

function grid2(cells: string[]): string {
  let rows = "";
  for (let i = 0; i < cells.length; i += 2) {
    rows += `<tr>
      <td width="50%" valign="top" style="padding:0 6px 12px 0;">${cells[i]}</td>
      <td width="50%" valign="top" style="padding:0 0 12px 6px;">${cells[i + 1] ?? ""}</td>
    </tr>`;
  }
  return table(rows);
}

// Gràfic de barres verticals. `hi` marca les barres destacades.
function vbars(cols: { label: string; value: number; display?: string; hi?: boolean }[], maxH = 110, maxV?: number): string {
  const max = maxV ?? Math.max(1, ...cols.map((c) => c.value));
  const cells = cols.map((c) => {
    const h = Math.round((c.value / max) * maxH);
    const bar = h > 0
      ? `<table role="presentation" width="70%" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td height="${h}" bgcolor="${c.hi ? C.barHi : C.bar}" style="height:${h}px;line-height:${h}px;font-size:0;background:${c.hi ? C.barHi : C.bar};border-radius:4px 4px 0 0;">&nbsp;</td></tr></table>`
      : "";
    return `<td valign="bottom" align="center" style="padding:0 2px;vertical-align:bottom;height:${maxH + 18}px;">
      <div style="font-family:${FONT};font-size:11px;font-weight:600;color:${c.value ? C.text : C.faint};line-height:16px;">${c.display ?? num(c.value)}</div>${bar}</td>`;
  }).join("");
  const labels = cols.map((c) => `<td align="center" style="font-family:${FONT};padding:6px 1px 0;font-size:10px;color:${C.muted};white-space:nowrap;">${c.label}</td>`).join("");
  return table(`<tr>${cells}</tr><tr><td colspan="${cols.length}" height="1" bgcolor="${C.border}" style="height:1px;line-height:1px;font-size:0;background:${C.border};">&nbsp;</td></tr><tr>${labels}</tr>`, "table-layout:fixed;");
}

// Barra horitzontal de progrés (com "Top channels").
function hbar(pct: number, color = C.barHi): string {
  const p = Math.max(0, Math.min(100, pct));
  const fill = p > 0 ? `<td width="${p.toFixed(1)}%" height="8" bgcolor="${color}" style="height:8px;line-height:8px;font-size:0;background:${color};border-radius:4px;">&nbsp;</td>` : "";
  const rest = p < 100 ? `<td height="8" style="height:8px;line-height:8px;font-size:0;">&nbsp;</td>` : "";
  return table(`<tr>${fill}${rest}</tr>`, `background:${C.track};border-radius:4px;`, `bgcolor="${C.track}"`);
}

function barRow(label: string, value: string, pct: number, color?: string): string {
  return `<tr><td style="padding:0 0 12px;">${table(`
    <tr>${td(`color:${C.text};font-size:13px;padding-bottom:6px;`, `<span style="color:${color ?? C.barHi};font-size:10px;">●</span>&nbsp; ${label}`)}${td(`color:${C.muted};font-size:13px;text-align:right;padding-bottom:6px;white-space:nowrap;`, value, 'align="right"')}</tr>
    <tr><td colspan="2">${hbar(pct, color)}</td></tr>`)}</td></tr>`;
}

// Barra apilada (parts d'un total) amb llegenda a sota.
function stacked(parts: { label: string; value: number; color: string; text?: string }[]): string {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const segs = parts.filter((p) => p.value > 0).map((p, i, arr) =>
    `<td width="${((p.value / total) * 100).toFixed(1)}%" height="24" bgcolor="${p.color}" style="height:24px;background:${p.color};font-family:${FONT};font-size:11px;font-weight:700;color:${p.text ?? C.bg};padding-left:7px;${i === 0 ? "border-radius:6px 0 0 6px;" : ""}${i === arr.length - 1 ? "border-radius:0 6px 6px 0;" : `border-right:2px solid ${C.card};`}white-space:nowrap;overflow:hidden;">${p.value}</td>`).join("");
  const legend = parts.map((p) => `<span style="display:inline-block;margin:8px 14px 0 0;font-family:${FONT};font-size:12px;color:${C.muted};white-space:nowrap;"><span style="color:${p.color};">■</span> ${p.label} <b style="color:${C.text};font-weight:600;">${p.value}</b></span>`).join("");
  return `${table(`<tr>${segs}</tr>`, "table-layout:fixed;")}<div>${legend}</div>`;
}

// Rajola petita amb objectiu (temps d'operació).
function opTile(label: string, value: string, target: string, tone: "good" | "bad" | "warn" | "neutral"): string {
  return table(`<tr>${td("padding:14px;", `
    <div style="color:${C.muted};font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;">${label}</div>
    <div style="color:${C.text};font-size:22px;font-weight:700;line-height:1.2;margin:6px 0 8px;">${value}</div>
    ${pill(target, tone)}`)}</tr>`, `background:${C.tile};border:1px solid ${C.border};border-radius:12px;`, `bgcolor="${C.tile}"`);
}

function insightsList(items: Insight[]): string {
  if (!items.length) return `<div style="font-family:${FONT};color:${C.muted};font-size:13px;">Res destacable.</div>`;
  const color = { bad: C.red, warn: C.amber, good: C.green, info: C.muted };
  return table(items.map((it, i) => `<tr>
    <td width="14" valign="top" style="padding:${i ? 12 : 0}px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${color[it.level]};">●</td>
    ${td(`padding:${i ? 12 : 0}px 0 0 6px;font-size:13px;line-height:1.5;color:${C.muted};`, `<b style="color:${C.text};font-weight:600;">${esc(it.title)}</b><br>${esc(it.text)}`)}
  </tr>`).join(""));
}

// `wide: true` = columna que s'amaga en pantalles petites (només la barra).
function dataTable(headers: { label: string; align?: "left" | "right"; wide?: boolean }[], rows: string[][], dimRows: number[] = []): string {
  const pad = (i: number, n: number, v: number) => `${v}px ${i === n - 1 ? 20 : 8}px ${v}px ${i === 0 ? 20 : 8}px`;
  const cls = (i: number) => {
    const c = [i === 0 ? "first" : "", i === headers.length - 1 ? "last" : "", headers[i].wide ? "hide-sm" : ""].filter(Boolean).join(" ");
    return c ? ` class="${c}"` : "";
  };
  const th = headers.map((h, i) => `<td${cls(i)} align="${h.align ?? "left"}" style="font-family:${FONT};padding:${pad(i, headers.length, 10)};font-size:12px;font-weight:600;color:${C.muted};background:${C.head};" bgcolor="${C.head}">${h.label}</td>`).join("");
  const body = rows.map((r, ri) => `<tr>${r.map((cell, i) => `<td${cls(i)} align="${headers[i].align ?? "left"}" style="font-family:${FONT};padding:${pad(i, r.length, 11)};font-size:13px;color:${dimRows.includes(ri) ? C.faint : C.text};border-top:1px solid ${C.border};${i === 0 ? "" : "white-space:nowrap;"}">${cell}</td>`).join("")}</tr>`).join("");
  return table(`<tr>${th}</tr>${body}`);
}

function shell(opts: { preheader: string; eyebrow: string; title: string; subtitle: string; badge: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @media only screen and (max-width: 480px) {
    .hide-sm { display: none !important; }
    .first { padding-left: 14px !important; }
    .last { padding-right: 14px !important; }
    .wrap { padding-left: 4px !important; padding-right: 4px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};" bgcolor="${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td class="wrap" align="center" style="padding:28px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;">
  <tr><td style="padding:0 4px 22px;">
    ${table(`<tr>
      ${td("vertical-align:bottom;", `
        <div style="color:${C.muted};font-size:12px;font-weight:600;letter-spacing:.04em;">micsas<span style="color:${C.brand};">.</span>ff &nbsp;·&nbsp; ${esc(opts.eyebrow)}</div>
        <div style="color:${C.text};font-size:28px;font-weight:700;line-height:1.15;margin-top:8px;">${esc(opts.title)}</div>
        <div style="color:${C.muted};font-size:13px;margin-top:4px;">${esc(opts.subtitle)}</div>`)}
      ${td("vertical-align:bottom;text-align:right;white-space:nowrap;padding-left:12px;", opts.badge, 'align="right"')}
    </tr>`)}
  </td></tr>
  <tr><td height="1" bgcolor="${C.border}" style="height:1px;line-height:1px;font-size:0;background:${C.border};">&nbsp;</td></tr>
  ${spacer(20)}
  ${opts.body}
  <tr><td style="padding:8px 4px 0;font-family:${FONT};font-size:11px;line-height:1.6;color:${C.faint};text-align:center;">${opts.footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const toneFor = (v: number | null, target: number, lowerIsBetter = true): "good" | "warn" | "bad" | "neutral" => {
  if (v === null) return "neutral";
  const ok = lowerIsBetter ? v <= target : v >= target;
  if (ok) return "good";
  const far = lowerIsBetter ? v > target * 1.5 : v < target * 0.8;
  return far ? "bad" : "warn";
};

// ── Plantilla B: informe complet del pase ───────────────────────────────
export function paseEmailSubject(r: PaseReport): string {
  return `Informe del pase · ${longDate(r.date)} · ${plural(r.day.pizzas, "pizza", "pizzes")}`;
}

export function renderPaseEmail(r: PaseReport): string {
  const d = r.day, p = r.prevSameDay, a = r.avg4;
  const vs = p ? `vs ${shortDate(p.date)}` : "";

  const kpis = grid2([
    kpi("Pizzes", num(d.pizzas), delta(d.pizzas, p?.pizzas), vs),
    kpi("Facturació", euro(d.revenue), delta(d.revenue, p?.revenue), vs),
    kpi("Comandes", num(d.orders), delta(d.orders, p?.orders), vs),
    kpi("Tiquet mitjà", euro(d.ticket, 2), delta(d.ticket, p?.ticket), vs),
  ]);

  // Comparativa
  const cmpRow = (label: string, cur: string, prev: string, avg: string) => [label, cur, prev, avg];
  const compare = dataTable(
    [{ label: "" }, { label: "Aquest pase", align: "right" }, { label: p ? shortDate(p.date) : "Anterior", align: "right" }, { label: "Mitjana 4", align: "right" }],
    [
      cmpRow("Pizzes", `<b>${num(d.pizzas)}</b>`, p ? num(p.pizzas) : "–", a ? num(a.pizzas, 1) : "–"),
      cmpRow("Facturació", `<b>${euro(d.revenue)}</b>`, p ? euro(p.revenue) : "–", a ? euro(a.revenue) : "–"),
      cmpRow("Comandes", `<b>${num(d.orders)}</b>`, p ? num(p.orders) : "–", a ? num(a.orders, 1) : "–"),
      cmpRow("Pizzes per comanda", `<b>${num(d.pizzasPerOrder, 1)}</b>`, p ? num(p.pizzasPerOrder, 1) : "–", a ? num(a.pizzasPerOrder, 1) : "–"),
      cmpRow("Propines", `<b>${euro(d.tips)}</b>`, p ? euro(p.tips) : "–", a ? euro(a.tips) : "–"),
    ],
  );

  // Hores punta
  const slotCols = SLOTS.map((s) => ({ label: s.endsWith(":00") ? s : s.slice(2), value: d.slots[s] ?? 0, hi: (d.slots[s] ?? 0) >= SLOT_CAPACITY }));
  const peak = r.peakHour && r.peakHour.pizzas > 0 ? pill(`Punta ${r.peakHour.from}–${r.peakHour.to} · ${r.peakHour.pizzas} pizzes`, "neutral") : "";
  const slotsBody = `${vbars(slotCols, 110, SLOT_CAPACITY)}
    <div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:10px;">
      <span style="color:${C.barHi};">■</span> Franja plena (${SLOT_CAPACITY} pizzes) &nbsp; <span style="color:${C.bar};">■</span> Amb lloc
      ${r.displaced ? ` &nbsp;·&nbsp; ${plural(r.displaced, "client desplaçat", "clients desplaçats")} a una franja posterior` : ""}
    </div>`;

  // Operació
  const o = r.ops;
  const noTimes = o.measured === 0;
  const opsBody = noTimes
    ? `<div style="font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted};">Encara no hi ha hores de cada estat per a aquest pase. Es comencen a guardar a partir del primer pase amb aquesta versió de cuina.</div>`
    : `${grid2([
        opTile("Temps de cuina", mins(o.kitchenMin), `Objectiu < ${TARGETS.kitchenMin} min`, toneFor(o.kitchenMin, TARGETS.kitchenMin)),
        opTile("Espera abans de sortir", mins(o.rackMin), `Objectiu < ${TARGETS.rackMin} min`, toneFor(o.rackMin, TARGETS.rackMin)),
        opTile("Temps de ruta", mins(o.routeMin), `Objectiu < ${TARGETS.routeMin} min`, toneFor(o.routeMin, TARGETS.routeMin)),
        opTile("Entregues a temps", o.onTimePct === null ? "–" : `${num(o.onTimePct)} %`, `Objectiu ≥ ${TARGETS.onTimePct} %`, toneFor(o.onTimePct, TARGETS.onTimePct, false)),
      ])}
      <div style="font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};">Medianes. Cuina: de «Preparant» a «Llest». Espera: de «Llest» a «En repartiment». Ruta: fins a «Entregat».</div>`;

  const punctBody = (() => {
    const b = o.lateBuckets, tot = b.onTime + b.m15_30 + b.m30_45 + b.over45;
    if (!tot) return "";
    const rows = [
      barRow(`A temps (≤ ${TARGETS.onTimeGraceMin} min)`, `${b.onTime}`, (b.onTime / tot) * 100, C.green),
      barRow("15–30 min tard", `${b.m15_30}`, (b.m15_30 / tot) * 100, C.amber),
      barRow("30–45 min tard", `${b.m30_45}`, (b.m30_45 / tot) * 100, C.red),
      barRow("Més de 45 min", `${b.over45}`, (b.over45 / tot) * 100, C.red),
    ].join("");
    const note = o.approx ? `Aproximat: per a algunes comandes només hi ha l'hora de l'últim canvi d'estat. ` : "";
    return card("Puntualitat", `Hora d'entrega respecte a l'hora de la franja`, `${table(rows)}<div style="font-family:${FONT};font-size:12px;color:${C.muted};">${note}Retard mitjà: ${mins(o.avgLateMin)}.</div>`,
      o.onTimePct !== null ? pill(`${num(o.onTimePct)} % a temps`, toneFor(o.onTimePct, TARGETS.onTimePct, false)) : "");
  })();

  const logistics = grid2([
    opTile("Viatges", o.trips ? num(o.trips) : "–", o.ordersPerTrip ? `${num(o.ordersPerTrip, 1)} comandes per viatge` : "Sense dades", "neutral"),
    opTile("Durada del viatge", mins(o.tripMin), "Sortida → última entrega", "neutral"),
    opTile("Pizzes per hora", num(r.pizzasPerHour, 1), r.peakHour ? `Punta: ${r.peakHour.pizzas} en una hora` : "", "neutral"),
    opTile("Comandes per hora", num(r.ordersPerHour, 1), `${num(d.orders)} en tot el pase`, "neutral"),
  ]);

  // Masses
  const dPct = r.doughs.total ? (r.doughs.used / r.doughs.total) * 100 : 0;
  const doughsBody = `${table(`<tr>
      ${td(`color:${C.text};font-size:22px;font-weight:700;`, `${num(r.doughs.used)} <span style="color:${C.muted};font-size:14px;font-weight:400;">de ${num(r.doughs.total)} masses</span>`)}
      ${td(`text-align:right;`, r.doughs.left === 0 ? pill("Exhaurides", "warn") : pill(`Sobren ${r.doughs.left}`, r.doughs.left >= 5 ? "warn" : "good"), 'align="right"')}
    </tr>`)}
    <div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>${hbar(dPct)}
    ${r.doughs.set ? "" : `<div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:8px;">No s'havia posat el número a cuina: es compten les ${r.doughs.total} per defecte.</div>`}`;

  // Pizzes
  const maxQty = Math.max(1, ...r.products.map((x) => x.qty));
  const prodRows = r.products.map((x) => [
    esc(x.name),
    `<b>${x.qty}</b>`,
    euro(x.revenue),
    `<table role="presentation" width="90" cellpadding="0" cellspacing="0" border="0" style="width:90px;"><tr><td>${hbar((x.qty / maxQty) * 100)}</td></tr></table>`,
    x.prev === null ? "–" : delta(x.qty, x.prev, { unit: "abs" }) || `<span style="color:${C.faint};font-size:12px;">=</span>`,
  ]);
  const zeroRows = r.products.map((x, i) => (x.qty === 0 ? i : -1)).filter((i) => i >= 0);
  const prodTable = dataTable(
    [{ label: "Pizza" }, { label: "Unitats", align: "right" }, { label: "Import", align: "right" }, { label: "", wide: true }, { label: p ? `vs ${shortDate(p.date)}` : "", align: "right" }],
    prodRows, zeroRows,
  );

  // Clients
  const t = r.timing;
  const customersBody = `
    <div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-bottom:8px;">Quan s'han demanat les pizzes</div>
    ${stacked([
      { label: "Dies abans", value: t.before, color: "#71717A" },
      { label: "Abans de les 18 h", value: t.morning, color: "#A1A1AA" },
      { label: "18–20 h", value: t.evening, color: C.amber },
      { label: "Durant el pase", value: t.during, color: C.brand, text: C.text },
    ])}
    <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
    ${table(`
      ${barRow("Clients que repeteixen", `${d.returning} de ${d.orders} · ${num(d.returningPct)} %`, d.returningPct)}
      ${barRow("Pagament amb targeta", `${r.payments.card} de ${d.orders}`, d.orders ? (r.payments.card / d.orders) * 100 : 0)}
      ${barRow("Efectiu", `${r.payments.cash} de ${d.orders}`, d.orders ? (r.payments.cash / d.orders) * 100 : 0)}
    `)}`;

  // Pèrdues i incidències
  const lossRows: string[][] = [
    ["Clients que no han pogut demanar", r.rejections.total ? `<b style="color:${C.red};">${r.rejections.total}</b> · ${plural(r.rejections.pizzas, "pizza", "pizzes")}` : "0"],
    ["Pagaments amb targeta no completats", r.abandoned.orders ? `<b style="color:${C.amber};">${r.abandoned.orders}</b> · ${plural(r.abandoned.pizzas, "pizza", "pizzes")}` : "0"],
    ["Comandes cancel·lades", `${r.cancelled}`],
    ["Incidències (cremades, equivocades…)", r.incidents.total ? `<b style="color:${C.red};">${r.incidents.total}</b>` : "0"],
    ["Comandes sense cap problema", r.incidents.accuracyPct === null ? "–" : `${num(r.incidents.accuracyPct)} %`],
  ];
  const lossTable = dataTable([{ label: "Indicador" }, { label: "Pase", align: "right" }], lossRows);

  const body = [
    `<tr><td style="padding:0 0 4px;">${kpis}</td></tr>`,
    card("Per decidir", "Avisos automàtics d'aquest pase", insightsList(r.insights)),
    card("Hores punta", `Pizzes per franja de 15 minuts · el forn n'admet ${SLOT_CAPACITY}`, slotsBody, peak),
    card("Masses", "Venudes respecte a les masses fetes", doughsBody),
    card("Temps d'operació", "Velocitat de cuina i repartiment", opsBody),
    punctBody,
    card("Logística i ritme", "Sortides del repartidor i producció per hora", logistics),
    `<tr><td style="padding:0 0 16px;">${table(`<tr>${td("padding:20px 20px 14px;", `<div style="color:${C.text};font-size:15px;font-weight:700;">Pizzes</div><div style="color:${C.muted};font-size:12px;margin-top:2px;">${plural(d.pizzas, "pizza", "pizzes")}${r.drinks ? ` · ${plural(r.drinks, "beguda", "begudes")}` : ""}</div>`)}</tr><tr><td>${prodTable}</td></tr>`, `background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;`, `bgcolor="${C.card}"`)}</td></tr>`,
    card("Clients", "Quan demanen, qui repeteix i com paguen", customersBody),
    `<tr><td style="padding:0 0 16px;">${table(`<tr>${td("padding:20px 20px 14px;", `<div style="color:${C.text};font-size:15px;font-weight:700;">Pèrdues i qualitat</div><div style="color:${C.muted};font-size:12px;margin-top:2px;">El que no s'ha venut o ha sortit malament</div>`)}</tr><tr><td>${lossTable}</td></tr>`, `background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;`, `bgcolor="${C.card}"`)}</td></tr>`,
    card("Comparativa", "", compare),
  ].join("");

  return shell({
    preheader: `${plural(d.pizzas, "pizza", "pizzes")}, ${euro(d.revenue)}, ${plural(d.orders, "comanda", "comandes")}.`,
    eyebrow: "Informe del pase",
    title: longDate(r.date),
    subtitle: `Pase de ${SLOTS[0]} a ${SLOTS[SLOTS.length - 1]}${p ? ` · comparat amb el ${dayName(p.date)} ${shortDate(p.date).split(" ")[1]}` : ""}`,
    badge: r.closedAt ? pill(`Tancat ${hhmm(r.closedAt)}`, "neutral") : "",
    body,
    footer: "Informe automàtic enviat en prémer «Tancar pase» a cuina.<br>Només compta les comandes fetes per la web.",
  });
}

// ── Plantilla C: resum setmanal ─────────────────────────────────────────
export function weeklyEmailSubject(w: WeeklyReport): string {
  return `Resum setmanal · ${w.weekDates.map(shortDate).join(" i ")} · ${plural(w.week.pizzas, "pizza", "pizzes")}`;
}

export function renderWeeklyEmail(w: WeeklyReport): string {
  const k = w.week, pw = w.prevWeek;
  const kpis = grid2([
    kpi("Pizzes", num(k.pizzas), delta(k.pizzas, pw?.pizzas), pw ? "vs setmana passada" : ""),
    kpi("Facturació", euro(k.revenue), delta(k.revenue, pw?.revenue), pw ? "vs setmana passada" : ""),
    kpi("Comandes", num(k.orders), delta(k.orders, pw?.orders), pw ? "vs setmana passada" : ""),
    kpi("Clients que repeteixen", `${num(k.returningPct)} %`, delta(k.returningPct, pw?.returningPct, { unit: "abs", suffix: " pts" }), pw ? "vs setmana passada" : ""),
  ]);

  const lastDate = w.trend[w.trend.length - 1]?.date;
  const trendBody = `${vbars(w.trend.map((s) => ({ label: `${dayShort(s.date)} ${Number(s.date.slice(8, 10))}/${Number(s.date.slice(5, 7))}`, value: s.pizzas, hi: w.weekDates.includes(s.date) })), 120)}
    <div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:10px;"><span style="color:${C.barHi};">■</span> Aquesta setmana &nbsp; <span style="color:${C.bar};">■</span> Setmanes anteriors</div>`;

  const dayCompare = grid2([
    opTile("Mitjana divendres", w.friAvg ? `${num(w.friAvg.pizzas, 1)} pizzes` : "–", w.friAvg ? `${euro(w.friAvg.revenue)} per pase` : "Sense dades", "neutral"),
    opTile("Mitjana diumenge", w.sunAvg ? `${num(w.sunAvg.pizzas, 1)} pizzes` : "–", w.sunAvg ? `${euro(w.sunAvg.revenue)} per pase` : "Sense dades", "neutral"),
  ]);

  // Mapa de calor: com més pizzes de mitjana, més clara la casella.
  const heatMax = Math.max(1, ...w.heat.flatMap((r) => Object.values(r.values)));
  const shade = (v: number) => {
    const t = v / heatMax;
    const from = [26, 26, 30], to = [228, 228, 231];
    const c = from.map((f, i) => Math.round(f + (to[i] - f) * t));
    return { bg: `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`, fg: t > 0.55 ? C.bg : C.text };
  };
  const heatRows = w.heat.map((row) => `<tr>
    <td style="font-family:${FONT};font-size:11px;color:${C.muted};padding:0 8px 0 0;white-space:nowrap;">${row.label.slice(0, 3)}.</td>
    ${SLOTS.map((s) => { const v = row.values[s] ?? 0; const sh = shade(v); return `<td align="center" bgcolor="${sh.bg}" style="background:${sh.bg};color:${sh.fg};font-family:${FONT};font-size:11px;font-weight:600;height:34px;border:2px solid ${C.card};border-radius:6px;">${v ? num(v, 1) : ""}</td>`; }).join("")}
  </tr>`).join("");
  const heatLabels = `<tr><td></td>${SLOTS.map((s) => `<td align="center" style="font-family:${FONT};font-size:10px;color:${C.muted};padding-top:4px;">${s.endsWith(":00") ? s : s.slice(2)}</td>`).join("")}</tr>`;
  const heatBody = w.heat.length ? table(heatRows + heatLabels, "table-layout:fixed;") : `<div style="font-family:${FONT};color:${C.muted};font-size:13px;">Sense dades.</div>`;

  const maxW = Math.max(1, ...w.ranking.map((x) => x.week));
  const rankRows = w.ranking.map((x) => [
    esc(x.name),
    `<b>${x.week}</b>`,
    `<table role="presentation" width="90" cellpadding="0" cellspacing="0" border="0" style="width:90px;"><tr><td>${hbar((x.week / maxW) * 100)}</td></tr></table>`,
    pw ? (delta(x.week, x.prevWeek, { unit: "abs" }) || `<span style="color:${C.faint};font-size:12px;">=</span>`) : "–",
    `${x.total}`,
  ]);
  const rankTable = dataTable(
    [{ label: "Pizza" }, { label: "Setmana", align: "right" }, { label: "", wide: true }, { label: "vs anterior", align: "right" }, { label: `Últims ${w.trend.length}`, align: "right" }],
    rankRows, w.ranking.map((x, i) => (x.week === 0 ? i : -1)).filter((i) => i >= 0),
  );

  const retBody = vbars(w.trend.map((s) => ({ label: `${dayShort(s.date)} ${Number(s.date.slice(8, 10))}`, value: Math.round(s.returningPct), display: `${Math.round(s.returningPct)}%`, hi: s.date === lastDate })), 70, 100);

  const opsWeek = grid2([
    opTile("Entregues a temps", w.ops.onTimePct === null ? "–" : `${num(w.ops.onTimePct)} %`, `Objectiu ≥ ${TARGETS.onTimePct} %`, toneFor(w.ops.onTimePct, TARGETS.onTimePct, false)),
    opTile("Incidències", num(w.ops.incidents), w.ops.incidents ? "Revisa l'informe de cada pase" : "Cap", w.ops.incidents ? "bad" : "good"),
    opTile("Clients sense poder demanar", num(w.ops.rejections), w.ops.rejections ? `${plural(w.ops.rejectedPizzas, "pizza perduda", "pizzes perdudes")}` : "Cap", w.ops.rejections ? "bad" : "good"),
    opTile("Masses sobrants", num(w.ops.leftover), w.ops.doughsSet ? "Suma dels pases" : "Algun dia amb número per defecte", w.ops.leftover >= 10 ? "warn" : "neutral"),
  ]);

  const body = [
    `<tr><td style="padding:0 0 4px;">${kpis}</td></tr>`,
    card("Aquesta setmana", "Avisos automàtics", insightsList(w.insights)),
    card("Pizzes per pase", `Últims ${w.trend.length} pases`, trendBody),
    card("Divendres o diumenge", `Mitjana dels últims ${w.trend.length} pases`, dayCompare),
    card("Mapa de calor de franges", "Pizzes de mitjana per franja de 15 minuts", heatBody),
    `<tr><td style="padding:0 0 16px;">${table(`<tr>${td("padding:20px 20px 14px;", `<div style="color:${C.text};font-size:15px;font-weight:700;">Rànquing de pizzes</div><div style="color:${C.muted};font-size:12px;margin-top:2px;">Unitats d'aquesta setmana i dels últims ${w.trend.length} pases</div>`)}</tr><tr><td>${rankTable}</td></tr>`, `background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;`, `bgcolor="${C.card}"`)}</td></tr>`,
    card("Clients que repeteixen", "% de comandes de clients que ja havien demanat abans", retBody),
    card("Operació de la setmana", "", opsWeek),
  ].join("");

  const range = w.weekDates.length ? `${longDate(w.weekDates[0])}${w.weekDates.length > 1 ? ` i ${longDate(w.weekDates[w.weekDates.length - 1]).toLowerCase()}` : ""}` : "";
  return shell({
    preheader: `${plural(k.pizzas, "pizza", "pizzes")} i ${euro(k.revenue)} aquesta setmana.`,
    eyebrow: "Resum setmanal",
    title: "Resum de la setmana",
    subtitle: range,
    badge: pw ? pill(`${k.pizzas >= pw.pizzas ? "+" : "−"}${num(Math.abs(pw.pizzas ? ((k.pizzas - pw.pizzas) / pw.pizzas) * 100 : 0))} % pizzes`, k.pizzas >= pw.pizzas ? "good" : "bad") : "",
    body,
    footer: "S'envia amb l'informe del diumenge, en prémer «Tancar pase» a cuina.<br>Només compta les comandes fetes per la web.",
  });
}
