import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Aquesta funció rep trucades directes de Stripe (no del navegador), per
// això no porta capçaleres CORS ni comprova l'apikey de Supabase — cal
// desplegar-la amb `verify_jwt = false` (veure supabase/config.toml).
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    // constructEventAsync (no constructEvent) perquè Deno fa servir
    // SubtleCrypto asíncron per verificar la firma.
    event = await stripe.webhooks.constructEventAsync(body, signature ?? "", webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error("[stripe-webhook] signatura invàlida:", err instanceof Error ? err.message : err);
    return new Response("Invalid signature", { status: 400 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    switch (event.type) {
      // Confirmació real del cobrament: aquí (i només aquí) marquem la
      // comanda com a pagada. La comanda ja existeix (creada en estat
      // 'processing' abans de confirmar el pagament, veure pedido.html
      // createPendingOrderAndIntent) — no la creem des d'aquí.
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          const { error } = await sb.from("orders").update({ payment_status: "paid" }).eq("id", orderId);
          if (error) console.error("[stripe-webhook] error marcant pagada", orderId, error);
        }
        break;
      }

      // Pagament fallit o intent caducat (Stripe cancel·la automàticament
      // els PaymentIntents no confirmats al cap de 24h): cancel·lem la
      // comanda perquè no ocupi franja ni aparegui a cuina. Només toquem
      // comandes que encara estan "processing" — si per qualsevol carrera
      // ja s'ha marcat "paid" abans, no la toquem.
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          const { error } = await sb.from("orders")
            .update({ payment_status: "failed", status: "cancelled" })
            .eq("id", orderId)
            .eq("payment_status", "processing");
          if (error) console.error("[stripe-webhook] error cancel·lant", orderId, error);
        }
        break;
      }

      default:
        // Ignorem la resta d'esdeveniments (no els hem subscrit al dashboard,
        // però si Stripe n'envia algun altre no cal que fallem).
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook]", err);
    // 200 igualment: si retornem error Stripe reintentarà indefinidament
    // amb el mateix event ja processat parcialment. Ja hem loguejat l'error.
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
