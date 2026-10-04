import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  addDays, buildPaseReport, buildWeeklyReport, daySummaries, weekday,
  type IncidentRow, type ItemRow, type OrderRow, type RejectionRow, type ReportInput, type StatusEventRow,
} from "../_shared/pase-metrics.ts";
import { paseEmailSubject, renderPaseEmail, renderWeeklyEmail, weeklyEmailSubject } from "../_shared/pase-email.ts";

// Informe del pase. cocina.html la crida quan el pizzero prem "Tancar pase":
// calcula els indicadors del dia i envia l'informe complet (plantilla B)
// al correu de Micsas. Si el pase és de diumenge, envia també el resum
// setmanal (plantilla C) amb el divendres i el diumenge.
//
// Només la pot fer servir el personal de cuina (taula staff). Cos:
//   { deliveryDate?: "YYYY-MM-DD", force?: boolean, preview?: boolean }
// - Sense deliveryDate: el dia de pase actual (abans de les 7:00 compta com
//   el dia anterior, igual que el tauler de cuina).
// - Si ja s'ha enviat, no el torna a enviar tret que force = true.
// - preview = true retorna l'HTML sense enviar res (per provar).

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "micsas.ff informes <informes@send.micsasff.com>";
const DEFAULT_TO = ["polbonastre@gmail.com"];
const HISTORY_DAYS = 70; // pizzes i tendència: últimes 10 setmanes

function madridBusinessDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return Number(get("hour")) % 24 < 7 ? addDays(date, -1) : date;
}

// Telèfon normalitzat per reconèixer clients que repeteixen (cada comanda
// crea una fitxa de client nova, així que no es pot fer per customer_id).
function phoneKey(phone: string | null | undefined): string | null {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.startsWith("0034")) d = d.slice(4);
  else if (d.length === 11 && d.startsWith("34")) d = d.slice(2);
  return d.length >= 9 ? d : null;
}

// PostgREST retorna com a màxim 1000 files per consulta: es pagina.
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function loadInput(sb: SupabaseClient, date: string, closedAt: string | null): Promise<ReportInput> {
  const histFrom = addDays(date, -HISTORY_DAYS);
  const weekFrom = addDays(date, -6);

  // Totes les comandes fins al dia del pase (cal l'historial sencer per
  // saber si un client ja havia demanat abans).
  const rawOrders = await fetchAll<Record<string, unknown>>((from, to) =>
    sb.from("orders")
      .select("id, delivery_date, status, payment_method, payment_status, total, tip_amount, pizza_count, slot_time, requested_slot, slot_allocations, created_at, updated_at, customers(phone)")
      .lte("delivery_date", date)
      .order("created_at", { ascending: true })
      .range(from, to));
  const orders: OrderRow[] = rawOrders.map((o) => ({
    id: String(o.id),
    delivery_date: String(o.delivery_date),
    status: String(o.status),
    payment_method: String(o.payment_method),
    payment_status: String(o.payment_status),
    total: Number(o.total) || 0,
    tip_amount: Number(o.tip_amount) || 0,
    pizza_count: Number(o.pizza_count) || 0,
    slot_time: (o.slot_time as string) ?? null,
    requested_slot: (o.requested_slot as string) ?? null,
    slot_allocations: (o.slot_allocations as Record<string, number>) ?? null,
    created_at: String(o.created_at),
    updated_at: (o.updated_at as string) ?? null,
    customer_key: phoneKey((o.customers as { phone?: string } | null)?.phone),
  }));

  const items = await fetchAll<ItemRow>((from, to) =>
    sb.from("order_items")
      .select("order_id, product_name, unit_price, quantity, orders!inner(delivery_date)")
      .gte("orders.delivery_date", histFrom)
      .lte("orders.delivery_date", date)
      .range(from, to));

  const events = await fetchAll<StatusEventRow>((from, to) =>
    sb.from("order_status_events")
      .select("order_id, status, changed_at, orders!inner(delivery_date)")
      .gte("orders.delivery_date", weekFrom)
      .lte("orders.delivery_date", date)
      .range(from, to));

  const incidents = await fetchAll<IncidentRow>((from, to) =>
    sb.from("order_incidents")
      .select("order_id, kind, orders!inner(delivery_date)")
      .gte("orders.delivery_date", weekFrom)
      .lte("orders.delivery_date", date)
      .range(from, to));

  const { data: rej, error: rejErr } = await sb.from("order_rejections")
    .select("delivery_date, pizza_count, reason")
    .gte("delivery_date", weekFrom)
    .lte("delivery_date", date);
  if (rejErr) throw new Error(rejErr.message);

  const doughs: ReportInput["doughs"] = {};
  const { data: doughRows } = await sb.from("daily_doughs").select("delivery_date, doughs").gte("delivery_date", weekFrom).lte("delivery_date", date);
  for (let d = weekFrom; d <= date; d = addDays(d, 1)) {
    const row = (doughRows ?? []).find((r: { delivery_date: string }) => r.delivery_date === d);
    if (row) { doughs[d] = { doughs: Number(row.doughs), set: true }; continue; }
    const { data: def } = await sb.rpc("daily_doughs_for", { p_delivery_date: d });
    doughs[d] = { doughs: Number(def ?? 40), set: false };
  }

  return { date, orders, items, events, rejections: (rej ?? []) as RejectionRow[], incidents, doughs, closedAt };
}

async function sendEmail(to: string[], subject: string, html: string): Promise<string> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY no configurada");
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text}`);
  return text;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  let date = "";
  try {
    // Només personal de cuina
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await sb.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Cal iniciar sessió a cuina." }, 401);
    const { data: staffRow } = await sb.from("staff").select("auth_user_id").eq("auth_user_id", userId).maybeSingle();
    if (!staffRow) return json({ error: "Només el personal de cuina pot tancar el pase." }, 403);

    const body = await req.json().catch(() => ({}));
    date = typeof body.deliveryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.deliveryDate) ? body.deliveryDate : madridBusinessDate();
    const force = body.force === true;
    const preview = body.preview === true;

    const { data: existing } = await sb.from("pase_reports").select("*").eq("delivery_date", date).maybeSingle();
    if (existing?.sent_at && !force && !preview) {
      return json({ alreadySent: true, sentAt: existing.sent_at, deliveryDate: date });
    }

    let closedAt: string = existing?.closed_at ?? new Date().toISOString();
    if (!preview) {
      if (!existing) {
        const { data: ins, error: insErr } = await sb.from("pase_reports")
          .insert({ delivery_date: date, closed_by: userId })
          .select("closed_at").single();
        // Doble toc: l'altra petició ja ha creat la fila i està enviant.
        if (insErr?.code === "23505") return json({ inProgress: true, deliveryDate: date });
        if (insErr) throw new Error(insErr.message);
        closedAt = ins.closed_at;
      }
    }

    const input = await loadInput(sb, date, closedAt);
    const summaries = daySummaries(input);
    const report = buildPaseReport(input, summaries);
    const html = renderPaseEmail(report);

    // Diumenge: també el resum setmanal (divendres + diumenge).
    let weeklyHtml: string | null = null;
    let weeklySubject = "";
    if (weekday(date) === 0) {
      const dayReports = [report];
      const friday = addDays(date, -2);
      if (summaries.some((s) => s.date === friday && s.orders > 0)) {
        dayReports.unshift(buildPaseReport({ ...input, date: friday }, summaries.filter((s) => s.date <= friday)));
      }
      const weekly = buildWeeklyReport(input, summaries, dayReports);
      weeklyHtml = renderWeeklyEmail(weekly);
      weeklySubject = weeklyEmailSubject(weekly);
    }

    if (preview) return json({ deliveryDate: date, html, weeklyHtml });

    const to = (Deno.env.get("PASE_REPORT_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const recipients = to.length ? to : DEFAULT_TO;
    await sendEmail(recipients, paseEmailSubject(report), html);
    await sb.from("pase_reports").update({ sent_at: new Date().toISOString(), last_error: null }).eq("delivery_date", date);

    let weeklySent = false;
    if (weeklyHtml) {
      try {
        await sendEmail(recipients, weeklySubject, weeklyHtml);
        await sb.from("pase_reports").update({ weekly_sent_at: new Date().toISOString() }).eq("delivery_date", date);
        weeklySent = true;
      } catch (err) {
        console.error("[informe-pase] setmanal", err);
        await sb.from("pase_reports").update({ last_error: `setmanal: ${err instanceof Error ? err.message : String(err)}` }).eq("delivery_date", date);
      }
    }

    return json({ ok: true, deliveryDate: date, sentTo: recipients, weekly: weeklySent, pizzas: report.day.pizzas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconegut";
    console.error("[informe-pase]", err);
    if (date) await sb.from("pase_reports").update({ last_error: msg }).eq("delivery_date", date);
    return json({ error: msg }, 500);
  }
});
