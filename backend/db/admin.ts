import { initDB } from "./init.ts";

export function listProducts() {
  const db = initDB();
  const rows = db.prepare(`
    SELECT id, name, price, sort_order as sortOrder, commission_exempt as commissionExempt
    FROM product
    ORDER BY sort_order ASC
  `).all();
  db.close();
  return rows;
}

export function createSeller(nameRaw: string) {
  const name = nameRaw.trim();
  if (!name) return { ok: false, message: "Nombre requerido." };

  const db = initDB();

  const exists = db.prepare(`SELECT id FROM seller WHERE UPPER(name)=UPPER(?)`).get(name);
  if (exists) {
    db.close();
    return { ok: false, message: "Ya existe un vendedor con ese nombre." };
  }

  const insertSeller = db.prepare(`INSERT INTO seller (name) VALUES (?)`);
  const insertCycle = db.prepare(`
    INSERT OR IGNORE INTO seller_recharge_cycle (seller_id, current_slot)
    VALUES (?, 1)
  `);
  const insertState = db.prepare(`
    INSERT OR IGNORE INTO seller_product_state (seller_id, product_id, carry, r1, r2, r3)
    VALUES (?, ?, 0, 0, 0, 0)
  `);

  const trx = db.transaction(() => {
    const info = insertSeller.run(name);
    const sellerId = Number(info.lastInsertRowid);

    insertCycle.run(sellerId);

    const products = db.prepare(`SELECT id FROM product`).all() as Array<{ id: number }>;
    products.forEach((p) => insertState.run(sellerId, p.id));

    return sellerId;
  });

  try {
    const id = trx();
    db.close();
    return { ok: true, id };
  } catch (e: any) {
    db.close();
    return { ok: false, message: e?.message ?? "Error creando vendedor." };
  }
}

export function updateSeller(id: number, nameRaw: string) {
  const name = nameRaw.trim();
  if (!name) return { ok: false, message: "Nombre requerido." };

  const db = initDB();

  const exists = db.prepare(`SELECT id FROM seller WHERE id=?`).get(id);
  if (!exists) {
    db.close();
    return { ok: false, message: "Vendedor no encontrado." };
  }

  const dup = db.prepare(`SELECT id FROM seller WHERE UPPER(name)=UPPER(?) AND id<>?`).get(name, id);
  if (dup) {
    db.close();
    return { ok: false, message: "Ya existe otro vendedor con ese nombre." };
  }

  try {
    db.prepare(`UPDATE seller SET name=? WHERE id=?`).run(name, id);
    db.close();
    return { ok: true };
  } catch (e: any) {
    db.close();
    return { ok: false, message: e?.message ?? "Error actualizando vendedor." };
  }
}

export function createProduct(nameRaw: string, price: number) {
  const name = nameRaw.trim();
  if (!name) return { ok: false, message: "Nombre requerido." };
  if (!Number.isInteger(price) || price < 0) return { ok: false, message: "Precio inválido." };

  const db = initDB();

  const dup = db.prepare(`SELECT id FROM product WHERE UPPER(name)=UPPER(?)`).get(name);
  if (dup) {
    db.close();
    return { ok: false, message: "Ya existe un producto con ese nombre." };
  }

  const maxSort = db.prepare(`SELECT COALESCE(MAX(sort_order), 0) as m FROM product`).get() as { m: number };
  const nextSort = (maxSort?.m ?? 0) + 1;

  const insertProduct = db.prepare(`
    INSERT INTO product (name, price, sort_order, commission_exempt)
    VALUES (?, ?, ?, 0)
  `);

  const insertState = db.prepare(`
    INSERT OR IGNORE INTO seller_product_state (seller_id, product_id, carry, r1, r2, r3)
    VALUES (?, ?, 0, 0, 0, 0)
  `);

  const trx = db.transaction(() => {
    const info = insertProduct.run(name, price, nextSort);
    const productId = Number(info.lastInsertRowid);

    const sellers = db.prepare(`SELECT id FROM seller`).all() as Array<{ id: number }>;
    sellers.forEach((s) => insertState.run(s.id, productId));

    return productId;
  });

  try {
    const id = trx();
    db.close();
    return { ok: true, id };
  } catch (e: any) {
    db.close();
    return { ok: false, message: e?.message ?? "Error creando producto." };
  }
}

export function updateProduct(id: number, nameRaw: string, price: number) {
  const name = nameRaw.trim();
  if (!name) return { ok: false, message: "Nombre requerido." };
  if (!Number.isInteger(price) || price < 0) return { ok: false, message: "Precio inválido." };

  const db = initDB();

  const exists = db.prepare(`SELECT id FROM product WHERE id=?`).get(id);
  if (!exists) {
    db.close();
    return { ok: false, message: "Producto no encontrado." };
  }

  const dup = db.prepare(`SELECT id FROM product WHERE UPPER(name)=UPPER(?) AND id<>?`).get(name, id);
  if (dup) {
    db.close();
    return { ok: false, message: "Ya existe otro producto con ese nombre." };
  }

  try {
    db.prepare(`UPDATE product SET name=?, price=? WHERE id=?`).run(name, price, id);
    db.close();
    return { ok: true };
  } catch (e: any) {
    db.close();
    return { ok: false, message: e?.message ?? "Error actualizando producto." };
  }
}
