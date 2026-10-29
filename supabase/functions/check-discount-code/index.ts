import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resolveDiscount } from "../_shared/discount.ts";

// Comprova un codi de descompte des del checkout de pedido.html, per
// ensenyar-ne l'import abans de pagar. Només és informatiu: el subtotal ve
// del client i aquí no es desa res. El descompte que compta de veritat el
// torna a calcular place-order amb el subtotal real del catàleg.
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { code, subtotal } = await req.json();
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const result = await resolveDiscount(sb, code, Math.max(0, Number(subtotal) || 0));
    if (!result.ok) return json({ valid: false, error: result.error });
    return json({ valid: true, code: result.code, kind: result.kind, value: result.value, amount: result.amount });
  } catch (err) {
    console.error("[check-discount-code]", err);
    return json({ valid: false, error: "No s'ha pogut comprovar el codi. Torna-ho a provar." }, 500);
  }
});
