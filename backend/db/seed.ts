import { initDB } from "./init.ts";

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

type ProductSeed = { name: string; price: number; sort: number; commissionExempt?: 0 | 1 };

const products: ProductSeed[] = [
  { sort: 1, name: "PAN BLANCO 250", price: 250 },
  { sort: 2, name: "LARGO 400", price: 400 },
  { sort: 3, name: "LARGO 800", price: 800 },
  { sort: 4, name: "LARGO QUESO 800", price: 800 },
  { sort: 5, name: "LARGO 1600", price: 1600 },
  { sort: 6, name: "LARGO DE QUESO 1600", price: 1600 },
  { sort: 7, name: "LARGO DE 2400", price: 2400 },
  { sort: 8, name: "MACIZA 400", price: 400 },
  { sort: 9, name: "MACIZA 800", price: 800 },
  { sort: 10, name: "TOSTADA DULCE", price: 700 },
  { sort: 11, name: "TOSTADA AJO", price: 900 },
  { sort: 12, name: "PAN DE SAL X6", price: 1000 },
  { sort: 13, name: "PAN DE SAL", price: 400 },
  { sort: 14, name: "ROSCÓN 800", price: 800 },
  { sort: 15, name: "QUESITO", price: 250 },
  { sort: 16, name: "MANTEQUILLA 400", price: 400 },
  { sort: 17, name: "MANTEQUILLA 800", price: 800 },
  { sort: 18, name: "MESTIZA 400", price: 400 },
  { sort: 19, name: "MESTIZA 800", price: 800 },
  { sort: 20, name: "GALLETA DE QUESO", price: 400 },
  { sort: 21, name: "GALLETA CUCA", price: 400 },
  { sort: 22, name: "TAJADO GRANDE", price: 3600 },
  { sort: 23, name: "TAJADO MINI", price: 1800 },

  // BANDEJAS
  { sort: 24, name: "MANTEQUILLA X12 3000", price: 3000 },
  { sort: 25, name: "MACIZAS X12 3000", price: 3000 },
  { sort: 26, name: "GALLETA SURTIDA 8000", price: 8000 },
  { sort: 27, name: "GALLETA 10000", price: 10000 },
  { sort: 28, name: "PUDIN X16", price: 12000, commissionExempt: 1 }, // EXENTO
  { sort: 29, name: "ROSQUITA", price: 3500, commissionExempt: 1 },     // EXENTO
  { sort: 30, name: "PAN PERRO X10", price: 10000 },
  { sort: 31, name: "PAN HAMBURGUESA", price: 6000 },
  { sort: 32, name: "PAN PERRO X2 ART", price: 2500 },
  { sort: 33, name: "PAN HAMBURGUESA X2 ART", price: 2500 },
  { sort: 34, name: "CROISANT 800", price: 800 },
];

function seed() {
  const db = initDB();

  // 1) Crea/actualiza schema
  // OJO: initDB ya debería ejecutar schema.sql, pero por si no, lo hacemos acá opcionalmente:
  // (si tu initDB ya hace esto, puedes quitarlo)
  // const schema = fs.readFileSync(path.join(process.cwd(),"backend","db","schema.sql"),"utf8");
  // db.exec(schema);

  const insertSeller = db.prepare(`INSERT OR IGNORE INTO seller (name) VALUES (?)`);

  // product tiene nueva columna commission_exempt
  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO product (name, price, sort_order, commission_exempt)
    VALUES (?, ?, ?, ?)
  `);

  const insertCycle = db.prepare(`
    INSERT OR IGNORE INTO seller_recharge_cycle (seller_id, current_slot)
    VALUES (?, 1)
  `);

  const insertState = db.prepare(`
    INSERT OR IGNORE INTO seller_product_state (seller_id, product_id, carry, r1, r2, r3)
    VALUES (?, ?, 0, 0, 0, 0)
  `);

  const trx = db.transaction(() => {
    for (const s of sellers) insertSeller.run(s.trim());

    for (const p of products) {
      const exempt = p.commissionExempt ?? 0;
      insertProduct.run(p.name.trim(), p.price, p.sort, exempt);
    }

    const sellerRows = db.prepare(`SELECT id FROM seller`).all() as Array<{ id: number }>;
    const productRows = db.prepare(`SELECT id FROM product`).all() as Array<{ id: number }>;

    sellerRows.forEach((s) => {
      insertCycle.run(s.id);
      productRows.forEach((p) => insertState.run(s.id, p.id));
    });
  });

  trx();

  const sellerCount = db.prepare(`SELECT COUNT(*) as c FROM seller`).get() as { c: number };
  const productCount = db.prepare(`SELECT COUNT(*) as c FROM product`).get() as { c: number };
  const stateCount = db.prepare(`SELECT COUNT(*) as c FROM seller_product_state`).get() as { c: number };

  const exemptCount = db.prepare(`SELECT COUNT(*) as c FROM product WHERE commission_exempt = 1`).get() as { c: number };

  db.close();

  console.log("✅ Seed OK");
  console.log("Sellers:", sellerCount.c);
  console.log("Products:", productCount.c);
  console.log("Exempt products:", exemptCount.c);
  console.log("States:", stateCount.c);
}

seed();
