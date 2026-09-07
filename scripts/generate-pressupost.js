const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  HeadingLevel,
} = require("docx");

const TERRACOTTA = "A8312A";
const GREY = "777777";
const LIGHT_GREY_FILL = "F2F2F2";
const FONT = "Arial";

const cmToTwip = (cm) => Math.round((cm * 1440) / 2.54);

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const softBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
};

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text, font: FONT, size: 21, color: opts.color, italics: opts.italics, bold: opts.bold }),
    ],
  });
}

function noteText(text) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text, font: FONT, size: 19, color: GREY, italics: true })],
  });
}

function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: TERRACOTTA })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: FONT, size: 21 })],
  });
}

function priceTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((r) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            borders: softBorder,
            shading: r.highlight
              ? { type: ShadingType.CLEAR, fill: TERRACOTTA }
              : { type: ShadingType.CLEAR, fill: LIGHT_GREY_FILL },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: r.label,
                    font: FONT,
                    size: 21,
                    bold: r.highlight,
                    color: r.highlight ? "FFFFFF" : "1A1A1A",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            borders: softBorder,
            shading: r.highlight
              ? { type: ShadingType.CLEAR, fill: TERRACOTTA }
              : { type: ShadingType.CLEAR, fill: LIGHT_GREY_FILL },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: r.value,
                    font: FONT,
                    size: 22,
                    bold: true,
                    color: r.highlight ? "FFFFFF" : "1A1A1A",
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    ),
  });
}

