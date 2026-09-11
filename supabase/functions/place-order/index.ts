import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendOrderConfirmationEmail } from "../_shared/email.ts";

// Catàleg de preus real — mateixos ids/preus que l'objecte MENU a
// pedido.html. El client NOMÉS envia id + quantitat + notes de cada
// article; el preu, el subtotal, el total i el recompte de pizzes es
// calculen SEMPRE aquí, mai a partir del que digui la petició — sense
// això, qualsevol (DevTools, o una crida directa a la funció) podia
// enviar el total/preu per article que volgués i la comanda es desava
// (i, en pagament amb targeta, es cobrava) a aquell import fabricat.
const CATALOG: Record<string, { name: string; price: number; available?: boolean }> = {
  "margherita-1889":      { name: "Margherita 1889",      price: 9 },
  "marinara-olivata":     { name: "Marinara Olivata",     price: 8 },
  "bianca-suprema":       { name: "Bianca Suprema",       price: 11 },
  "sottobosco":           { name: "Sottobosco",           price: 11 },
  "carbonara":            { name: "Carbonara",            price: 14.5 },
  "inferno-di-nduja":     { name: "Inferno di 'Nduja",    price: 13 },
  // Temporalment fora de carta ("Tornarà aviat" a la Carta i a pedido.html)
  "caramella-affumicata": { name: "Caramella Affumicata", price: 13, available: false },
  "antidiavola":          { name: "Antidiavola",          price: 13 },
  "nutellina":            { name: "Nutellina",            price: 13 },
  "d3":                   { name: "Cervesa artesana Moretti", price: 3 },
};

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
      name, email, phone,
      street, floor, postalCode, city, delivNotes, finalNotes,
      lat, lng,
      paymentMethod, paymentStatus,
      tipAmount,
      authUserId,
      slotTime, deliveryDate,
      items,
    } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "La comanda no té cap article." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let subtotal = 0;
    let pizzaCount = 0;
    const resolvedItems: { product_name: string; unit_price: number; quantity: number; notes: string | null }[] = [];
    for (const it of items) {
      const catalogItem = CATALOG[it?.id];
      const quantity = Number(it?.quantity);
      if (!catalogItem || catalogItem.available === false || !Number.isFinite(quantity) || quantity <= 0 || quantity > 30) {
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
    // La propina és l'única part de l'import que de veritat decideix el
    // client — es manté, però mai negativa (rebaixaria el total per sota
    // del subtotal real).
    const safeTip = Math.max(0, Number(tipAmount) || 0);
    const total = Math.round((subtotal + safeTip) * 100) / 100;

    // Mateixes franges de 15 min que pedido.html / pre-pedido.html (20:00–23:30).
    const REAL_SLOTS: string[] = (() => {
      const slots: string[] = [];
      for (let h = 20; h <= 23; h++) {
        for (let m = 0; m < 60; m += 15) {
          if (h === 23 && m > 30) break;
          slots.push(`${h}:${String(m).padStart(2, "0")}`);
        }
      }
      return slots;
    })();

    // Només s'accepten comandes amb data d'entrega en divendres (5) o diumenge (0).
    // Es rebutja també si falta deliveryDate: no s'accepta cap comanda sense
    // dia d'entrega vàlid (evita saltar-se la validació enviant-lo buit).
    const deliveryDay = deliveryDate ? new Date(`${deliveryDate}T00:00:00`).getDay() : NaN;
    if (deliveryDay !== 5 && deliveryDay !== 0) {
      return new Response(JSON.stringify({ error: "Només s'accepten comandes per divendres i diumenge." }), {
        status: 400,
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
          .update({ name, phone, email })
          .eq("id", existing.id);
        customerId = existing.id;
      } else {
        const { data: nc, error: ne } = await sb
          .from("customers")
          .insert({ name, phone, email, auth_user_id: authUserId })
          .select("id")
          .single();
        if (ne) throw ne;
        customerId = nc.id;
      }
    } else {
      const { data: nc, error: ne } = await sb
        .from("customers")
        .insert({ name, phone, email })
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

    // Comprova l'aforo (màx. 6 pizzes per franja) i insereix la comanda en
    // una única transacció de servidor (veure migrations/20260909000000_atomic_order_slot.sql).
    // Fer-ho tot dins la mateixa funció de BD, protegida amb un advisory
    // lock per delivery_date, evita que dues comandes simultànies per la
    // mateixa franja passin totes dues la comprovació d'aforo abans que
    // cap de les dues s'hagi inserit.
    const { data: rpcRows, error: rpcErr } = await sb.rpc("create_order_with_slot", {
      p_customer_id:    customerId,
      p_address_id:     address.id,
      p_payment_method: paymentMethod,
      p_payment_status: paymentStatus ?? "pending",
      p_subtotal:       subtotal,
      p_delivery_fee:   0,
      p_tip_amount:     safeTip,
      p_total:          total,
      p_notes:          finalNotes ?? null,
      p_requested_slot: slotTime ?? null,
      p_pizza_count:    pizzaCount,
      p_delivery_date:  deliveryDate,
      p_slots:          REAL_SLOTS,
    });
    if (rpcErr) throw rpcErr;

    const orderRow = rpcRows?.[0] as { order_id: string; slot_time: string | null } | undefined;
    if (slotTime && !orderRow) {
      return new Response(JSON.stringify({ error: "No queden franges disponibles per avui. Si us plau, tria un altre dia." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!orderRow) throw new Error("create_order_with_slot no ha retornat cap comanda");

    // Insert order items — sempre amb els valors RECALCULATS (resolvedItems),
    // mai amb el que hagués enviat el client.
    const { error: itemsErr } = await sb.from("order_items").insert(
      resolvedItems.map((it) => ({
        order_id:   orderRow.order_id,
        product_id: null,
        ...it,
      }))
    );
    if (itemsErr) throw itemsErr;

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
      await sendOrderConfirmationEmail({
        toEmail: email,
        toName: name,
        items: resolvedItems,
        total,
        paymentMethod,
        deliveryDate,
        slotTime: orderRow.slot_time,
        address: { street, floor, postalCode, city },
      });
    }

    return new Response(JSON.stringify({ orderId: orderRow.order_id, slotTime: orderRow.slot_time, total }), {
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
