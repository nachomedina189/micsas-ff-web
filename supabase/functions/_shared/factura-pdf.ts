// PDF de la factura simplificada del pase, calcat al model que fa servir
// en Pol (FACTURA SIMPLIFICADA 2026080, fet amb Google Docs): A4, Arial
// 11 pt i títol de 16 pt. Helvetica té les mateixes mides de lletra que
// Arial, així que totes les posicions són les del model en punts.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";

export interface InvoiceData {
  number: number;
  date: string;          // YYYY-MM-DD
  concept: string;
  base: number;
  vat: number;
  total: number;
  vatRate: number;       // 0.10
  issuerName: string;
  issuerNif: string;
  issuerAddress: string;
  issuerCity: string;
  paymentDays: number;
  iban: string;
}

const PAGE_W = 596, PAGE_H = 842;
const SIZE = 11, TITLE_SIZE = 16;
const ASCENT = 0.905;               // Arial: de dalt de la caixa a la línia base
const RIGHT = 523.28;               // marge dret del bloc de l'emissor
const BLACK = rgb(0, 0, 0);

export const invoiceFilename = (inv: Pick<InvoiceData, "number">) => `FACTURA SIMPLIFICADA ${inv.number}.pdf`;
const money = (n: number) => `${n.toFixed(2)}€`;
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export async function renderInvoicePdf(inv: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`FACTURA SIMPLIFICADA ${inv.number}`);
  doc.setProducer("micsas.ff");
  doc.setCreator("micsas.ff");
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  // `top` és la part de dalt de la línia de text, com la mesura pdftotext.
  const text = (s: string, x: number, top: number, font: PDFFont = regular, size = SIZE) =>
    page.drawText(s, { x, y: PAGE_H - (top + ASCENT * size), size, font, color: BLACK });
  // Amplada lletra a lletra: widthOfTextAtSize hi resta el kerning, però
  // drawText no l'aplica, i el text acabaria passant del marge.
  const width = (s: string, font: PDFFont) => [...s].reduce((w, ch) => w + font.widthOfTextAtSize(ch, SIZE), 0);
  const textRight = (s: string, right: number, top: number, font: PDFFont = regular) =>
    text(s, right - width(s, font), top, font);

  // Emissor, alineat a la dreta
  [inv.issuerName, inv.issuerNif, inv.issuerAddress, inv.issuerCity]
    .forEach((line, i) => textRight(line, RIGHT, 72.36 + i * 14.5463));

  // Títol, número i data
  text("FACTURA SIMPLIFICADA", 72, 151.87, boldItalic, TITLE_SIZE);
  text(`Nº: ${inv.number}`, 72, 172.86);
  text(`Fecha: ${ddmmyyyy(inv.date)}`, 72, 187.41);

  // Línia de la factura
  const pct = `IVA (${Math.round(inv.vatRate * 100)}%)`;
  text("Descripción", 72, 231.05, bold);
  text("Base", 288, 231.05, bold);
  text(pct, 360, 231.05, bold);
  text("Total", 468, 231.05, bold);
  text(inv.concept, 72, 260.14);
  text(money(inv.base), 288, 260.14);
  textRight(money(inv.vat), 408.89, 260.14);
  textRight(money(inv.total), 499.22, 260.14);

  // Quadre resum
  drawSummaryGrid(page);
  text("Base", 77.25, 542.52, bold);
  text(pct, 227.25, 542.52, bold);
  text("Total Factura", 377.25, 542.52, bold);
  text(money(inv.base), 77.25, 598.02);
  text(money(inv.vat), 227.25, 598.02);
  text(money(inv.total), 377.25, 598.02);

  // Forma de pagament
  text(`El pago se realizará en un plazo de ${inv.paymentDays} días desde la emisión de esta factura, se realizará`, 72, 691.30);
  text("mediante transferencia bancaria.", 72, 705.84);
  text(`IBAN: ${inv.iban}`, 72, 720.39, bold);

  return await doc.save();
}

// Quadre de 3 columnes amb vores d'1 pt, a les mateixes coordenades que el model.
function drawSummaryGrid(page: PDFPage) {
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: PAGE_H - y1 }, end: { x: x2, y: PAGE_H - y2 }, thickness: 1, color: BLACK });
  for (const x of [72.5, 222.5, 372.5, 522.5]) line(x, 536.0, x, 618.0);
  for (const y of [536.5, 591.5, 617.5]) line(72, y, 522, y);
}

// Base64 per adjuntar el PDF al correu (Resend).
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
