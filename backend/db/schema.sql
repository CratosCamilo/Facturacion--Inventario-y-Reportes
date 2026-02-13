PRAGMA foreign_keys = ON;

-- ===== Vendedores =====
CREATE TABLE IF NOT EXISTS seller (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))
);

-- ===== Productos =====
CREATE TABLE IF NOT EXISTS product (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL UNIQUE,
  price             INTEGER NOT NULL CHECK(price >= 0),
  sort_order        INTEGER NOT NULL UNIQUE,
  commission_exempt INTEGER NOT NULL DEFAULT 0 CHECK(commission_exempt IN (0, 1))
);

-- ===== Estado por vendedor / producto =====
CREATE TABLE IF NOT EXISTS seller_product_state (
  seller_id  INTEGER NOT NULL,
  product_id INTEGER NOT NULL,

  carry INTEGER NOT NULL DEFAULT 0 CHECK(carry >= 0),
  r1    INTEGER NOT NULL DEFAULT 0 CHECK(r1 >= 0),
  r2    INTEGER NOT NULL DEFAULT 0 CHECK(r2 >= 0),
  r3    INTEGER NOT NULL DEFAULT 0 CHECK(r3 >= 0),

  PRIMARY KEY (seller_id, product_id),
  FOREIGN KEY (seller_id) REFERENCES seller(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE
);

-- ===== Ciclo de recargas por vendedor =====
CREATE TABLE IF NOT EXISTS seller_recharge_cycle (
  seller_id INTEGER PRIMARY KEY,
  current_slot INTEGER NOT NULL DEFAULT 1 CHECK(current_slot BETWEEN 0 AND 3),
  FOREIGN KEY (seller_id) REFERENCES seller(id) ON DELETE CASCADE
);

-- ===== Facturas (liquidaciones) =====
-- Guardamos totales útiles para informes (ventas reales, cambios, comisión, etc.)
CREATE TABLE IF NOT EXISTS invoice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL,
  issued_at TEXT NOT NULL, -- ISO string

  commission_percent INTEGER NOT NULL DEFAULT 0 CHECK(commission_percent BETWEEN 0 AND 100),

  subtotal INTEGER NOT NULL DEFAULT 0 CHECK(subtotal >= 0),
  exempt_total INTEGER NOT NULL DEFAULT 0 CHECK(exempt_total >= 0),
  commission_base INTEGER NOT NULL DEFAULT 0 CHECK(commission_base >= 0),
  commission_value INTEGER NOT NULL DEFAULT 0 CHECK(commission_value >= 0),

  changes_total INTEGER NOT NULL DEFAULT 0 CHECK(changes_total >= 0),

  payable_total INTEGER NOT NULL DEFAULT 0 CHECK(payable_total >= 0),

  FOREIGN KEY (seller_id) REFERENCES seller(id)
);

-- ===== Items de factura =====
CREATE TABLE IF NOT EXISTS invoice_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,

  -- ✅ desglose que quieres ver en la factura (congelado por factura)
  carry_qty INTEGER NOT NULL DEFAULT 0 CHECK(carry_qty >= 0),
  r1_qty    INTEGER NOT NULL DEFAULT 0 CHECK(r1_qty >= 0),
  r2_qty    INTEGER NOT NULL DEFAULT 0 CHECK(r2_qty >= 0),
  r3_qty    INTEGER NOT NULL DEFAULT 0 CHECK(r3_qty >= 0),

  available_qty INTEGER NOT NULL DEFAULT 0 CHECK(available_qty >= 0),
  final_qty     INTEGER NOT NULL DEFAULT 0 CHECK(final_qty >= 0),
  changes_qty   INTEGER NOT NULL DEFAULT 0 CHECK(changes_qty >= 0),
  billed_qty    INTEGER NOT NULL DEFAULT 0 CHECK(billed_qty >= 0),

  price      INTEGER NOT NULL DEFAULT 0 CHECK(price >= 0),
  line_total INTEGER NOT NULL DEFAULT 0 CHECK(line_total >= 0),

  FOREIGN KEY (invoice_id) REFERENCES invoice(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES product(id)
);

-- ===== Índices para informes =====
CREATE INDEX IF NOT EXISTS idx_invoice_seller_date ON invoice(seller_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_invoice_date ON invoice(issued_at);
CREATE INDEX IF NOT EXISTS idx_invoice_item_invoice ON invoice_item(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_item_product ON invoice_item(product_id);

-- ===== Índice útil para listar vendedores activos =====
CREATE INDEX IF NOT EXISTS idx_seller_active_name ON seller(active, name);
