// backend/pdf/invoicePdf.cjs
// Requiere: npm i pdfkit

const fs = require("fs");
const PDFDocument = require("pdfkit");

function moneyCO(n) {
  const v = Number(n || 0);
  return v.toLocaleString("es-CO");
}

function padInvoice(n, width = 6) {
  return String(n).padStart(width, "0");
}

function safeText(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function formatIssued(isoLike) {
  const d = new Date(isoLike);
  if (isNaN(d.getTime())) return safeText(isoLike);
  const date = d.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Trunca texto para que NO haga wrap (clave para que TODO quepa en 1 página siempre)
 */
function truncateToWidth(doc, text, maxWidth) {
  const t = safeText(text);
  if (maxWidth <= 0) return "";
  if (doc.widthOfString(t) <= maxWidth) return t;

  const ell = "…";
  const ellW = doc.widthOfString(ell);
  if (ellW >= maxWidth) return "";

  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const sub = t.slice(0, mid);
    if (doc.widthOfString(sub) + ellW <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return t.slice(0, lo) + ell;
}

/**
 * items esperado:
 * [
 *  {
 *    productName, price,
 *    carry_qty, r1_qty, r2_qty, r3_qty,   // ✅ desglose guardado en BD
 *    available_qty, final_qty, changes_qty, billed_qty,
 *    line_total, commissionExempt, sortOrder
 *  }
 * ]
 *
 * invoice esperado:
 * { id, seller_id, sellerName, issued_at, commission_percent, subtotal, exempt_total, commission_base, commission_value, changes_total, payable_total }
 *
 * ✅ OBJETIVO: SIEMPRE 1 página, SIEMPRE todos los productos.
 */
async function generateInvoicePdfToFile({ outPath, companyName, logoPath, invoice, items }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 22, bottom: 20, left: 22, right: 22 },
        info: {
          Title: `FACTURA ${padInvoice(invoice.id)}`,
          Author: companyName || "Sistema",
        },
      });

      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);

      const page = () => doc.page;
      const startX = doc.page.margins.left;
      const contentW = () => page().width - doc.page.margins.left - doc.page.margins.right;
      const topY = doc.page.margins.top;
      const bottomY = () => page().height - doc.page.margins.bottom;

      function hr(y, color = "#e6e6e6") {
        doc
          .save()
          .strokeColor(color)
          .lineWidth(1)
          .moveTo(startX, y)
          .lineTo(startX + contentW(), y)
          .stroke()
          .restore();
      }

      // ---------------- HEADER (compacto) ----------------
      let y = topY;

      const headerH = 48;
      const logoW = 92;
      const logoH = 38;

      if (logoPath && fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, startX, y + 4, { fit: [logoW, logoH] });
        } catch {}
      }

      const rightBoxW = 160;
      const rightX = startX + contentW() - rightBoxW;

      doc
        .save()
        .roundedRect(rightX, y + 2, rightBoxW, 42, 7)
        .strokeColor("#d9d9d9")
        .lineWidth(1)
        .stroke()
        .restore();

      const issuedStr = formatIssued(invoice.issued_at);

      doc.font("Helvetica").fontSize(8).fillColor("#333333").text("FACTURA", rightX + 10, y + 7);
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#111111")
        .text(`# ${padInvoice(invoice.id)}`, rightX + 10, y + 17);
      doc.font("Helvetica").fontSize(8).fillColor("#555555").text(issuedStr, rightX + 10, y + 30, {
        width: rightBoxW - 20,
      });

      const companyX = startX + logoW + 10;
      const companyW = contentW() - (logoW + 10) - rightBoxW - 10;

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#111111")
        .text(safeText(companyName || "INDUSTRIA BIZCOPAN ZAPATOCA"), companyX, y + 6, { width: companyW, align: "left" });
      doc.font("Helvetica").fontSize(8).fillColor("#444444").text("LIQUIDACIÓN INTERNA", companyX, y + 24, {
        width: companyW,
      });

      y += headerH;
      hr(y);
      y += 8;

      // ---------------- VENDEDOR (compacto) ----------------
      const sellerH = 22;

      doc
        .save()
        .roundedRect(startX, y, contentW(), sellerH, 8)
        .strokeColor("#d9d9d9")
        .lineWidth(1)
        .stroke()
        .restore();

      doc.font("Helvetica").fontSize(8).fillColor("#444444").text("VENDEDOR:", startX + 10, y + 7);

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#111111")
        .text(safeText(invoice.sellerName || ""), startX + 62, y + 6, {
          width: contentW() - 72,
          align: "left",
        });

      y += sellerH + 8;

      // ---------------- TABLA (ADAPTATIVA) ----------------
      // ✅ Cols: Producto | $ | Inicial | (Recargas x3) | Final | Cambio | Total | Total $
      const tableCols = [
        { key: "productName", label: "DESCRIPCIÓN", w: 160, align: "left" },
        { key: "price", label: "$", w: 44, align: "left" },

        { key: "carry_qty", label: "INV. INI.", w: 50, align: "right" },
        { key: "r1_qty", label: "", w: 30, align: "right" }, // (sin label, va bajo Recargas)
        { key: "r2_qty", label: "", w: 30, align: "right" },
        { key: "r3_qty", label: "", w: 30, align: "right" },

        { key: "final_qty", label: "INV. FIN.", w: 65, align: "right" },
        { key: "changes_qty", label: "CAMBIO", w: 50, align: "right" },
        { key: "billed_qty", label: "TOTAL", w: 50, align: "right" },
        { key: "line_total", label: "TOTAL $", w: 60, align: "right" },
      ];

      // Ajuste de anchos al page width
      const baseW = tableCols.reduce((s, c) => s + c.w, 0);
      const scale = contentW() / baseW;
      tableCols.forEach((c) => (c.w = Math.floor(c.w * scale)));

      // Bloques inferiores (resumen + firma)
      const bottomBlockH = 118;

      // Altura disponible para tabla
      const tableHeaderH = 18;
      const tableAvailableH = (bottomY() - bottomBlockH) - y;

      const n = Math.max(1, items.length);

      // Altura/fuente adaptativas
      const rowH = clamp(Math.floor((tableAvailableH - tableHeaderH) / n), 9, 16);
      const tableFont = clamp(rowH - 2, 6, 9);
      const headFont = clamp(tableFont, 7, 9);

      // Posiciones X por columna
      const colX = [];
      {
        let cx = startX;
        for (let i = 0; i < tableCols.length; i++) {
          colX.push(cx);
          cx += tableCols[i].w;
        }
      }

      // Bloques a resaltar:
      // - Recargas: columnas 3,4,5 (r1,r2,r3) => indexes 3..5
      const rechargeStartIdx = 3;
      const rechargeEndIdx = 5;
      const rechargeX = colX[rechargeStartIdx];
      const rechargeW =
        tableCols[rechargeStartIdx].w +
        tableCols[rechargeStartIdx + 1].w +
        tableCols[rechargeEndIdx].w;

      // - Total $: última columna (index 9)
      const totalMoneyIdx = tableCols.length - 1;
      const totalMoneyX = colX[totalMoneyIdx];
      const totalMoneyW = tableCols[totalMoneyIdx].w;

      // Colores (elige tú, yo los dejo sobrios)
      const headerBg = "#f2f2f2";
      const headerRechargeBg = "#f2f2f2"; // más oscuro para “bloque recargas”
      const headerTotalBg = "#f2f2f2"; // leve diferencia para el último bloque
      const bodyRechargeBg = "#f0f2f6"; // suave, para diferenciar columnas recargas en TODAS las filas
      const bodyTotalBg = "#f0f2f6"; // suave para Total $

      // Header base
      doc.save().roundedRect(startX, y, contentW(), tableHeaderH, 7).fillColor(headerBg).fill().restore();

      // Header: pintar bloque recargas + bloque total $
      doc.save().rect(rechargeX, y, rechargeW, tableHeaderH).fillColor(headerRechargeBg).fill().restore();
      doc.save().rect(totalMoneyX, y, totalMoneyW, tableHeaderH).fillColor(headerTotalBg).fill().restore();

      // Líneas separadoras del header (para que el bloque se “sienta” como sección)
      doc
        .save()
        .strokeColor("#e3e6ee")
        .lineWidth(1)
        .moveTo(rechargeX, y)
        .lineTo(rechargeX, y + tableHeaderH)
        .stroke()
        .moveTo(rechargeX + rechargeW, y)
        .lineTo(rechargeX + rechargeW, y + tableHeaderH)
        .stroke()
        .restore();

      doc
        .save()
        .strokeColor("#e3e6ee")
        .lineWidth(1)
        .moveTo(totalMoneyX, y)
        .lineTo(totalMoneyX, y + tableHeaderH)
        .stroke()
        .restore();

      // Labels header:
      // - Todas normales (menos r1/r2/r3)
      // - Recargas: texto único centrado sobre el ancho combinado (misma fila)
      doc.font("Helvetica-Bold").fontSize(headFont).fillColor("#111111");

      // Labels normales
      for (let i = 0; i < tableCols.length; i++) {
        // saltar r1 r2 r3: no queremos verlos
        if (i >= rechargeStartIdx && i <= rechargeEndIdx) continue;

        const c = tableCols[i];
        const label = truncateToWidth(doc, c.label, c.w - 8);
        doc.text(label, colX[i] + 4, y + 4, { width: c.w - 8, align: c.align });
      }

      // Label unificado: "Recargas" (misma fila, centrado)
      doc
        .font("Helvetica-Bold")
        .fontSize(headFont)
        .fillColor("#111111")
        .text("CANT.", rechargeX, y + 4, { width: rechargeW, align: "center" });

      y += tableHeaderH;

      // Filas (sin wrap)
      const sorted = [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      doc.font("Helvetica").fontSize(tableFont).fillColor("#111111");

      for (let i = 0; i < sorted.length; i++) {
        const it = sorted[i];

        // pintar bloque recargas (toda la fila) + bloque Total $
        doc.save().rect(rechargeX, y, rechargeW, rowH).fillColor(bodyRechargeBg).fill().restore();
        doc.save().rect(totalMoneyX, y, totalMoneyW, rowH).fillColor(bodyTotalBg).fill().restore();

        // separador horizontal suave
        doc
          .save()
          .strokeColor("#e3e6ee")
          .lineWidth(1)
          .moveTo(startX, y + rowH)
          .lineTo(startX + contentW(), y + rowH)
          .stroke()
          .restore();

        // separadores verticales sutiles para marcar los bloques
        doc
          .save()
          .strokeColor("#e3e6ee")
          .lineWidth(1)
          .moveTo(rechargeX, y)
          .lineTo(rechargeX, y + rowH)
          .stroke()
          .moveTo(rechargeX + rechargeW, y)
          .lineTo(rechargeX + rechargeW, y + rowH)
          .stroke()
          .restore();

        doc
          .save()
          .strokeColor("#e3e6ee")
          .lineWidth(1)
          .moveTo(totalMoneyX, y)
          .lineTo(totalMoneyX, y + rowH)
          .stroke()
          .restore();

        const ty = y + Math.max(1, Math.floor((rowH - tableFont) / 2));

        // Producto (marca exento con (E), pero sin wrap)
        const isEx = Number(it.commissionExempt || 0) === 1;
        const nameBase = safeText(it.productName) + (isEx ? " (E)" : "");
        const name = truncateToWidth(doc, nameBase, tableCols[0].w - 8);
        doc.text(name, colX[0] + 4, ty, { width: tableCols[0].w - 8, align: "left" });

        doc.text(moneyCO(it.price), colX[1] + 4, ty, { width: tableCols[1].w - 8, align: "left" });

        doc.text(String(it.carry_qty ?? 0), colX[2] + 4, ty, { width: tableCols[2].w - 8, align: "right" });

        // Recargas (tres columnas, números normales)
        doc.text(String(it.r1_qty ?? 0), colX[3] + 4, ty, { width: tableCols[3].w - 8, align: "right" });
        doc.text(String(it.r2_qty ?? 0), colX[4] + 4, ty, { width: tableCols[4].w - 8, align: "right" });
        doc.text(String(it.r3_qty ?? 0), colX[5] + 4, ty, { width: tableCols[5].w - 8, align: "right" });

        doc.text(String(it.final_qty ?? 0), colX[6] + 4, ty, { width: tableCols[6].w - 8, align: "right" });
        doc.text(String(it.changes_qty ?? 0), colX[7] + 4, ty, { width: tableCols[7].w - 8, align: "right" });
        doc.text(String(it.billed_qty ?? 0), colX[8] + 4, ty, { width: tableCols[8].w - 8, align: "right" });

        doc.text(moneyCO(it.line_total ?? 0), colX[9] + 4, ty, { width: tableCols[9].w - 8, align: "right" });

        y += rowH;
      }

      y += 6;

      // ---------------- RESUMEN + FIRMA (compactos) ----------------
      const leftW = Math.floor(contentW() * 0.54);
      const rightW = contentW() - leftW - 10;

      const sigX = startX;
      const sumX = startX + leftW + 10;
      const boxY = bottomY() - bottomBlockH;

      // Firma
      doc
        .save()
        .roundedRect(sigX, boxY, leftW, bottomBlockH, 10)
        .strokeColor("#d9d9d9")
        .lineWidth(1)
        .stroke()
        .restore();

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111").text("FIRMA VENDEDOR", sigX + 10, boxY + 8);

      doc.font("Helvetica").fontSize(7).fillColor("#444444").text("ACEPTO LA LIQUIDACIÓN.", sigX + 10, boxY + 22, {
        width: leftW - 20,
      });

      const lineY = boxY + bottomBlockH - 26;
      doc
        .save()
        .strokeColor("#888888")
        .lineWidth(1)
        .moveTo(sigX + 10, lineY)
        .lineTo(sigX + leftW - 10, lineY)
        .stroke()
        .restore();

      doc.font("Helvetica").fontSize(7).fillColor("#555555").text("NOMBRE / FIRMA", sigX + 10, lineY + 6);

      // Resumen
      doc
        .save()
        .roundedRect(sumX, boxY, rightW, bottomBlockH, 10)
        .strokeColor("#d9d9d9")
        .lineWidth(1)
        .stroke()
        .restore();

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111").text("RESUMEN", sumX + 10, boxY + 8);

      const grossNoExemptNoChanges = Number(invoice.commission_base || 0) + Number(invoice.changes_total || 0);
      const changes = Number(invoice.changes_total || 0);
      const commVal = Number(invoice.commission_value || 0);
      const noExemptAfterComm = Math.max(0, Number(invoice.commission_base || 0) - commVal);
      const exTotals = Number(invoice.exempt_total || 0);
      const totalPay = Number(invoice.payable_total || 0);
      const pct = Number(invoice.commission_percent || 0);

      const labelFont = 7.5;
      const valueFont = 8;

      let sy = boxY + 24;

      function sumLine(label, value, opts = {}) {
        const { negative = false, bold = false } = opts;

        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(labelFont).fillColor("#333333");
        const labelW = rightW - 20 - 72;
        const cleanLabel = truncateToWidth(doc, label, labelW);
        doc.text(cleanLabel, sumX + 10, sy, { width: labelW, align: "left" });

        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(valueFont).fillColor("#111111");
        const prefix = negative ? "- " : "";
        doc.text(`${prefix}$ ${moneyCO(Math.abs(value))}`, sumX + 10, sy, { width: rightW - 20, align: "right" });

        sy += 13;
      }

      sumLine("BASE SIN EXENTOS", grossNoExemptNoChanges, { bold: true });
      sumLine("CAMBIOS", changes, { negative: true });
      sumLine(`COMISIÓN (${pct}%)`, commVal, { negative: true });
      sumLine("TOTAL SIN EXENTOS", noExemptAfterComm, { bold: true });
      sumLine("ROSQUITA Y PUDIN", exTotals);

      const totalY = boxY + bottomBlockH - 30;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
      doc.text("TOTAL", sumX + 10, totalY, { width: rightW - 20 - 90, align: "left" });
      doc.text(`$ ${moneyCO(totalPay)}`, sumX + 10, totalY, { width: rightW - 20, align: "right" });

      // Pie
      doc.font("Helvetica").fontSize(6.5).fillColor("#888888");
      doc.text(`Sistema — Factura #${padInvoice(invoice.id)} — ${safeText(companyName)}`, startX, bottomY() - 10, {
        width: contentW(),
        align: "center",
      });

      doc.end();

      stream.on("finish", () => resolve(true));
      stream.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateInvoicePdfToFile };
