// Email de confirmació de comanda, enviat via Resend (https://resend.com).
// Es crida des de dos llocs, cadascun quan la comanda realment queda
// CONFIRMADA (mateix criteri que fem servir a cocina.html per mostrar-la
// al tauler — veure isPaymentConfirmed):
//   - place-order: per a comandes en efectiu, just en crear-se (no hi ha
//     pagament online pel mig).
//   - stripe-webhook: per a comandes amb targeta, quan Stripe confirma el
//     cobrament real (payment_intent.succeeded) — mai abans.
//
// Un error enviant l'email NO ha de trencar mai la comanda ni el pagament
// — sempre es fa un try/catch i només es registra l'error a la consola.

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "micsas.ff <pedidos@micsasff.com>";
const INSTAGRAM_URL = "https://instagram.com/micsas.ff";
const LOGO_URL = "https://micsasff.com/logo%20micsas.png";

export interface OrderEmailItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  notes?: string | null;
}

export interface OrderEmailData {
  toEmail: string | null | undefined;
  toName: string;
  items: OrderEmailItem[];
  total: number;
  paymentMethod: string; // 'cash' | 'card_delivery'
  deliveryDate: string;  // YYYY-MM-DD
  slotTime: string | null;
  address: {
    street: string;
    floor?: string | null;
    postalCode: string;
    city: string;
  };
}

function fmtEuro(n: number): string {
  return (Number(n) || 0).toFixed(2).replace(".", ",") + " €";
}

function fmtDeliveryDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const label = d.toLocaleDateString("ca-ES", { weekday: "long", day: "2-digit", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildOrderConfirmationHtml(data: OrderEmailData): string {
  const itemsRows = data.items.map((it) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #E6D5B0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2A1A0F;">
        ${escapeHtml(it.quantity)}× ${escapeHtml(it.product_name)}
        ${it.notes ? `<br><span style="font-size:12px;color:#9B8A72;">${escapeHtml(it.notes)}</span>` : ""}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #E6D5B0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2A1A0F;text-align:right;white-space:nowrap;">
        ${fmtEuro(it.unit_price * it.quantity)}
      </td>
    </tr>`).join("");

  const addressLine1 = [data.address.street, data.address.floor].filter(Boolean).map(escapeHtml).join(", ");
  const addressLine2 = [data.address.postalCode, data.address.city].filter(Boolean).map(escapeHtml).join(" ");
  const paymentLabel = data.paymentMethod === "cash" ? "Efectiu al repartidor" : "Pagat amb targeta";
  const slotLabel = data.slotTime
    ? `${fmtDeliveryDay(data.deliveryDate)} · ${escapeHtml(data.slotTime)}`
    : fmtDeliveryDay(data.deliveryDate);

  return `<!doctype html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comanda confirmada</title>
</head>
<body style="margin:0;padding:0;background-color:#F2E6CE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2E6CE;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background-color:#2A1A0F;padding:28px 32px;text-align:center;">
            <img src="${LOGO_URL}" alt="micsas.ff" width="120" style="display:block;margin:0 auto;max-width:120px;filter:invert(1) brightness(2);">
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#E23F2E;">Comanda confirmada</p>
            <h1 style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:22px;color:#2A1A0F;">Gràcies, ${escapeHtml(data.toName)}!</h1>
            <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#5A3E28;">
              Hem rebut la teva comanda i ja la tenim preparada per al forn. Aquí tens el resum:
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
              ${itemsRows}
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="padding-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#2A1A0F;">Total</td>
                <td style="padding-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#E23F2E;text-align:right;">${fmtEuro(data.total)}</td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7EDD8;border-radius:12px;padding:16px;margin-bottom:28px;">
              <tr><td style="padding:16px 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.04em;color:#9B8A72;">ENTREGA</td></tr>
              <tr><td style="padding:2px 16px 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2A1A0F;">${slotLabel}</td></tr>
              <tr><td style="padding:0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.04em;color:#9B8A72;">ADREÇA</td></tr>
              <tr><td style="padding:2px 16px 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2A1A0F;">${addressLine1}<br>${addressLine2}</td></tr>
              <tr><td style="padding:0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.04em;color:#9B8A72;">PAGAMENT</td></tr>
              <tr><td style="padding:2px 16px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2A1A0F;">${paymentLabel}</td></tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <a href="${INSTAGRAM_URL}" style="display:inline-block;padding:13px 28px;border-radius:999px;background-color:#E23F2E;color:#F2E6CE;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;">
                    Segueix-nos a Instagram @micsas.ff
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px;text-align:center;border-top:1px solid #E6D5B0;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9B8A72;">micsas.ff · Matadepera</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export async function sendOrderConfirmationEmail(data: OrderEmailData): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY no configurada — no s'envia l'email de confirmació.");
    return;
  }
  if (!data.toEmail) {
    console.error("[email] Comanda sense email de client — no s'envia confirmació.");
    return;
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [data.toEmail],
        subject: "Comanda confirmada — micsas.ff",
        html: buildOrderConfirmationHtml(data),
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend ha retornat error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[email] error enviant confirmació", err);
  }
}
