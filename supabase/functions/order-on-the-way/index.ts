import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendOnTheWayEmail } from "../_shared/email.ts";

// Email "la teva comanda és en camí". cocina.html la crida just després de
// passar unes comandes a "En repartiment" (out_for_delivery).
//
// Només la pot fer servir el personal de cuina (taula staff). Cos:
//   { orderIds: string[] }
// Cada comanda rep l'email com a molt una vegada: es "reserva" posant
// on_the_way_email_sent_at abans d'enviar (així dos tocs alhora no l'envien
// dues vegades) i, si l'enviament falla, es torna a deixar buida.

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  try {
    // Només personal de cuina
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await sb.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Cal iniciar sessió a cuina." }, 401);
    const { data: staffRow } = await sb.from("staff").select("auth_user_id").eq("auth_user_id", userId).maybeSingle();
    if (!staffRow) return json({ error: "Només el personal de cuina pot avisar els clients." }, 403);

    const body = await req.json().catch(() => ({}));
    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 50)
      : [];
    if (!orderIds.length) return json({ sent: 0 });

    const { data: claimed, error } = await sb.from("orders")
      .update({ on_the_way_email_sent_at: new Date().toISOString() })
      .in("id", orderIds)
      .eq("status", "out_for_delivery")
      .is("on_the_way_email_sent_at", null)
      .select("id, total, payment_method, customers(name, email), addresses(street, floor, postal_code, city)");
    if (error) throw new Error(error.message);

    let sent = 0;
    for (const order of claimed ?? []) {
      const cust = (order.customers as { name: string; email: string } | null) ?? { name: "", email: "" };
      const addr = (order.addresses as { street: string; floor: string | null; postal_code: string; city: string } | null) ?? { street: "", floor: null, postal_code: "", city: "" };
      const ok = await sendOnTheWayEmail({
        toEmail: cust.email,
        toName: cust.name,
        total: Number(order.total),
        paymentMethod: order.payment_method as string,
        address: { street: addr.street, floor: addr.floor, postalCode: addr.postal_code, city: addr.city },
      });
      if (ok) sent++;
      else await sb.from("orders").update({ on_the_way_email_sent_at: null }).eq("id", order.id);
    }
    return json({ sent });
  } catch (err) {
    console.error("[order-on-the-way]", err);
    return json({ error: err instanceof Error ? err.message : "Error desconegut" }, 500);
  }
});
