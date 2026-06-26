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

    // Mateixes franges de 15 min que pedido.html / pre-pedido.html (20:30–23:30).
    const REAL_SLOTS: string[] = (() => {
      const slots: string[] = [];
      for (let h = 20; h <= 23; h++) {
        const startM = h === 20 ? 30 : 0;
        for (let m = startM; m < 60; m += 15) {
          if (h === 23 && m > 30) break;
          slots.push(`${h}:${String(m).padStart(2, "0")}`);
        }
      }
      return slots;
    })();

    // Capacitat: màx. 6 pizzes per franja. Si la franja demanada ja està
    // plena (algú s'ha avançat entre que el client la va veure i va confirmar),
    // en lloc de rebutjar la comanda s'assigna automàticament la SEGÜENT
    // franja del mateix dia amb lloc — comprovat aquí en servidor perquè no
    // es pugui saltar trucant a l'API directament.
    let finalSlotTime: string | null = slotTime ?? null;

    if (deliveryDate && slotTime) {
      const { data: dayOrders, error: dayErr } = await sb
        .from("orders")
        .select("slot_time, pizza_count")
        .eq("delivery_date", deliveryDate)
        .neq("status", "cancelled");
      if (dayErr) throw dayErr;

      const counts: Record<string, number> = {};
      (dayOrders ?? []).forEach((o: { slot_time: string | null; pizza_count: number }) => {
        if (!o.slot_time) return;
        counts[o.slot_time] = (counts[o.slot_time] ?? 0) + (o.pizza_count ?? 0);
      });

      const requestedIndex = REAL_SLOTS.indexOf(slotTime);
      const candidates = requestedIndex >= 0 ? REAL_SLOTS.slice(requestedIndex) : REAL_SLOTS;

      finalSlotTime = candidates.find((s) => (counts[s] ?? 0) + (pizzaCount ?? 0) <= 6) ?? null;

      if (!finalSlotTime) {
        return new Response(JSON.stringify({ error: "No queden franges disponibles per avui. Si us plau, tria un altre dia." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // Insert order
    const { data: order, error: orderErr } = await sb
      .from("orders")
      .insert({
        customer_id:    customerId,
        address_id:     address.id,
        payment_method: paymentMethod,
        payment_status: paymentStatus ?? "pending",
        status:         "pending",
        subtotal,
        delivery_fee:   0,
        tip_amount:     tipAmount ?? 0,
        total,
        notes:          finalNotes ?? null,
        slot_time:      finalSlotTime ?? slotTime ?? null,
        pizza_count:    pizzaCount ?? 0,
        delivery_date:  deliveryDate ?? null,
      })
      .select("id")
      .single();
    if (orderErr) throw orderErr;

    // Insert order items
    if (items && items.length > 0) {
      const { error: itemsErr } = await sb.from("order_items").insert(
        items.map((it: { product_name: string; unit_price: number; quantity: number; notes: string | null }) => ({
          order_id:     order.id,
          product_id:   null,
          product_name: it.product_name,
          unit_price:   it.unit_price,
          quantity:     it.quantity,
          notes:        it.notes ?? null,
        }))
      );
      if (itemsErr) throw itemsErr;
    }

    return new Response(JSON.stringify({ orderId: order.id, slotTime: finalSlotTime ?? slotTime ?? null }), {
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
