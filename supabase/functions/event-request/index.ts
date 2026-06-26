import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Email del propietari del negoci que ha de rebre l'avís de cada nova
// petició de pressupost (formulari "Demana el teu pressupost" a
// micsas-events.html).
const CLIENT_NOTIFICATION_EMAIL = "polbonastre@gmail.com";

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

    const { nom, telefon, email, data, convidats, detalls } = await req.json();

    if (!nom || !telefon || !email) {
      return new Response(JSON.stringify({ error: "Falten dades obligatòries." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Desa la petició — així mai es perd encara que l'email de notificació
    // falli o no s'hagi configurat RESEND_API_KEY.
    const { error: insertErr } = await sb.from("event_requests").insert({
      nom,
      telefon,
      email,
      data_event: data || null,
      convidats: convidats ?? null,
      detalls: detalls || null,
    });
    if (insertErr) throw insertErr;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Micsas FF <onboarding@resend.dev>",
          to: [CLIENT_NOTIFICATION_EMAIL],
          subject: `Nova petició de pressupost — ${nom}`,
          html: `
            <h2>Nova petició de pressupost per a un esdeveniment</h2>
            <p><strong>Nom:</strong> ${nom}</p>
            <p><strong>Telèfon:</strong> ${telefon}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Data de l'event:</strong> ${data || "No especificada"}</p>
            <p><strong>Nombre de convidats:</strong> ${convidats || "No especificat"}</p>
            <p><strong>Detalls:</strong><br>${(detalls || "—").replace(/\n/g, "<br>")}</p>
          `,
        }),
      });
      if (!emailRes.ok) {
        // No fem throw: la petició ja s'ha desat a la BD encara que l'email falli.
        console.error("[event-request] Resend error", await emailRes.text());
      }
    } else {
      console.warn("[event-request] RESEND_API_KEY no configurada — s'omet la notificació per email");
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconegut";
    console.error("[event-request]", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
