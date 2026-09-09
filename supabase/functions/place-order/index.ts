import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

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
      paymentMethod, paymentStatus,
      total, subtotal, tipAmount,
      authUserId,
      slotTime, pizzaCount, deliveryDate,
      items,
    } = await req.json();

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
      p_tip_amount:     tipAmount ?? 0,
      p_total:          total,
      p_notes:          finalNotes ?? null,
      p_requested_slot: slotTime ?? null,
      p_pizza_count:    pizzaCount ?? 0,
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

    // Insert order items
    if (items && items.length > 0) {
      const { error: itemsErr } = await sb.from("order_items").insert(
        items.map((it: { product_name: string; unit_price: number; quantity: number; notes: string | null }) => ({
          order_id:     orderRow.order_id,
          product_id:   null,
          product_name: it.product_name,
          unit_price:   it.unit_price,
          quantity:     it.quantity,
          notes:        it.notes ?? null,
        }))
      );
      if (itemsErr) throw itemsErr;
    }

    return new Response(JSON.stringify({ orderId: orderRow.order_id, slotTime: orderRow.slot_time }), {
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
