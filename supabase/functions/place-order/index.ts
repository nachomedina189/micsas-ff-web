import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendOrderConfirmationEmail } from "../_shared/email.ts";
import { resolveDiscount } from "../_shared/discount.ts";

// Catàleg de preus real — mateixos ids/preus que l'objecte MENU a
// pedido.html. El client NOMÉS envia id + quantitat + notes de cada
// article; el preu, el subtotal, el total i el recompte de pizzes es
// calculen SEMPRE aquí, mai a partir del que digui la petició — sense
// això, qualsevol (DevTools, o una crida directa a la funció) podia
// enviar el total/preu per article que volgués i la comanda es desava
// (i, en pagament amb targeta, es cobrava) a aquell import fabricat.
//
// Què es pot demanar cada dia (pizzes o ingredients apagats des de
// cocina.html) NO es decideix aquí: ho diu get_menu_availability.
const CATALOG: Record<string, { name: string; price: number }> = {
  "margherita-1889":      { name: "Margherita 1889",      price: 9 },
  "marinara-olivata":     { name: "Marinara Olivata",     price: 8 },
  "bianca-suprema":       { name: "Bianca Suprema",       price: 11 },
  "sottobosco":           { name: "Sottobosco",           price: 11 },
  "carbonara":            { name: "Carbonara",            price: 14.5 },
  "inferno-di-nduja":     { name: "Inferno di 'Nduja",    price: 13 },
  "caramella-affumicata": { name: "Caramella Affumicata", price: 13 },
  "antidiavola":          { name: "Antidiavola",          price: 13 },
  "nutellina":            { name: "Nutellina",            price: 13 },
  "d3":                   { name: "Cervesa artesana Moretti", price: 3 },
  "d4":                   { name: "Coca-Cola",            price: 2 },
  "d5":                   { name: "Fanta",                price: 2 },
};

// Especial Nadal: els panettones (ids "pn-…") NO són al CATALOG — preu, nom i
// unitats els diu la taula panettones (supabase/migrations/20261127000000_
// panettones_nadal.sql). No compten com a pizzes, i l'estoc es reserva amb
// add_panettone_items, amb un bloqueig perquè no se'n vengui cap de més.
const isPanettoneId = (id: unknown): boolean => typeof id === "string" && id.startsWith("pn-");
function panettoneSoldOutMsg(name: string, left: number): string {
  if (left === 1) return `Només queda 1 unitat de ${name}. Treu-ne del cistell i torna-ho a provar.`;
  return left > 0
    ? `Només queden ${left} unitats de ${name}. Treu-ne alguna del cistell i torna-ho a provar.`
    : `Ho sentim, el ${name} s'ha esgotat. Treu-lo del cistell i torna-ho a provar.`;
}

// Data i hora actuals a Europe/Madrid (gestiona CET/CEST automàticament)
// — cal calcular-ho explícitament perquè el runtime de l'edge function
// no té garantit aquest fus horari (sol ser UTC).
function madridNow(): { date: string; mins: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = Number(get("hour")) % 24; // alguns motors ICU donen "24" per mitjanit
  return { date: `${get("year")}-${get("month")}-${get("day")}`, mins: hour * 60 + Number(get("minute")) };
}

// Zona de repartiment: Matadepera i, com a única excepció, la gasolinera Q8
// de la Ctra. de Matadepera 383 (Terrassa). Mateixa regla que pre-pedido.html,
// repetida aquí perquè la pàgina es pot saltar o pot ser una versió antiga.
const MATADEPERA_CENTER = { lat: 41.60361, lng: 2.02444 };
const MATADEPERA_MAX_KM = 6;
const Q8_PICKUP = { lat: 41.5852391, lng: 2.0190405, radiusKm: 0.5 };

function normalizeText(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Adreça triada a pre-pedido.html: carrer i coordenades de Google sempre.
// Sense això, el 27/11 van entrar comandes amb el carrer buit.
function hasAddress(street: unknown, lat: unknown, lng: unknown): boolean {
  return String(street ?? "").trim().length >= 3 &&
    typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
}

function isDeliverable(street: unknown, city: unknown, lat: number, lng: number): boolean {
  if (normalizeText(city) === "matadepera") {
    return distanceKm(lat, lng, MATADEPERA_CENTER.lat, MATADEPERA_CENTER.lng) <= MATADEPERA_MAX_KM;
  }
  const s = normalizeText(street);
  if (!s.startsWith("carretera de matadepera")) return false;
  return /\b383\b/.test(s) || distanceKm(lat, lng, Q8_PICKUP.lat, Q8_PICKUP.lng) <= Q8_PICKUP.radiusKm;
}

// Apunta una comanda rebutjada (demanda perduda) per a l'informe del pase.
// Mai ha de trencar la resposta al client: qualsevol error es registra i prou.
async function logRejection(
  sb: ReturnType<typeof createClient>,
  row: { delivery_date: string | null; requested_slot: string | null; pizza_count: number; reason: string },
): Promise<void> {
  try {
    const { error } = await sb.from("order_rejections").insert(row);
    if (error) console.error("[place-order] order_rejections", error.message);
  } catch (err) {
    console.error("[place-order] order_rejections", err);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use service_role key to bypass RLS
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const {
      name: legacyName, email, phone,
      firstName, lastName,
      street, floor, postalCode, city, delivNotes, finalNotes,
      lat, lng,
      paymentMethod,
      tipAmount,
      authUserId,
      slotTime, deliveryDate,
      items,
      discountCode,
      panettoneDelivery,
    } = await req.json();

    // Nom i cognoms arriben per separat; a customers.name es continua desant
    // el nom complet, que és el que llegeixen cocina.html, correus i informes.
    // Una pàgina antiga que només envia `name` també funciona.
    const cleanName = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const first = cleanName(firstName);
    const last = cleanName(lastName);
    const name = [first, last].filter(Boolean).join(" ") || cleanName(legacyName);
    const nameParts = first || last ? { first_name: first || null, last_name: last || null } : {};

    if (!hasAddress(street, lat, lng)) {
      return new Response(JSON.stringify({ error: "Falta l'adreça d'entrega. Torna a indicar on et portem la pizza.", missingAddress: true }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isDeliverable(street, city, lat, lng)) {
      return new Response(JSON.stringify({ error: "Només fem entregues a Matadepera. Revisa l'adreça d'entrega." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "La comanda no té cap article." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let subtotal = 0;
    let pizzaCount = 0;
    const resolvedItems: { product_name: string; unit_price: number; quantity: number; notes: string | null }[] = [];
    // Panettones: es resolen contra la taula (no contra CATALOG) i les seves
    // línies les insereix add_panettone_items, que comprova l'estoc.
    const panettoneLines: { id: string; quantity: number }[] = [];
    const panettoneEmailItems: { product_name: string; unit_price: number; quantity: number; notes: string | null }[] = [];
    let panettoneRows: { id: string; name: string; price: number; active: boolean; stock_total: number | null }[] = [];
    if (items.some((it: { id?: unknown }) => isPanettoneId(it?.id))) {
      const { data: pRows, error: pErr } = await sb.from("panettones").select("id, name, price, active, stock_total");
      if (pErr) throw pErr;
      panettoneRows = (pRows ?? []) as typeof panettoneRows;
    }
    for (const it of items) {
      if (isPanettoneId(it?.id)) {
        const pan = panettoneRows.find((p) => p.id === it.id);
        const qty = Number(it?.quantity);
        if (!pan || !Number.isInteger(qty) || qty <= 0 || qty > 30) {
          return new Response(JSON.stringify({ error: "Article no vàlid a la comanda." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!pan.active || pan.stock_total === null) {
          return new Response(JSON.stringify({ error: `Ho sentim, el ${pan.name} encara no està a la venda.`, panettoneSoldOut: true, id: pan.id, remaining: 0 }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const price = Number(pan.price);
        subtotal += price * qty;
        const existing = panettoneLines.find((l) => l.id === pan.id);
        if (existing) existing.quantity += qty; else panettoneLines.push({ id: pan.id, quantity: qty });
        panettoneEmailItems.push({ product_name: pan.name, unit_price: price, quantity: qty, notes: null });
        continue;
      }
      const catalogItem = CATALOG[it?.id];
      const quantity = Number(it?.quantity);
      if (!catalogItem || !Number.isFinite(quantity) || quantity <= 0 || quantity > 30) {
        return new Response(JSON.stringify({ error: "Article no vàlid a la comanda." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      subtotal += catalogItem.price * quantity;
      if (!String(it.id).startsWith("d")) pizzaCount += quantity;
      resolvedItems.push({
        product_name: catalogItem.name,
        unit_price:   catalogItem.price,
        quantity,
        notes:        it.notes ?? null,
      });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    // Quan arriben els panettones: amb la comanda (dia de pase) o el dia
    // d'entrega de panettones. Una comanda NOMÉS de panettones per a aquell
    // dia no té dia de pase ni franja: es desa sense delivery_date.
    const panDelivery: "order" | "panettone_day" | null = panettoneLines.length
      ? (panettoneDelivery === "panettone_day" ? "panettone_day" : "order")
      : null;
    const panettoneDayOnly = panDelivery === "panettone_day" && resolvedItems.length === 0;

    // Comprovació ràpida de l'estoc ABANS de crear client, adreça i comanda
    // (la de veritat, amb bloqueig, la fa add_panettone_items).
    if (panettoneLines.length) {
      const { data: stockData, error: stockErr } = await sb.rpc("get_panettone_stock");
      if (stockErr) console.error("[place-order] get_panettone_stock", stockErr.message);
      const stockItems = ((stockData as { items?: { id: string; remaining: number | null }[] } | null)?.items) ?? [];
      for (const line of panettoneLines) {
        const row = stockItems.find((r) => r.id === line.id);
        const left = row?.remaining ?? null;
        if (row && (left === null || left < line.quantity)) {
          const name = panettoneRows.find((p) => p.id === line.id)?.name ?? "panettone";
          return new Response(JSON.stringify({ error: panettoneSoldOutMsg(name, left ?? 0), panettoneSoldOut: true, id: line.id, remaining: left ?? 0 }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }
    // La propina és l'única part de l'import que de veritat decideix el
    // client — es manté, però mai negativa (rebaixaria el total per sota
    // del subtotal real).
    const safeTip = Math.max(0, Number(tipAmount) || 0);

    // Codi de descompte: es valida aquí amb el subtotal real, i rebaixa només
    // el subtotal (mai la propina). Si el client n'ha escrit un que ja no val,
    // es rebutja la comanda en lloc de cobrar-li més del que veia a pantalla.
    let discount: { code: string; amount: number } | null = null;
    if (discountCode) {
      const d = await resolveDiscount(sb, discountCode, subtotal);
      if (!d.ok) {
        return new Response(JSON.stringify({ error: d.error, discountInvalid: true }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      discount = { code: d.code, amount: d.amount };
    }
    const discountAmount = discount?.amount ?? 0;
    const total = Math.round((subtotal - discountAmount + safeTip) * 100) / 100;
    // Stripe no cobra menys de 0,50 €: un descompte que deixa la comanda
    // gairebé a zero només es pot pagar en efectiu.
    if (paymentMethod !== "cash" && total < 0.5) {
      return new Response(JSON.stringify({ error: "Amb aquest descompte l'import és massa baix per pagar online. Tria pagament al repartidor." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mateixes franges de 15 min que pedido.html / pre-pedido.html. L'última
    // franja és LAST_SLOT (política des del 02/10/2026; abans era les 23:30).
    const LAST_SLOT = "22:30";
    const REAL_SLOTS: string[] = (() => {
      const [lh, lm] = LAST_SLOT.split(":").map(Number);
      const slots: string[] = [];
      for (let t = 20 * 60; t <= lh * 60 + lm; t += 15) {
        slots.push(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
      }
      return slots;
    })();

    // Només s'accepten comandes amb data d'entrega en divendres (5) o diumenge (0).
    // Es rebutja també si falta deliveryDate: no s'accepta cap comanda sense
    // dia d'entrega vàlid (evita saltar-se la validació enviant-lo buit).
    const deliveryDay = deliveryDate ? new Date(`${deliveryDate}T00:00:00`).getDay() : NaN;
    if (!panettoneDayOnly && deliveryDay !== 5 && deliveryDay !== 0) {
      return new Response(JSON.stringify({ error: "Només s'accepten comandes per divendres i diumenge." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Una franja que no és a REAL_SLOTS (posterior a LAST_SLOT, o enviada per
    // una pàgina oberta abans d'un canvi d'horari) s'ha de rebutjar aquí:
    // create_order_with_slot, si no troba la franja demanada a la llista,
    // comença a buscar per la PRIMERA franja de la nit i la comanda acabaria
    // assignada a les 20:00.
    if (!panettoneDayOnly && slotTime && !REAL_SLOTS.includes(slotTime)) {
      await logRejection(sb, { delivery_date: deliveryDate, requested_slot: slotTime, pizza_count: pizzaCount, reason: "slot_closed" });
      return new Response(JSON.stringify({ error: `Aquesta franja ja no està disponible: l'última franja és a les ${LAST_SLOT}h. Tria una altra hora.` }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // L'estat de pagament el decideix SEMPRE el servidor, mai el client:
    // abans es feia servir el paymentStatus de la petició, i qualsevol podia
    // crear una comanda amb targeta ja "paid" (visible a cuina com a pagada)
    // sense haver pagat res. Efectiu → 'pending' (es cobra a l'entrega);
    // qualsevol altre mètode → 'processing' fins que stripe-webhook rebi
    // payment_intent.succeeded.
    const paymentStatus = paymentMethod === "cash" ? "pending" : "processing";

    // Dia exhaurit: no s'accepta cap comanda, ni tan sols només de begudes
    // (create_order_with_slot només bloqueja si hi ha pizzes a la comanda).
    // Una comanda només de panettones no gasta masses: es pot fer igualment.
    const { data: dayStatus } = (panettoneDayOnly || resolvedItems.length === 0) ? { data: null } : await sb.rpc("get_pizza_status", { p_delivery_date: deliveryDate });
    const dayRow = Array.isArray(dayStatus) ? dayStatus[0] : dayStatus;
    if (dayRow?.status === "soldout") {
      await logRejection(sb, { delivery_date: deliveryDate, requested_slot: slotTime ?? null, pizza_count: pizzaCount, reason: "soldout" });
      return new Response(JSON.stringify({ error: "Avui hem exhaurit les pizzes disponibles. Gràcies per la paciència — torna un altre dia!", soldOut: true, remaining: 0 }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pizzes, begudes o ingredients apagats a cocina.html per a aquest dia:
    // la web ja no els deixa afegir, però una pàgina oberta d'abans (o una
    // crida directa) encara els podria enviar. Es comprova abans de crear
    // res. Si la consulta falla, no es bloqueja la comanda (igual que el
    // control de dia exhaurit de dalt).
    const { data: offRows, error: offErr } = panettoneDayOnly
      ? { data: [], error: null }
      : await sb.rpc("get_menu_availability", { p_delivery_date: deliveryDate });
    if (offErr) console.error("[place-order] get_menu_availability", offErr.message);
    const offIds = new Set(((offRows ?? []) as { product_id: string }[]).map((r) => r.product_id));
    const unavailable = [...new Set(items.map((it: { id: string }) => String(it.id)))].filter((id) => offIds.has(id));
    if (unavailable.length) {
      const names = unavailable.map((id) => CATALOG[id].name);
      const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} i ${names[names.length - 1]}`;
      const msg = names.length === 1
        ? `Ho sentim, ${list} ja no està disponible per a aquest dia. Treu-la del cistell i torna-ho a provar.`
        : `Ho sentim, ${list} ja no estan disponibles per a aquest dia. Treu-les del cistell i torna-ho a provar.`;
      return new Response(JSON.stringify({ error: msg, unavailable }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find or create customer
    let customerId: string;

    if (authUserId) {
      const { data: existing } = await sb
        .from("customers")
        .select("id")
        .eq("auth_user_id", authUserId)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await sb.from("customers")
          .update({ name, ...nameParts, phone, email })
          .eq("id", existing.id);
        customerId = existing.id;
      } else {
        const { data: nc, error: ne } = await sb
          .from("customers")
          .insert({ name, ...nameParts, phone, email, auth_user_id: authUserId })
          .select("id")
          .single();
        if (ne) throw ne;
        customerId = nc.id;
      }
    } else {
      const { data: nc, error: ne } = await sb
        .from("customers")
        .insert({ name, ...nameParts, phone, email })
        .select("id")
        .single();
      if (ne) throw ne;
      customerId = nc.id;
    }

    // Insert address
    const { data: address, error: addrErr } = await sb
      .from("addresses")
      .insert({
        customer_id: customerId,
        street,
        number: "",
        floor: floor ?? null,
        postal_code: postalCode,
        city: city || "Matadepera",
        notes: delivNotes ?? null,
        // Coordenades precises resoltes per Google Places en el moment de
        // triar l'adreça (no una re-geocodificació del text) — evita que
        // l'enllaç de navegació de cocina.html acabi apuntant lluny de la
        // ubicació real quan el carrer és ambigu.
        lat: typeof lat === "number" ? lat : null,
        lng: typeof lng === "number" ? lng : null,
      })
      .select("id")
      .single();
    if (addrErr) throw addrErr;

    // Marge mínim de preparació (mateixos 15 min que ASAP_LEAD_MIN a
    // pedido.html) aplicat com a última barrera real — la de la UI es pot
    // saltar cridant aquest endpoint directament. Només afecta comandes
    // per avui; no rebutgem la comanda, sinó que pugem la franja demanada
    // (mai la baixem) fins que tingui marge suficient, i deixem que
    // create_order_with_slot faci la seva pròpia comprovació d'aforo a
    // partir d'aquí — exactament el mateix mecanisme que ja fa servir
    // quan la franja triada està plena.
    const SLOT_LEAD_MIN = 15;
    let effectiveSlotTime = panettoneDayOnly ? null : (slotTime ?? null);
    // Franges on create_order_with_slot pot posar pizzes. Per a una comanda
    // gran, ara pot començar la primera tanda ABANS de la franja demanada
    // (perquè tot estigui llest a l'hora triada) — per avui, mai abans de
    // la primera franja amb marge de preparació.
    //
    // A més, abans de la primera franja (20:00) hi ha tandes internes de forn
    // (PREP_SLOTS) que el client no pot triar com a hora d'entrega, però que
    // una comanda gran sí pot fer servir per començar abans i arribar a
    // l'hora: p. ex. 10 pizzes per a les 20:00 → 19:45 (5) + 20:00 (5).
    // create_order_with_slot només hi arriba omplint cap enrere, mai com a
    // franja final. Per avui tenen un marge més curt (PREP_LEAD_MIN): el
    // forn ja està encès i n'hi ha prou amb 10 min per tenir-les llestes.
    const PREP_SLOTS = ["19:30", "19:45"];
    const PREP_LEAD_MIN = 10;
    let bookableSlots = [...PREP_SLOTS, ...REAL_SLOTS];
    if (effectiveSlotTime) {
      const { date: madridToday, mins: madridNowMins } = madridNow();
      if (deliveryDate === madridToday) {
        const earliestSafeSlot = REAL_SLOTS.find((s) => {
          const [h, m] = s.split(":").map(Number);
          return h * 60 + m > madridNowMins + SLOT_LEAD_MIN;
        }) ?? null;
        if (!earliestSafeSlot) {
          await logRejection(sb, { delivery_date: deliveryDate, requested_slot: slotTime ?? null, pizza_count: pizzaCount, reason: "too_late" });
          return new Response(JSON.stringify({ error: "Ja no queda marge suficient per preparar cap comanda avui. Si us plau, tria un altre dia." }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (effectiveSlotTime < earliestSafeSlot) {
          effectiveSlotTime = earliestSafeSlot;
        }
        const prepSlots = PREP_SLOTS.filter((s) => {
          const [h, m] = s.split(":").map(Number);
          return h * 60 + m > madridNowMins + PREP_LEAD_MIN;
        });
        bookableSlots = [...prepSlots, ...REAL_SLOTS.filter((s) => s >= earliestSafeSlot)];
      }
    }

    // Comprova l'aforo (màx. 6 pizzes per franja) i insereix la comanda en
    // una única transacció de servidor (veure migrations/20260909000000_atomic_order_slot.sql).
    // Fer-ho tot dins la mateixa funció de BD, protegida amb un advisory
    // lock per delivery_date, evita que dues comandes simultànies per la
    // mateixa franja passin totes dues la comprovació d'aforo abans que
    // cap de les dues s'hagi inserit.
    // Comanda només de panettones per al dia d'entrega de panettones: no hi ha
    // pase, ni franja, ni pizzes; es crea directament (sense aforo).
    let orderRow: { order_id: string; slot_time: string | null } | undefined;
    if (panettoneDayOnly) {
      const { data: pOrder, error: pOrderErr } = await sb.from("orders").insert({
        customer_id:        customerId,
        address_id:         address.id,
        payment_method:     paymentMethod,
        payment_status:     paymentStatus,
        status:             "pending",
        subtotal,
        delivery_fee:       0,
        tip_amount:         safeTip,
        total,
        notes:              finalNotes ?? null,
        slot_time:          null,
        pizza_count:        0,
        delivery_date:      null,
        panettone_delivery: "panettone_day",
      }).select("id").single();
      if (pOrderErr) throw pOrderErr;
      orderRow = { order_id: pOrder.id, slot_time: null };
    } else {
      const { data: rpcRows, error: rpcErr } = await sb.rpc("create_order_with_slot", {
        p_customer_id:    customerId,
        p_address_id:     address.id,
        p_payment_method: paymentMethod,
        p_payment_status: paymentStatus,
        p_subtotal:       subtotal,
        p_delivery_fee:   0,
        p_tip_amount:     safeTip,
        p_total:          total,
        p_notes:          finalNotes ?? null,
        p_requested_slot: effectiveSlotTime,
        p_pizza_count:    pizzaCount,
        p_delivery_date:  deliveryDate,
        p_slots:          bookableSlots,
      });
      // Masses del dia exhaurides (les posa el pizzero a cocina.html):
      // create_order_with_slot llança "DAILY_SOLDOUT remaining=N" en lloc de
      // simplement no retornar franja, perquè el missatge sigui diferent de
      // "no queden franges" — aquí no és que aquella hora estigui plena, és
      // que ja no hi ha prou masses. Si en queden algunes, diem quantes.
      if (rpcErr && rpcErr.message?.includes("DAILY_SOLDOUT")) {
        const left = Number(/remaining=(\d+)/.exec(rpcErr.message)?.[1] ?? 0);
        await logRejection(sb, { delivery_date: deliveryDate, requested_slot: slotTime ?? null, pizza_count: pizzaCount, reason: "soldout" });
        const msg = left > 0
          ? `Només en queden ${left} per a aquest dia. Treu-ne alguna del cistell i torna-ho a provar.`
          : "Avui hem exhaurit les pizzes disponibles. Gràcies per la paciència — torna un altre dia!";
        return new Response(JSON.stringify({ error: msg, soldOut: left === 0, remaining: left }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (rpcErr) throw rpcErr;

      orderRow = rpcRows?.[0] as { order_id: string; slot_time: string | null } | undefined;
      if (slotTime && !orderRow) {
        await logRejection(sb, { delivery_date: deliveryDate, requested_slot: slotTime, pizza_count: pizzaCount, reason: "no_slots" });
        return new Response(JSON.stringify({ error: "No queden franges disponibles per avui. Si us plau, tria un altre dia." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!orderRow) throw new Error("create_order_with_slot no ha retornat cap comanda");
    }

    // Panettones: reserva atòmica de l'estoc. Si algú s'ha endut l'últim
    // entre la comprovació d'abans i ara, la comanda es cancel·la (encara no
    // té cap línia ni cap pagament) i el client ho veu a pantalla.
    if (panettoneLines.length) {
      const { error: panErr } = await sb.rpc("add_panettone_items", { p_order_id: orderRow.order_id, p_items: panettoneLines });
      if (panErr) {
        await sb.from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", orderRow.order_id);
        if (panErr.message?.includes("PANETTONE_SOLDOUT")) {
          const id = /id=(\S+)/.exec(panErr.message)?.[1] ?? "";
          const left = Number(/remaining=(\d+)/.exec(panErr.message)?.[1] ?? 0);
          const pname = panettoneRows.find((p) => p.id === id)?.name ?? "panettone";
          return new Response(JSON.stringify({ error: panettoneSoldOutMsg(pname, left), panettoneSoldOut: true, id, remaining: left }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw panErr;
      }
    }

    // Franja que va triar el client: si estava plena, la comanda ha quedat
    // en una de posterior, i l'informe del pase compta aquests desplaçaments.
    // També el codi de descompte aplicat (orders.total ja el porta restat).
    if ((slotTime && !panettoneDayOnly) || discount || (panDelivery && !panettoneDayOnly)) {
      const extra: Record<string, unknown> = {};
      if (slotTime && !panettoneDayOnly) extra.requested_slot = slotTime;
      if (panDelivery && !panettoneDayOnly) extra.panettone_delivery = panDelivery;
      if (discount) { extra.discount_code = discount.code; extra.discount_amount = discount.amount; }
      const { error: reqErr } = await sb.from("orders").update(extra).eq("id", orderRow.order_id);
      if (reqErr) console.error("[place-order] requested_slot/discount", reqErr.message);
    }

    // Insert order items — sempre amb els valors RECALCULATS (resolvedItems),
    // mai amb el que hagués enviat el client.
    if (resolvedItems.length) {
      const { error: itemsErr } = await sb.from("order_items").insert(
        resolvedItems.map((it) => ({
          order_id:   orderRow.order_id,
          product_id: null,
          ...it,
        }))
      );
      if (itemsErr) throw itemsErr;
    }

    // Email de confirmació NOMÉS per a comandes en efectiu — no hi ha cap
    // pagament online pel mig, així que la comanda ja està confirmada en
    // el mateix moment de crear-se. Les comandes amb targeta l'envien des
    // de stripe-webhook, quan Stripe confirma el cobrament real (mai
    // abans). S'espera (await) perquè un edge function pot congelar-se
    // just després de tornar la resposta — sense esperar, l'enviament
    // "fire and forget" es podria tallar a mig fer. La funció mateixa ja
    // té try/catch intern i mai llança error, així que això no pot
    // trencar la creació de la comanda.
    if (paymentMethod === "cash") {
      let panettoneDate: string | null = null;
      if (panDelivery === "panettone_day") {
        const { data: ps } = await sb.from("panettone_settings").select("delivery_date").limit(1).maybeSingle();
        panettoneDate = (ps as { delivery_date: string | null } | null)?.delivery_date ?? null;
      }
      const emailItems = [...resolvedItems, ...panettoneEmailItems];
      await sendOrderConfirmationEmail({
        toEmail: email,
        toName: name,
        // El descompte surt al correu com una línia més, en negatiu.
        items: discount
          ? [...emailItems, { product_name: `Descompte ${discount.code}`, quantity: 1, unit_price: -discount.amount, notes: null }]
          : emailItems,
        total,
        paymentMethod,
        deliveryDate: panettoneDayOnly ? null : deliveryDate,
        slotTime: orderRow.slot_time,
        address: { street, floor, postalCode, city },
        panettoneDelivery: panDelivery,
        panettoneDate,
      });
    }

    return new Response(JSON.stringify({ orderId: orderRow.order_id, slotTime: orderRow.slot_time, total, discountAmount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconegut";
    console.error("[place-order]", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
