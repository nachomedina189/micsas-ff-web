import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { getCorsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { currency = "eur", orderId } = await req.json();

    if (!orderId) {
      return new Response(JSON.stringify({ error: "Falta orderId." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // L'import a cobrar es llegeix SEMPRE de la comanda ja desada a Supabase
    // (creada per place-order, que ja ha recalculat el total a partir del
    // catàleg real) — mai d'un "amount" enviat pel client en aquesta
    // crida, perquè aquí és exactament on es genera el càrrec real a
    // Stripe: confiar-hi permetia pagar qualsevol import per una comanda
    // de qualsevol valor.
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select("total")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Comanda no trobada." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = Math.round(Number(order.total) * 100);
    if (!amount || amount < 50) {
      return new Response(JSON.stringify({ error: "Import mínim: 0.50 €" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      // Stripe exigeix que els valors de metadata siguin strings.
      metadata: { order_id: String(orderId) },
    });

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[create-payment-intent]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
