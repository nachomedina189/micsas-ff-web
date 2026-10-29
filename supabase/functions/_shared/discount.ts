import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Codis de descompte (taula discount_codes, veure
// migrations/20261029120000_discount_codes_and_surname.sql). Ho fan servir
// place-order (que és qui de veritat aplica el descompte a l'import de la
// comanda i, per tant, al que es cobra a Stripe) i check-discount-code (que
// només ensenya al client quant es descomptarà abans de pagar).

export type DiscountResult =
  | { ok: true; code: string; kind: "percent" | "fixed"; value: number; amount: number }
  | { ok: false; error: string };

export function normalizeCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

// `subtotal` és el de pizzes i begudes, sense propina. L'import descomptat
// mai supera el subtotal.
export async function resolveDiscount(
  sb: ReturnType<typeof createClient>,
  rawCode: unknown,
  subtotal: number,
): Promise<DiscountResult> {
  const code = normalizeCode(rawCode);
  const invalid = { ok: false as const, error: "Aquest codi de descompte no és vàlid." };
  if (code.length < 3 || code.length > 30) return invalid;

  const { data: row, error } = await sb
    .from("discount_codes")
    .select("code, kind, value, active, starts_at, expires_at, min_subtotal, max_uses")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("[discount] discount_codes", error.message);
    return { ok: false, error: "No s'ha pogut comprovar el codi. Torna-ho a provar." };
  }
  if (!row || !row.active) return invalid;

  const now = Date.now();
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return invalid;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) {
    return { ok: false, error: "Aquest codi de descompte ha caducat." };
  }

  const minSubtotal = Number(row.min_subtotal) || 0;
  if (subtotal < minSubtotal) {
    return { ok: false, error: `Aquest codi és per a comandes a partir de ${minSubtotal.toFixed(2).replace(".", ",")} €.` };
  }

  // Usos: comandes amb aquest codi que no han fallat (una comanda online
  // abandonada passa a 'failed' i deixa de comptar).
  if (row.max_uses) {
    const { count, error: cErr } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("discount_code", code)
      .neq("payment_status", "failed");
    if (cErr) console.error("[discount] usos", cErr.message);
    if ((count ?? 0) >= row.max_uses) {
      return { ok: false, error: "Aquest codi de descompte ja s'ha esgotat." };
    }
  }

  const value = Number(row.value);
  const raw = row.kind === "percent" ? subtotal * value / 100 : value;
  const amount = Math.round(Math.min(subtotal, Math.max(0, raw)) * 100) / 100;
  return { ok: true, code, kind: row.kind, value, amount };
}
