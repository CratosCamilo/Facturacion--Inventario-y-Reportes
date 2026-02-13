// electron/main.cjs
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const XLSX = require("xlsx");
const { shell } = require("electron");


// PDF generator
const { generateInvoicePdfToFile } = require("../backend/pdf/invoicePdf.cjs");

let mainWindow;

// DB local
const dbPath = path.join(app.getPath("userData"), "app.db");
const db = new Database(dbPath);

/**
 * Asegura que el schema exista SIEMPRE antes de cualquier query.
 * Evita: "no such table: seller"
 */
function ensureSchema() {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='seller'")
    .get();

  if (row) return;

  const schemaPath = path.join(process.cwd(), "backend", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);
}

// Ejecutar schema apenas inicia el main process
ensureSchema();

/* =========================
   Helpers Reportes / Fechas
========================= */

function normalizeFrom(dateLike) {
  if (!dateLike) return null;
  const s = String(dateLike).trim();
  if (!s) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;

  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toISOString();
}

function normalizeTo(dateLike) {
  if (!dateLike) return null;
  const s = String(dateLike).trim();
  if (!s) return null;

  // YYYY-MM-DD inclusive
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T23:59:59.999Z`;

  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toISOString();
}

function buildInvoiceWhere(filters, params) {
  const where = [];
  const { sellerId = null, invoiceId = null, dateFrom = null, dateTo = null } = filters || {};

  if (invoiceId !== null && invoiceId !== undefined && invoiceId !== "") {
    const id = Number(invoiceId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("invoiceId inválido");
    where.push("i.id = ?");
    params.push(id);
  }

  if (sellerId !== null && sellerId !== undefined && sellerId !== "") {
    const sid = Number(sellerId);
    if (!Number.isInteger(sid) || sid <= 0) throw new Error("sellerId inválido");
    where.push("i.seller_id = ?");
    params.push(sid);
  }

  const fromIso = normalizeFrom(dateFrom);
  const toIso = normalizeTo(dateTo);

  if (fromIso) {
    where.push("i.issued_at >= ?");
    params.push(fromIso);
  }
  if (toIso) {
    where.push("i.issued_at <= ?");
    params.push(toIso);
  }

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

async function saveExcelWithDialog({ defaultName, sheets }) {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Guardar reporte (Excel)",
    defaultPath: path.join(app.getPath("downloads"), defaultName),
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });

  if (canceled || !filePath) return { ok: false, message: "Cancelado" };

  const wb = XLSX.utils.book_new();

  for (const sh of sheets) {
    const name = sh.name || "Hoja1";
    const data = Array.isArray(sh.rows) ? sh.rows : [];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // Excel max 31 chars
  }

  XLSX.writeFile(wb, filePath);
  const openRes = await shell.openPath(filePath);
  if (openRes) {
    return { ok: true, filePath, message: `Excel guardado, pero no se pudo abrir: ${openRes}` };
  }

  return { ok: true, filePath };
}

/* =========================
   QUERIES (reutilizables)
   (evita ipcMain.invoke dentro del main process)
========================= */

function queryInvoiceList(payload) {
  ensureSchema();

  const params = [];
  const where = buildInvoiceWhere(payload || {}, params);

  const sellerId = payload?.sellerId ?? null;
  const includeSeller = payload?.includeSeller ?? (sellerId ? false : true);

  if (includeSeller) {
    return db
      .prepare(
        `
      SELECT
        i.id as invoiceId,
        i.issued_at as issuedAt,
        i.commission_percent as commissionPercent,

        i.subtotal as subtotal,
        i.exempt_total as exemptTotal,
        i.changes_total as changesTotal,
        i.commission_base as commissionBase,
        i.commission_value as commissionValue,
        i.payable_total as payableTotal,

        s.id as sellerId,
        s.name as sellerName
      FROM invoice i
      JOIN seller s ON s.id = i.seller_id
      ${where}
      ORDER BY i.id DESC
    `
      )
      .all(...params);
  }

  return db
    .prepare(
      `
    SELECT
      i.id as invoiceId,
      i.issued_at as issuedAt,
      i.commission_percent as commissionPercent,

      i.subtotal as subtotal,
      i.exempt_total as exemptTotal,
      i.changes_total as changesTotal,
      i.commission_base as commissionBase,
      i.commission_value as commissionValue,
      i.payable_total as payableTotal
    FROM invoice i
    ${where}
    ORDER BY i.id DESC
  `
    )
    .all(...params);
}

function querySalesSummary(payload) {
  ensureSchema();

  const params = [];
  const where = buildInvoiceWhere(payload || {}, params);

  return db
    .prepare(
      `
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(i.subtotal), 0) as subtotalSum,
      COALESCE(SUM(i.exempt_total), 0) as exemptSum,
      COALESCE(SUM(i.changes_total), 0) as changesSum,
      COALESCE(SUM(i.commission_value), 0) as commissionSum,
      COALESCE(SUM(i.payable_total), 0) as payableSum
    FROM invoice i
    ${where}
  `
    )
    .get(...params);
}

function queryProductsSold(payload) {
  ensureSchema();

  const params = [];
  const where = buildInvoiceWhere(payload || {}, params);

  return db
    .prepare(
      `
    SELECT
      p.id as productId,
      p.name as productName,
      ii.price as unitPrice,
      p.commission_exempt as exempt,

      COALESCE(SUM(ii.billed_qty), 0) as unitsSold,
      COALESCE(SUM(ii.line_total), 0) as salesTotal,

      COALESCE(SUM(ii.changes_qty), 0) as changesUnits,
      COALESCE(SUM(ii.changes_qty * ii.price), 0) as changesValue
    FROM invoice_item ii
    JOIN invoice i ON i.id = ii.invoice_id
    JOIN product p ON p.id = ii.product_id
    ${where}
    GROUP BY p.id, p.name, ii.price, p.commission_exempt
    ORDER BY salesTotal DESC, unitsSold DESC, p.name ASC
  `
    )
    .all(...params);
}

function querySalesBySeller(payload) {
  ensureSchema();

  const params = [];
  const where = buildInvoiceWhere(payload || {}, params);

  return db
    .prepare(
      `
    SELECT
      s.id as sellerId,
      s.name as sellerName,

      COUNT(i.id) as count,
      COALESCE(SUM(i.subtotal), 0) as subtotalSum,
      COALESCE(SUM(i.exempt_total), 0) as exemptSum,
      COALESCE(SUM(i.changes_total), 0) as changesSum,
      COALESCE(SUM(i.commission_value), 0) as commissionSum,
      COALESCE(SUM(i.payable_total), 0) as payableSum
    FROM invoice i
    JOIN seller s ON s.id = i.seller_id
    ${where}
    GROUP BY s.id, s.name
    ORDER BY payableSum DESC, count DESC, s.name ASC
  `
    )
    .all(...params);
}

/* =========================
   DB SEED
========================= */
ipcMain.handle("db:seed", async () => {
  ensureSchema();

  const sellers = [
    "RODOLFO URIBE",
    "ENRIQUE CALDERON",
    "WILMER OSORIO",
    "NIDIA OCAMPO",
    "JULIAN RODRIGUEZ",
    "CARLOS PLATA",
    "DAVID REYES (ALBEIRO)",
    "WALDIR ORTEGA",
    "ANGIE RUIZ",
    "RAUL MARQUEZ",
    "DANNA REYES (LIAM)",
    "HECTOR",
    "GUSTAVO DELGADO",
  ];

  // commission_exempt: 1 => NO paga comisión (ROSQUITA y PUDIN X16)
  const products = [
    { sort: 1, name: "PAN BLANCO 250", price: 250, exempt: 0 },
    { sort: 2, name: "LARGO 400", price: 400, exempt: 0 },
    { sort: 3, name: "LARGO 800", price: 800, exempt: 0 },
    { sort: 4, name: "LARGO QUESO 800", price: 800, exempt: 0 },
    { sort: 5, name: "LARGO 1600", price: 1600, exempt: 0 },
    { sort: 6, name: "LARGO DE QUESO 1600", price: 1600, exempt: 0 },
    { sort: 7, name: "LARGO DE 2400", price: 2400, exempt: 0 },
    { sort: 8, name: "MACIZA 400", price: 400, exempt: 0 },
    { sort: 9, name: "MACIZA 800", price: 800, exempt: 0 },
    { sort: 10, name: "TOSTADA DULCE", price: 700, exempt: 0 },
    { sort: 11, name: "TOSTADA AJO", price: 900, exempt: 0 },
    { sort: 12, name: "PAN DE SAL X6", price: 1000, exempt: 0 },
    { sort: 13, name: "PAN DE SAL", price: 400, exempt: 0 },
    { sort: 14, name: "ROSCÓN 800", price: 800, exempt: 0 },
    { sort: 15, name: "QUESITO", price: 250, exempt: 0 },
    { sort: 16, name: "MANTEQUILLA 400", price: 400, exempt: 0 },
    { sort: 17, name: "MANTEQUILLA 800", price: 800, exempt: 0 },
    { sort: 18, name: "MESTIZA 400", price: 400, exempt: 0 },
    { sort: 19, name: "MESTIZA 800", price: 800, exempt: 0 },
    { sort: 20, name: "GALLETA DE QUESO", price: 400, exempt: 0 },
    { sort: 21, name: "GALLETA CUCA", price: 400, exempt: 0 },
    { sort: 22, name: "TAJADO GRANDE", price: 3600, exempt: 0 },
    { sort: 23, name: "TAJADO MINI", price: 1800, exempt: 0 },
    { sort: 24, name: "MANTEQUILLA X12 3000", price: 3000, exempt: 0 },
    { sort: 25, name: "MACIZAS X12 3000", price: 3000, exempt: 0 },
    { sort: 26, name: "GALLETA SURTIDA 8000", price: 8000, exempt: 0 },
    { sort: 27, name: "GALLETA 10000", price: 10000, exempt: 0 },
    { sort: 28, name: "PUDIN X16", price: 12000, exempt: 1 }, // EXENTO
    { sort: 29, name: "ROSQUITA", price: 3500, exempt: 1 }, // EXENTO
    { sort: 30, name: "PAN PERRO X10", price: 10000, exempt: 0 },
    { sort: 31, name: "PAN HAMBURGUESA", price: 6000, exempt: 0 },
    { sort: 32, name: "PAN PERRO X2 ART", price: 2500, exempt: 0 },
    { sort: 33, name: "PAN HAMBURGUESA X2 ART", price: 2500, exempt: 0 },
    { sort: 34, name: "CROISANT 800", price: 800, exempt: 0 },
  ];

  // ✅ ahora inserta active=1
  const insertSeller = db.prepare("INSERT OR IGNORE INTO seller(name, active) VALUES (?, 1)");
  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO product(name, price, sort_order, commission_exempt)
    VALUES (?, ?, ?, ?)
  `);

  const insertState = db.prepare(`
    INSERT OR IGNORE INTO seller_product_state (seller_id, product_id, carry, r1, r2, r3)
    VALUES (?, ?, 0, 0, 0, 0)
  `);

  const insertCycle = db.prepare(`
    INSERT OR IGNORE INTO seller_recharge_cycle (seller_id, current_slot)
    VALUES (?, 1)
  `);

  const trx = db.transaction(() => {
    sellers.forEach((s) => insertSeller.run(s.trim()));
    products.forEach((p) => insertProduct.run(p.name.trim(), p.price, p.sort, p.exempt));

    const sellerRows = db.prepare("SELECT id FROM seller").all();
    const productRows = db.prepare("SELECT id FROM product").all();

    sellerRows.forEach((s) => {
      insertCycle.run(s.id);
      productRows.forEach((p) => insertState.run(s.id, p.id));
    });
  });

  trx();

  const sellerCount = db.prepare("SELECT COUNT(*) as c FROM seller").get().c;
  const productCount = db.prepare("SELECT COUNT(*) as c FROM product").get().c;
  const exemptCount = db.prepare("SELECT COUNT(*) as c FROM product WHERE commission_exempt = 1").get().c;
  const stateCount = db.prepare("SELECT COUNT(*) as c FROM seller_product_state").get().c;

  return { sellerCount, productCount, exemptCount, stateCount };
});

/* =========================
   CATALOG
========================= */

// ✅ por defecto solo activos. Si payload.includeInactive=true => devuelve también inactivos con campo active
ipcMain.handle("catalog:sellers:list", async (_event, payload) => {
  ensureSchema();

  const includeInactive = payload?.includeInactive === true;

  if (includeInactive) {
    return db.prepare("SELECT id, name, active FROM seller ORDER BY name ASC").all();
  }

  return db.prepare("SELECT id, name FROM seller WHERE active = 1 ORDER BY name ASC").all();
});

// ✅ activar / inactivar vendedor
ipcMain.handle("catalog:sellers:setActive", async (_event, payload) => {
  ensureSchema();

  const id = Number(payload?.id);
  const active = payload?.active ? 1 : 0;

  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "ID inválido." };

  const exists = db.prepare(`SELECT id FROM seller WHERE id=?`).get(id);
  if (!exists) return { ok: false, message: "Vendedor no encontrado." };

  db.prepare(`UPDATE seller SET active=? WHERE id=?`).run(active, id);
  return { ok: true };
});

ipcMain.handle("catalog:products:list", async () => {
  ensureSchema();
  return db
    .prepare(
      `
      SELECT
        id,
        name,
        price,
        sort_order as sortOrder,
        commission_exempt as commissionExempt
      FROM product
      ORDER BY sort_order ASC
    `
    )
    .all();
});

ipcMain.handle("catalog:sellers:create", async (_event, payload) => {
  ensureSchema();
  const name = String(payload?.name ?? "").trim();
  if (!name) return { ok: false, message: "Nombre requerido." };

  const exists = db.prepare(`SELECT id FROM seller WHERE UPPER(name)=UPPER(?)`).get(name);
  if (exists) return { ok: false, message: "Ya existe un vendedor con ese nombre." };

  try {
    const trx = db.transaction(() => {
      // ✅ active=1
      const info = db.prepare(`INSERT INTO seller(name, active) VALUES (?, 1)`).run(name);
      const sellerId = Number(info.lastInsertRowid);

      // ciclo
      db.prepare(
        `
        INSERT OR IGNORE INTO seller_recharge_cycle (seller_id, current_slot)
        VALUES (?, 1)
      `
      ).run(sellerId);

      // estados para todos los productos existentes
      const products = db.prepare(`SELECT id FROM product`).all();
      const insertState = db.prepare(
        `
        INSERT OR IGNORE INTO seller_product_state (seller_id, product_id, carry, r1, r2, r3)
        VALUES (?, ?, 0, 0, 0, 0)
      `
      );

      products.forEach((p) => insertState.run(sellerId, p.id));
      return sellerId;
    });

    const id = trx();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, message: e?.message ?? "Error creando vendedor." };
  }
});

ipcMain.handle("catalog:sellers:update", async (_event, payload) => {
  ensureSchema();
  const id = Number(payload?.id);
  const name = String(payload?.name ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "ID inválido." };
  if (!name) return { ok: false, message: "Nombre requerido." };

  const exists = db.prepare(`SELECT id FROM seller WHERE id=?`).get(id);
  if (!exists) return { ok: false, message: "Vendedor no encontrado." };

  const dup = db.prepare(`SELECT id FROM seller WHERE UPPER(name)=UPPER(?) AND id<>?`).get(name, id);
  if (dup) return { ok: false, message: "Ya existe otro vendedor con ese nombre." };

  try {
    db.prepare(`UPDATE seller SET name=? WHERE id=?`).run(name, id);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e?.message ?? "Error actualizando vendedor." };
  }
});

ipcMain.handle("catalog:products:create", async (_event, payload) => {
  ensureSchema();
  const name = String(payload?.name ?? "").trim();
  const price = Number(payload?.price);

  if (!name) return { ok: false, message: "Nombre requerido." };
  if (!Number.isInteger(price) || price < 0) return { ok: false, message: "Precio inválido." };

  const dup = db.prepare(`SELECT id FROM product WHERE UPPER(name)=UPPER(?)`).get(name);
  if (dup) return { ok: false, message: "Ya existe un producto con ese nombre." };

  try {
    const trx = db.transaction(() => {
      const maxSort = db.prepare(`SELECT COALESCE(MAX(sort_order), 0) as m FROM product`).get();
      const nextSort = Number(maxSort?.m ?? 0) + 1;

      const info = db
        .prepare(`INSERT INTO product(name, price, sort_order, commission_exempt) VALUES (?, ?, ?, 0)`)
        .run(name, price, nextSort);

      const productId = Number(info.lastInsertRowid);

      // crear estado para todos los vendedores existentes (incluye inactivos, no molesta)
      const sellers = db.prepare(`SELECT id FROM seller`).all();
      const insertState = db.prepare(
        `
        INSERT OR IGNORE INTO seller_product_state (seller_id, product_id, carry, r1, r2, r3)
        VALUES (?, ?, 0, 0, 0, 0)
      `
      );

      sellers.forEach((s) => insertState.run(s.id, productId));
      return productId;
    });

    const id = trx();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, message: e?.message ?? "Error creando producto." };
  }
});

ipcMain.handle("catalog:products:update", async (_event, payload) => {
  ensureSchema();
  const id = Number(payload?.id);
  const name = String(payload?.name ?? "").trim();
  const price = Number(payload?.price);

  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "ID inválido." };
  if (!name) return { ok: false, message: "Nombre requerido." };
  if (!Number.isInteger(price) || price < 0) return { ok: false, message: "Precio inválido." };

  const exists = db.prepare(`SELECT id FROM product WHERE id=?`).get(id);
  if (!exists) return { ok: false, message: "Producto no encontrado." };

  const dup = db.prepare(`SELECT id FROM product WHERE UPPER(name)=UPPER(?) AND id<>?`).get(name, id);
  if (dup) return { ok: false, message: "Ya existe otro producto con ese nombre." };

  try {
    db.prepare(`UPDATE product SET name=?, price=? WHERE id=?`).run(name, price, id);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e?.message ?? "Error actualizando producto." };
  }
});

/* =========================
   INVENTORY
========================= */
ipcMain.handle("inventory:get", async (_event, sellerId) => {
  ensureSchema();

  if (!Number.isInteger(sellerId) || sellerId <= 0) throw new Error("sellerId inválido");

  const cycle = db
    .prepare("SELECT current_slot as nextSlot FROM seller_recharge_cycle WHERE seller_id = ?")
    .get(sellerId);

  const nextSlot = cycle?.nextSlot ?? 1;

  const rows = db
    .prepare(
      `
    SELECT
      p.id as productId,
      p.name as productName,
      p.price as price,
      p.sort_order as sortOrder,

      s.carry as carry,
      s.r1 as r1,
      s.r2 as r2,
      s.r3 as r3,

      p.commission_exempt as commissionExempt,

      ? as nextSlot,

      (s.carry + s.r1 + s.r2 + s.r3) as total
    FROM seller_product_state s
    JOIN product p ON p.id = s.product_id
    WHERE s.seller_id = ?
    ORDER BY p.sort_order ASC
  `
    )
    .all(nextSlot, sellerId);

  return rows;
});

ipcMain.handle("inventory:update", async (_event, payload) => {
  ensureSchema();

  const { sellerId, items } = payload || {};
  if (!Number.isInteger(sellerId) || sellerId <= 0) throw new Error("sellerId inválido");
  if (!Array.isArray(items)) throw new Error("items inválido");

  for (const it of items) {
    if (!Number.isInteger(it.productId) || it.productId <= 0) throw new Error("productId inválido");
    for (const k of ["carry", "r1", "r2", "r3"]) {
      const v = it[k];
      if (!Number.isInteger(v) || v < 0) throw new Error(`Valor inválido en ${k} (solo naturales)`);
    }
  }

  const trx = db.transaction(() => {
    const stmt = db.prepare(`
      UPDATE seller_product_state
      SET carry = ?, r1 = ?, r2 = ?, r3 = ?
      WHERE seller_id = ? AND product_id = ?
    `);

    for (const it of items) {
      stmt.run(it.carry, it.r1, it.r2, it.r3, sellerId, it.productId);
    }
  });

  trx();
  return { ok: true };
});

/* =========================
   RECHARGE
========================= */
ipcMain.handle("recharge:commitDay", async (_event, payload) => {
  ensureSchema();

  const { sellerId, items } = payload || {};
  if (!Number.isInteger(sellerId) || sellerId <= 0) throw new Error("sellerId inválido");
  if (!Array.isArray(items)) throw new Error("items inválido");

  const cycle = db.prepare(`SELECT current_slot FROM seller_recharge_cycle WHERE seller_id = ?`).get(sellerId);
  const currentSlot = cycle?.current_slot ?? 1;

  if (![1, 2, 3].includes(currentSlot)) {
    return { ok: false, message: "Recargas completas. Debes facturar para reiniciar." };
  }

  const clean = [];
  for (const it of items) {
    const productId = it.productId;
    const quantity = it.quantity;

    if (!Number.isInteger(productId) || productId <= 0) return { ok: false, message: "productId inválido" };
    if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, message: "Solo números naturales (0 o mayor)" };

    clean.push({ productId, quantity });
  }

  const anyPositive = clean.some((x) => x.quantity > 0);
  if (!anyPositive) {
    return { ok: false, message: "No se guardó: debes ingresar al menos 1 producto con cantidad > 0." };
  }

  const trx = db.transaction(() => {
    for (const { productId, quantity } of clean) {
      if (currentSlot === 1) {
        db.prepare(`UPDATE seller_product_state SET r1 = ? WHERE seller_id = ? AND product_id = ?`).run(
          quantity,
          sellerId,
          productId
        );
      } else if (currentSlot === 2) {
        db.prepare(`UPDATE seller_product_state SET r2 = ? WHERE seller_id = ? AND product_id = ?`).run(
          quantity,
          sellerId,
          productId
        );
      } else {
        db.prepare(`UPDATE seller_product_state SET r3 = ? WHERE seller_id = ? AND product_id = ?`).run(
          quantity,
          sellerId,
          productId
        );
      }
    }

    if (currentSlot < 3) {
      db.prepare(`UPDATE seller_recharge_cycle SET current_slot = current_slot + 1 WHERE seller_id = ?`).run(
        sellerId
      );
    } else {
      db.prepare(`UPDATE seller_recharge_cycle SET current_slot = 0 WHERE seller_id = ?`).run(sellerId);
    }
  });

  trx();

  const nextSlot = currentSlot < 3 ? currentSlot + 1 : 0;
  return { ok: true, currentSlot, nextSlot };
});

/* =========================
   INVOICE COMMIT
========================= */
ipcMain.handle("invoice:commit", async (_event, payload) => {
  ensureSchema();

  const { sellerId, commissionPercent, lines } = payload || {};

  if (!Number.isInteger(sellerId) || sellerId <= 0) throw new Error("sellerId inválido");
  if (!Number.isInteger(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    throw new Error("commissionPercent inválido (0 a 100)");
  }
  if (!Array.isArray(lines)) throw new Error("lines inválido");

  for (const l of lines) {
    if (!Number.isInteger(l.productId) || l.productId <= 0) throw new Error("productId inválido");
    if (!Number.isInteger(l.finalQty) || l.finalQty < 0) throw new Error("Inventario final inválido (solo naturales)");
    if (!Number.isInteger(l.changesQty) || l.changesQty < 0) throw new Error("Cambios inválido (solo naturales)");
  }

  const issuedAt = new Date().toISOString();

  const trx = db.transaction(() => {
    const rows = db
      .prepare(
        `
      SELECT
        p.id as productId,
        p.price as price,
        p.commission_exempt as exempt,
        s.carry as carry,
        s.r1 as r1,
        s.r2 as r2,
        s.r3 as r3
      FROM seller_product_state s
      JOIN product p ON p.id = s.product_id
      WHERE s.seller_id = ?
    `
      )
      .all(sellerId);

    const byId = new Map(rows.map((r) => [r.productId, r]));

    const itemsToInsert = [];
    let subtotal = 0;
    let exemptTotal = 0;
    let changesTotal = 0;

    for (const l of lines) {
      const base = byId.get(l.productId);
      if (!base) throw new Error(`Producto no existe para este vendedor (productId ${l.productId})`);

      const available = base.carry + base.r1 + base.r2 + base.r3;

      if (l.finalQty + l.changesQty > available) {
        throw new Error(`Inventario final + cambios supera disponible (productId ${l.productId}).`);
      }

      const billedQty = available - l.finalQty - l.changesQty;
      const lineTotal = billedQty * base.price;
      const changesValue = l.changesQty * base.price;

      itemsToInsert.push({
        productId: l.productId,
        availableQty: available,
        finalQty: l.finalQty,
        changesQty: l.changesQty,
        billedQty,
        price: base.price,
        lineTotal,
        exempt: base.exempt,
      });

      subtotal += lineTotal;
      changesTotal += changesValue;
      if (base.exempt === 1) exemptTotal += lineTotal;
    }

    const commissionBase = subtotal - exemptTotal;
    const commissionValue = Math.round((commissionBase * commissionPercent) / 100);
    const payableTotal = subtotal - commissionValue;

    const inv = db
      .prepare(
        `
      INSERT INTO invoice (
        seller_id, issued_at,
        commission_percent,
        subtotal, exempt_total, commission_base, commission_value,
        changes_total,
        payable_total
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        sellerId,
        issuedAt,
        commissionPercent,
        subtotal,
        exemptTotal,
        commissionBase,
        commissionValue,
        changesTotal,
        payableTotal
      );

    const invoiceId = inv.lastInsertRowid;

    const insItem = db.prepare(`
      INSERT INTO invoice_item (
        invoice_id, product_id,
        carry_qty, r1_qty, r2_qty, r3_qty,
        available_qty, final_qty, changes_qty, billed_qty,
        price, line_total
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const it of itemsToInsert) {
      const base = byId.get(it.productId);
      if (!base) throw new Error(`Base no existe para productId ${it.productId}`);

      insItem.run(
        invoiceId,
        it.productId,
        base.carry,
        base.r1,
        base.r2,
        base.r3,
        it.availableQty,
        it.finalQty,
        it.changesQty,
        it.billedQty,
        it.price,
        it.lineTotal
      );
    }

    const upd = db.prepare(`
      UPDATE seller_product_state
      SET carry = ?, r1 = 0, r2 = 0, r3 = 0
      WHERE seller_id = ? AND product_id = ?
    `);

    for (const it of itemsToInsert) {
      upd.run(it.finalQty, sellerId, it.productId);
    }

    db.prepare(`
      INSERT INTO seller_recharge_cycle (seller_id, current_slot)
      VALUES (?, 1)
      ON CONFLICT(seller_id) DO UPDATE SET current_slot = 1
    `).run(sellerId);

    return {
      invoiceId,
      issuedAt,
      subtotal,
      exemptTotal,
      changesTotal,
      commissionBase,
      commissionValue,
      payableTotal,
    };
  });

  const result = trx();
  return { ok: true, ...result };
});

/* =========================
   INVOICE LIST (con filtros)
========================= */
ipcMain.handle("invoice:list", async (_event, payload) => {
  return queryInvoiceList(payload || {});
});

/* =========================
   REPORTS (JSON)
========================= */
ipcMain.handle("report:salesSummary", async (_event, payload) => {
  return querySalesSummary(payload || {});
});

ipcMain.handle("report:productsSold", async (_event, payload) => {
  return queryProductsSold(payload || {});
});

ipcMain.handle("report:salesBySeller", async (_event, payload) => {
  return querySalesBySeller(payload || {});
});

/* =========================
   EXCEL EXPORTS (usa nombres ...Excel)
========================= */
ipcMain.handle("report:export:invoicesExcel", async (_event, payload) => {
  const rows = queryInvoiceList({ ...(payload || {}), includeSeller: true });
  const defaultName = `Reporte_Facturas_${Date.now()}.xlsx`;
  return await saveExcelWithDialog({
    defaultName,
    sheets: [{ name: "Facturas", rows }],
  });
});

ipcMain.handle("report:export:productsSoldExcel", async (_event, payload) => {
  const data = queryProductsSold(payload || {});
  const defaultName = `Reporte_Productos_${Date.now()}.xlsx`;

  return await saveExcelWithDialog({
    defaultName,
    sheets: [{ name: "Productos", rows: data }],
  });
});

ipcMain.handle("report:export:salesBySellerExcel", async (_event, payload) => {
  const data = querySalesBySeller(payload || {});
  const defaultName = `Reporte_Vendedores_${Date.now()}.xlsx`;

  return await saveExcelWithDialog({
    defaultName,
    sheets: [{ name: "Vendedores", rows: data }],
  });
});

ipcMain.handle("report:export:salesSummaryExcel", async (_event, payload) => {
  const summary = querySalesSummary(payload || {});
  const defaultName = `Reporte_Consolidado_${Date.now()}.xlsx`;

  return await saveExcelWithDialog({
    defaultName,
    sheets: [{ name: "Consolidado", rows: [summary] }],
  });
});

ipcMain.handle("dev:generateInvoices", async (_event, payload) => {
  ensureSchema();

  const { monthsBack = 6, invoicesPerMonth = 35, wipeBefore = false } = payload || {};

  function randInt(min, maxInclusive) {
    return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
  }
  function pick(arr) {
    return arr[randInt(0, arr.length - 1)];
  }
  function chance(p) {
    return Math.random() < p;
  }

  function isoInMonthUTC(year, month1to12) {
    const day = randInt(1, 28);
    const hour = randInt(8, 18);
    const min = randInt(0, 59);
    const sec = randInt(0, 59);
    return new Date(Date.UTC(year, month1to12 - 1, day, hour, min, sec)).toISOString();
  }

  function genAvailableBase() {
    if (chance(0.55)) return randInt(0, 10);
    if (chance(0.35)) return randInt(11, 25);
    return randInt(26, 50);
  }

  function splitAvailableIntoCarryAndRecargas(av) {
    const carry = randInt(0, av);
    let remaining = av - carry;
    const r1 = remaining > 0 ? randInt(0, remaining) : 0;
    remaining -= r1;
    const r2 = remaining > 0 ? randInt(0, remaining) : 0;
    remaining -= r2;
    const r3 = remaining;
    return { carry, r1, r2, r3 };
  }

  function genFinalAndChanges(available) {
    if (available <= 0) return { finalQty: 0, changesQty: 0 };
    const maxFinal = Math.min(available, randInt(0, Math.ceil(available * 0.4)));
    const finalQty = maxFinal;
    const maxChanges = Math.min(available - finalQty, chance(0.25) ? randInt(0, 4) : 0);
    return { finalQty, changesQty: maxChanges };
  }

  // ✅ SOLO vendedores activos
  const sellers = db.prepare("SELECT id FROM seller WHERE active = 1 ORDER BY id").all();
  const products = db.prepare("SELECT id, price, commission_exempt FROM product ORDER BY sort_order").all();

  if (!sellers.length || !products.length) throw new Error("No hay seed (seller/product vacío).");

  if (wipeBefore) {
    db.transaction(() => {
      db.prepare("DELETE FROM invoice_item").run();
      db.prepare("DELETE FROM invoice").run();
    })();
  }

  const now = new Date();
  const commissions = [0, 5, 8, 10, 12];

  const insInv = db.prepare(`
    INSERT INTO invoice (
      seller_id, issued_at,
      commission_percent,
      subtotal, exempt_total, commission_base, commission_value,
      changes_total,
      payable_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insItem = db.prepare(`
    INSERT INTO invoice_item (
      invoice_id, product_id,
      carry_qty, r1_qty, r2_qty, r3_qty,
      available_qty, final_qty, changes_qty, billed_qty,
      price, line_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upState = db.prepare(`
    INSERT INTO seller_product_state (seller_id, product_id, carry, r1, r2, r3)
    VALUES (?, ?, ?, 0, 0, 0)
    ON CONFLICT(seller_id, product_id) DO UPDATE SET
      carry=excluded.carry, r1=0, r2=0, r3=0
  `);

  const resetCycle = db.prepare(`
    INSERT INTO seller_recharge_cycle (seller_id, current_slot)
    VALUES (?, 1)
    ON CONFLICT(seller_id) DO UPDATE SET current_slot=1
  `);

  const trx = db.transaction(() => {
    let created = 0;

    for (let mb = monthsBack - 1; mb >= 0; mb--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - mb, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;

      for (let k = 0; k < invoicesPerMonth; k++) {
        const sellerId = pick(sellers).id;
        const commissionPercent = pick(commissions);
        const issuedAt = isoInMonthUTC(year, month);

        // items
        let subtotal = 0;
        let exemptTotal = 0;
        let changesTotal = 0;

        const prepared = [];

        for (const p of products) {
          let available = genAvailableBase();
          if (chance(0.20)) available = randInt(15, 60);

          const { carry, r1, r2, r3 } = splitAvailableIntoCarryAndRecargas(available);
          const { finalQty, changesQty } = genFinalAndChanges(available);

          const billedQty = available - finalQty - changesQty;
          const lineTotal = billedQty * p.price;
          const changesValue = changesQty * p.price;

          subtotal += lineTotal;
          changesTotal += changesValue;
          if (p.commission_exempt === 1) exemptTotal += lineTotal;

          prepared.push({
            productId: p.id,
            carry,
            r1,
            r2,
            r3,
            available,
            finalQty,
            changesQty,
            billedQty,
            price: p.price,
            lineTotal,
          });
        }

        const commissionBase = Math.max(0, subtotal - exemptTotal);
        const commissionValue = Math.round((commissionBase * commissionPercent) / 100);
        const payableTotal = Math.max(0, subtotal - commissionValue);

        const inv = insInv.run(
          sellerId,
          issuedAt,
          commissionPercent,
          subtotal,
          exemptTotal,
          commissionBase,
          commissionValue,
          changesTotal,
          payableTotal
        );

        const invoiceId = inv.lastInsertRowid;

        for (const it of prepared) {
          insItem.run(
            invoiceId,
            it.productId,
            it.carry,
            it.r1,
            it.r2,
            it.r3,
            it.available,
            it.finalQty,
            it.changesQty,
            it.billedQty,
            it.price,
            it.lineTotal
          );
          upState.run(sellerId, it.productId, it.finalQty);
        }

        resetCycle.run(sellerId);
        created++;
      }
    }

    return created;
  });

  const created = trx();
  const total = db.prepare("SELECT COUNT(*) c FROM invoice").get().c;

  return { ok: true, created, total };
});

/* =========================
   INVOICE PDF (regenerar/descargar)
========================= */
ipcMain.handle("invoice:pdf", async (_event, payload) => {
  ensureSchema();

  const { invoiceId } = payload || {};
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new Error("invoiceId inválido");

  const inv = db
    .prepare(
      `
    SELECT
      i.*,
      s.name as sellerName
    FROM invoice i
    JOIN seller s ON s.id = i.seller_id
    WHERE i.id = ?
  `
    )
    .get(invoiceId);

  if (!inv) throw new Error("Factura no existe");

  const items = db
    .prepare(
      `
    SELECT
      ii.*,
      p.name as productName,
      p.sort_order as sortOrder,
      p.commission_exempt as commissionExempt
    FROM invoice_item ii
    JOIN product p ON p.id = ii.product_id
    WHERE ii.invoice_id = ?
    ORDER BY p.sort_order ASC
  `
    )
    .all(invoiceId);

  const logoPath = path.join(process.cwd(), "assets", "logo.png");
  const safeLogoPath = fs.existsSync(logoPath) ? logoPath : null;

  const padded = String(invoiceId).padStart(6, "0");
  const defaultName = `Factura_${padded}_${inv.sellerName
    .replace(/[^\w\s()-]/g, "")
    .trim()
    .replace(/\s+/g, "_")}.pdf`;

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Guardar factura (PDF)",
    defaultPath: path.join(app.getPath("downloads"), defaultName),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (canceled || !filePath) {
    return { ok: false, message: "Cancelado" };
  }

  await generateInvoicePdfToFile({
    outPath: filePath,
    companyName: "INDUSTRIA BIZCOPAN ZAPATOCA",
    logoPath: safeLogoPath,
    invoice: inv,
    items,
  });

  // ✅ Abrir automáticamente con el visor predeterminado del sistema
  const openRes = await shell.openPath(filePath);
  if (openRes) {
    // openRes trae string vacío si todo OK; si falla, trae mensaje de error
    return { ok: true, filePath, message: `PDF guardado, pero no se pudo abrir: ${openRes}` };
  }

  return { ok: true, filePath };
});

/* =========================
   WINDOW
========================= */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    icon: path.join(process.cwd(), "assets", "logonb.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.maximize(); // ✅ abre maximizada
  mainWindow.show();     // opcional


  mainWindow.loadURL("http://localhost:5173");
}
app.setAppUserModelId("com.bizcopan.panaderia");

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  try {
    db.close();
  } catch {}
  if (process.platform !== "darwin") app.quit();
});
