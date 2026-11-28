import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { getCorsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

// Estats d'un PaymentIntent en què encara no hi ha hagut cap cobrament i es
// pot cancel·lar sense risc.
const CANCELABLE = ["requires_payment_method", "requires_confirmation", "requires_action"];

// pedido.html la crida quan el client abandona el pagament amb targeta (tanca
// la finestra de Stripe, recarrega la pàgina, falla la creació del pagament...).
// Les comandes online es creen ABANS de pagar ('processing') perquè ocupin
// franja, i Stripe no avisa de res si el client simplement se'n va: sense
// això la comanda seguia ocupant pizzes de la franja fins que algú la
// cancel·lava a mà.
//
// pedido.html també hi envia el motiu (reason: tancat_pel_client,
// pagina_tancada, error_creant_pagament...) i l'últim error que ha vist el
// client (detail): es desa a orders.cancel_reason per poder saber per què no
// s'ha pagat una comanda.
//
// És segura de cridar sempre: si la comanda ja està pagada (o el pagament és
// en marxa) no fa res. I si per una carrera es cancel·lés una comanda que
// després es paga, stripe-webhook la recupera en rebre payment_intent.succeeded.
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { orderId, clientSecret, reason, detail } = await req.json();
    if (typeof orderId !== "string" || !orderId) {
      return json({ error: "Falta orderId." }, 400);
    }
    const why = typeof reason === "string" ? reason.replace(/[^a-z_]/g, "").slice(0, 40) : "";
    const info = typeof detail === "string" ? detail.replace(/[\u0000-\u001f]/g, " ").slice(0, 300) : "";
    console.log("[release-pending-order]", orderId, why || "-", info || "-");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select("id, payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return json({ released: false, reason: "not_found" });

    // Cancel·la el PaymentIntent a Stripe perquè el client ja no el pugui
    // pagar. null = no n'hi ha (o no s'ha pogut llegir); si no és
    // cancel·lable (ja s'ha cobrat o s'està cobrant) en retorna l'estat.
    const hasSecret = typeof clientSecret === "string" && clientSecret.includes("_secret_");
    async function cancelPi(): Promise<string | null> {
      if (!hasSecret) return null;
      const piId = (clientSecret as string).split("_secret_")[0];
      let pi: Stripe.PaymentIntent | null = null;
      try {
        pi = await stripe.paymentIntents.retrieve(piId);
      } catch (err) {
        console.error("[release-pending-order] no s'ha pogut llegir el PaymentIntent", piId, err);
      }
      if (!pi) return null;
      if (pi.metadata?.order_id !== orderId) return "mismatch";
      if (!CANCELABLE.includes(pi.status)) return pi.status;
      try {
        await stripe.paymentIntents.cancel(piId);
        return "canceled";
      } catch (err) {
        console.error("[release-pending-order] no s'ha pogut cancel·lar", piId, err);
        return "cancel_failed";
      }
    }

    if (order.payment_status !== "processing") {
      // Ja alliberada (p. ex. el client ha tancat la finestra mentre es
      // creava el pagament) i el PaymentIntent ha arribat després: també es
      // cancel·la, perquè no es pugui pagar una comanda cancel·lada.
      if (order.payment_status === "failed") await cancelPi();
      return json({ released: false, reason: "not_processing" });
    }

    // Primer Stripe: si diu que ja s'ha cobrat (o s'està cobrant), no toquem
    // la comanda.
    const piResult = await cancelPi();
    if (piResult === "mismatch") return json({ released: false, reason: "mismatch" }, 403);
    if (piResult && piResult !== "canceled") return json({ released: false, reason: piResult });

    const { error: updErr } = await sb
      .from("orders")
      .update({ payment_status: "failed", status: "cancelled", cancel_reason: [why, info].filter(Boolean).join(": ") || null })
      .eq("id", orderId)
      .eq("payment_status", "processing");
    if (updErr) throw updErr;

    return json({ released: true });
  } catch (err) {
    console.error("[release-pending-order]", err);
    return json({ error: err instanceof Error ? err.message : "Error desconegut" }, 500);
  }
});
