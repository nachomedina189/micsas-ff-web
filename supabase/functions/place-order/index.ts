import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

    // Capacity check: max 6 pizzas per (deliveryDate, slotTime), enforced
    // server-side so it can't be bypassed by calling the API directly.
    if (deliveryDate && slotTime) {
      const { data: existing, error: capErr } = await sb
        .from("orders")
        .select("pizza_count")
        .eq("delivery_date", deliveryDate)
        .eq("slot_time", slotTime)
        .neq("status", "cancelled");
      if (capErr) throw capErr;
      const currentCount = (existing ?? []).reduce((sum: number, o: { pizza_count: number }) => sum + (o.pizza_count || 0), 0);
      if (currentCount + (pizzaCount ?? 0) > 6) {
        return new Response(JSON.stringify({ error: "Aquesta franja horària ja està completa. Si us plau, tria una altra franja." }), {
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
        slot_time:      slotTime ?? null,
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

    return new Response(JSON.stringify({ orderId: order.id }), {
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