function partyCell(title, lines) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: noBorder,
    margins: { top: 80, bottom: 80, left: 0, right: 200 },
    children: [
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: title, font: FONT, size: 19, bold: true, color: TERRACOTTA })],
      }),
      ...lines.map(
        (l) =>
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: l, font: FONT, size: 20 })],
          })
      ),
    ],
  });
}

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          size: { width: cmToTwip(21), height: cmToTwip(29.7) },
          margin: {
            top: cmToTwip(2.5),
            bottom: cmToTwip(2.5),
            left: cmToTwip(2.5),
            right: cmToTwip(2.5),
          },
        },
      },
      children: [
        // Header
        new Paragraph({
          children: [new TextRun({ text: "PRESSUPOST", font: FONT, size: 40, bold: true, color: TERRACOTTA })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: "Disseny i desenvolupament de lloc web", font: FONT, size: 22, color: "444444" }),
          ],
        }),
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: "Nº de pressupost: ", font: FONT, size: 20, bold: true }),
            new TextRun({ text: "[NÚM]", font: FONT, size: 20 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: "Data: ", font: FONT, size: 20, bold: true }),
            new TextRun({ text: "[DATA]", font: FONT, size: 20 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 280 },
          children: [
            new TextRun({ text: "Validesa: ", font: FONT, size: 20, bold: true }),
            new TextRun({ text: "30 dies", font: FONT, size: 20 }),
          ],
        }),

        // Parties block
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                partyCell("Prestador", [
                  "[El teu nom i cognoms]",
                  "UnitedOps",
                  "NIF [El teu NIF]",
                  "[Email] · [Telèfon]",
                ]),
                partyCell("Client", [
                  "[Nom del client]",
                  "Micsas FF",
                  "NIF/CIF [NIF del client]",
                  "[Email] · [Telèfon]",
                ]),
              ],
            }),
          ],
        }),

        // 1. Projecte web
        sectionHeading("1. Projecte web (pagament únic)"),
        bullet("Lloc web complet i en producció amb 11 pàgines: inici, carta/menú, pre-pedido i pedido (procés de comanda), compte d'usuari, pantalla de cuina per al personal, pàgina d'esdeveniments/càtering i les quatre pàgines legals (avís legal, privacitat, cookies, termes)."),
        bullet("Sistema de comandes complet: selecció de productes amb personalització d'ingredients i al·lèrgies, càlcul de comanda, validació d'adreça i franja horària de lliurament (intervals de 15 minuts), i generació automàtica d'identificador de comanda."),
        bullet("Passarel·la de pagament integrada amb Stripe (Payment Intents) per al cobrament en línia de les comandes."),
        bullet("Compte d'usuari amb perfil editable i historial de comandes, amb opció de repetir una comanda anterior."),
        bullet("Pantalla de cuina (KDS) per al personal, amb autenticació pròpia, agrupació de comandes per client i franja horària, i filtratge per dates."),
        bullet("Formulari d'esdeveniments i càtering, amb desament a base de dades i notificació per correu."),
        bullet("Backend complet a Supabase (base de dades, autenticació i funcions de servidor) per gestionar clients, adreces, comandes i sol·licituds d'esdeveniments."),
        bullet("Disseny responsive, adaptat a mòbil, tauleta i ordinador."),
        bullet("Lloc bilingüe (català/castellà) amb selector d'idioma."),
        bullet("Allotjament i desplegament continu a Vercel."),
        new Paragraph({ spacing: { before: 120, after: 160 }, children: [] }),
        priceTable([
          { label: "Valor de mercat d'un desenvolupament equivalent", value: "5.000 – 6.000 €", highlight: false },
          { label: "Preu per a tu (tarifa d'amic i primer projecte)", value: "850 €", highlight: true },
        ]),
        noteText(
          "Preu tancat, molt per sota del valor de mercat, en agraïment per l'oportunitat i per ser el primer projecte."
        ),

        // 2. Manteniment
        sectionHeading("2. Manteniment mensual"),
        bodyText(
          "Una web amb backend, passarel·la de pagament i domini necessita manteniment continu per seguir funcionant de manera segura i fiable."
        ),
        bullet("Allotjament/domini i supervisió tècnica."),
        bullet("Actualitzacions de seguretat."),
        bullet("Còpies de seguretat i monitorització."),
        bullet("Petits canvis mensuals (preus, fotos, horaris, textos)."),
        bullet("Suport prioritari."),
        new Paragraph({ spacing: { before: 120, after: 160 }, children: [] }),
        priceTable([{ label: "Quota de manteniment", value: "20 €/mes", highlight: true }]),
        noteText(
          "Servei opcional, facturat mensualment, cancel·lable amb un mes d'avís. Tarifa reduïda d'amic."
        ),

        // 3. Millores futures
        sectionHeading("3. Millores futures i noves funcionalitats"),
        bodyText(
          "Qualsevol nova funcionalitat, automatització o versió 2 es pressuposta a part, projecte per projecte."
        ),
        bullet("Automatització de l'entrada de comandes a cuina."),
        bullet("Integració completa del pagament en línia."),
        bullet("Nova secció de botiga."),
        bullet("Versió 2 del lloc."),
        bodyText(
          "Com a client habitual s'aplica una tarifa preferent amb un 15% de descompte sobre la tarifa estàndard, i cada millora es presenta amb el seu pressupost sense compromís."
        ),

        // Condicions
        sectionHeading("Condicions"),
        bullet(
          "Forma de pagament: transferència bancària a l'IBAN [EL TEU IBAN] (titular: [El teu nom]); concepte: Web micsas.ff. Import exempt d'IVA i sense retenció d'IRPF."
        ),
        bullet(
          "No inclou: revisió dels textos legals per advocat, creació de contingut addicional ni les millores futures (es pressuposten a part)."
        ),
        bullet("Lliurament: el lloc queda lliurat i en producció a la URL acordada."),

        // Footer
        new Paragraph({ spacing: { before: 600 }, children: [] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: noBorder,
                  margins: { top: 400, right: 200 },
                  children: [
                    new Paragraph({
                      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "999999" } },
                      spacing: { before: 0, after: 60 },
                      children: [new TextRun({ text: " ", font: FONT, size: 20 })],
                    }),
                    new Paragraph({
                      children: [new TextRun({ text: "El prestador", font: FONT, size: 19, italics: true })],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: noBorder,
                  margins: { top: 400, left: 200 },
                  children: [
                    new Paragraph({
                      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "999999" } },
                      spacing: { before: 0, after: 60 },
                      children: [new TextRun({ text: " ", font: FONT, size: 20 })],
                    }),
                    new Paragraph({
                      children: [new TextRun({ text: "El client (acceptació)", font: FONT, size: 19, italics: true })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 500 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "micsas.ff · Made with ♥ by UnitedOps", font: FONT, size: 18, color: GREY }),
          ],
        }),
      ],
    },
  ],
});

const outPath = path.join(__dirname, "..", "Pressupost_micsas_ff.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log("Generated:", outPath, `(${buffer.length} bytes)`);
});
