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
    const { orderId, clientSecret } = await req.json();
    if (typeof orderId !== "string" || !orderId) {
      return json({ error: "Falta orderId." }, 400);
    }

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
    if (order.payment_status !== "processing") {
      return json({ released: false, reason: "not_processing" });
    }

    // Si hi ha PaymentIntent, primer es cancel·la a Stripe: així el client ja
    // no el pot pagar després. Si Stripe diu que ja s'ha cobrat (o s'està
    // cobrant), no toquem la comanda.
    if (typeof clientSecret === "string" && clientSecret.includes("_secret_")) {
      const piId = clientSecret.split("_secret_")[0];
      let pi: Stripe.PaymentIntent | null = null;
      try {
        pi = await stripe.paymentIntents.retrieve(piId);
      } catch (err) {
        console.error("[release-pending-order] no s'ha pogut llegir el PaymentIntent", piId, err);
      }
      if (pi) {
        if (pi.metadata?.order_id !== orderId) {
          return json({ released: false, reason: "mismatch" }, 403);
        }
        if (!CANCELABLE.includes(pi.status)) {
          return json({ released: false, reason: pi.status });
        }
        try {
          await stripe.paymentIntents.cancel(piId);
        } catch (err) {
          console.error("[release-pending-order] no s'ha pogut cancel·lar", piId, err);
          return json({ released: false, reason: "cancel_failed" });
        }
      }
    }

    const { error: updErr } = await sb
      .from("orders")
      .update({ payment_status: "failed", status: "cancelled" })
      .eq("id", orderId)
      .eq("payment_status", "processing");
    if (updErr) throw updErr;

    return json({ released: true });
  } catch (err) {
    console.error("[release-pending-order]", err);
    return json({ error: err instanceof Error ? err.message : "Error desconegut" }, 500);
  }
});
