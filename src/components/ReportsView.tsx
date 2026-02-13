// src/components/ReportsView.tsx
import { useEffect, useMemo, useState } from "react";
import "./ReportsView.css";

type Tab = "HISTORIAL" | "CONSOLIDADO" | "PRODUCTOS" | "VENDEDORES";

export default function ReportsView({
  mode,
  onBack,
  sellerId,
  sellerName,
}: {
  mode: "GLOBAL" | "SELLER";
  onBack: () => void;
  sellerId?: number;
  sellerName?: string;
}) {
  const isGlobal = mode === "GLOBAL";

  const [tab, setTab] = useState<Tab>("HISTORIAL");

  // filtros
  const [filterSellerId, setFilterSellerId] = useState<number | "">(
    isGlobal ? "" : (sellerId ?? "")
  );
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(""); // YYYY-MM-DD

  // catálogo vendedores (solo global)
  const [sellers, setSellers] = useState<Array<{ id: number; name: string }>>(
    []
  );

  // data
  const [loading, setLoading] = useState(false);
  const [hist, setHist] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [bySeller, setBySeller] = useState<any[]>([]);

  const filters = useMemo(() => {
    const f: any = {
      invoiceId: invoiceId ? Number(invoiceId) : null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      includeSeller: isGlobal, // si global queremos sellerName en historial
    };

    if (isGlobal) {
      f.sellerId = filterSellerId === "" ? null : Number(filterSellerId);
    } else {
      f.sellerId = sellerId ?? null;
    }

    return f;
  }, [invoiceId, dateFrom, dateTo, isGlobal, filterSellerId, sellerId]);

  // cargar sellers si global
  useEffect(() => {
    if (!isGlobal) return;
    (async () => {
      const data = await window.api.listSellers();
      setSellers(data);
    })();
  }, [isGlobal]);

  async function refresh() {
    setLoading(true);
    try {
      // siempre carga historial (para que la pestaña inicial sea inmediata)
      const h = await window.api.invoiceList(filters);
      setHist(h);

      // carga el tab activo
      if (tab === "CONSOLIDADO") {
        const s = await window.api.reportSalesSummary(filters);
        setSummary(s);
      } else if (tab === "PRODUCTOS") {
        const p = await window.api.reportProductsSold(filters);
        setProducts(p);
      } else if (tab === "VENDEDORES") {
        const v = await window.api.reportSalesBySeller(filters);
        setBySeller(v);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtersGridClass = isGlobal ? "reportsFiltersGrid reportsFiltersGrid4" : "reportsFiltersGrid reportsFiltersGrid3";

  return (
    <div className="card">
      <div className="cardBody">
        {/* ===== Header ===== */}
        <div className="pageHeader">
          <div className="pageHeaderLeft">
            <button onClick={onBack} className="btn btnLink">
              ← Volver
            </button>

            <div>
              <div className="pageTitle">
                {isGlobal ? "Reportes (Global)" : `Reportes — ${sellerName ?? "Vendedor"}`}
              </div>
              <div className="pageSubtitle">
                Filtros por fecha / factura {isGlobal ? "/ vendedor" : ""}
              </div>
            </div>
          </div>

          <div className="pageHeaderRight">
            <span className="badge">📌 {tab}</span>
            <button
              className="btn"
              onClick={() => {
                setInvoiceId("");
                setDateFrom("");
                setDateTo("");
                if (isGlobal) setFilterSellerId("");
              }}
            >
              Limpiar
            </button>
            <button onClick={refresh} disabled={loading} className="btn btnPrimary">
              {loading ? "Cargando..." : "Aplicar filtros"}
            </button>
          </div>
        </div>

        {/* ===== Filtros ===== */}
        <div className="card">
          <div className="cardBody">
            <div className={filtersGridClass}>
              {isGlobal && (
                <div className="field">
                  <label className="label">Vendedor</label>
                  <select
                    value={filterSellerId}
                    onChange={(e) =>
                      setFilterSellerId(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="select"
                  >
                    <option value="">Todos</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="field">
                <label className="label">ID Factura</label>
                <input
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  placeholder="Ej: 120"
                  className="input"
                  inputMode="numeric"
                />
              </div>

              <div className="field">
                <label className="label">Desde</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input"
                />
              </div>

              <div className="field">
                <label className="label">Hasta</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div className="reportsFiltersActions">
              <span className="muted" style={{ alignSelf: "center" }}>
                Tip: usa rangos de fechas para acelerar búsquedas.
              </span>
            </div>
          </div>
        </div>

        {/* ===== Tabs ===== */}
        <div className="reportsTabsRow">
          <button
            onClick={() => setTab("HISTORIAL")}
            className={`reportsTab ${tab === "HISTORIAL" ? "reportsTabActive" : ""}`}
          >
            Historial
          </button>

          <button
            onClick={() => setTab("CONSOLIDADO")}
            className={`reportsTab ${tab === "CONSOLIDADO" ? "reportsTabActive" : ""}`}
          >
            Consolidado
          </button>

          <button
            onClick={() => setTab("PRODUCTOS")}
            className={`reportsTab ${tab === "PRODUCTOS" ? "reportsTabActive" : ""}`}
          >
            Productos
          </button>

          {isGlobal && (
            <button
              onClick={() => setTab("VENDEDORES")}
              className={`reportsTab ${tab === "VENDEDORES" ? "reportsTabActive" : ""}`}
            >
              Vendedores
            </button>
          )}
        </div>

        {/* ===== Contenido ===== */}
        <div className="mt16">
          {tab === "HISTORIAL" && (
            <>
              <div className="reportsSectionHeader">
                <div>
                  <div className="reportsH2">Facturas</div>
                  <div className="reportsHint">Listado según filtros seleccionados</div>
                </div>

                <button
                  onClick={() => window.api.exportInvoicesExcel(filters)}
                  className="btn"
                >
                  Exportar Excel
                </button>
              </div>

              <div className="tableWrap scrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
                      {isGlobal && <th>Vendedor</th>}
                      <th className="right">Total</th>
                      <th className="right">Comisión</th>
                      <th className="right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {hist.map((r) => (
                      <tr key={r.invoiceId}>
                        <td>{r.invoiceId}</td>
                        <td>{new Date(r.issuedAt).toLocaleString()}</td>
                        {isGlobal && <td>{r.sellerName ?? "-"}</td>}
                        <td className="right">
                          ${Number(r.payableTotal).toLocaleString("es-CO")}
                        </td>
                        <td className="right">
                          ${Number(r.commissionValue).toLocaleString("es-CO")}
                        </td>
                        <td className="right">
                          <button
                            className="btn btnSmall"
                            onClick={async () => {
                              const res = await window.api.downloadInvoicePdf({
                                invoiceId: r.invoiceId,
                              });
                              if (!res.ok) alert(res.message);
                            }}
                          >
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}

                    {hist.length === 0 && (
                      <tr>
                        <td colSpan={isGlobal ? 6 : 5} className="reportsEmptyRow">
                          No hay facturas con esos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "CONSOLIDADO" && (
            <>
              <div className="reportsSectionHeader">
                <div>
                  <div className="reportsH2">Consolidado</div>
                  <div className="reportsHint">Sumatorias generales del período</div>
                </div>

                <button
                  onClick={() => window.api.exportSalesSummaryExcel(filters)}
                  className="btn"
                >
                  Exportar Excel
                </button>
              </div>

              <div className="card">
                <div className="cardBody">
                  {!summary ? (
                    <div className="muted">Cargando...</div>
                  ) : (
                    <div className="reportsSummaryGrid">
                      <Box label="Facturas" value={summary.count} />
                      <Box
                        label="Subtotal"
                        value={`$ ${Number(summary.subtotalSum).toLocaleString("es-CO")}`}
                      />
                      <Box
                        label="Exentos"
                        value={`$ ${Number(summary.exemptSum).toLocaleString("es-CO")}`}
                      />
                      <Box
                        label="Cambios"
                        value={`$ ${Number(summary.changesSum).toLocaleString("es-CO")}`}
                      />
                      <Box
                        label="Comisión"
                        value={`$ ${Number(summary.commissionSum).toLocaleString("es-CO")}`}
                      />
                      <Box
                        label="Total a pagar"
                        value={`$ ${Number(summary.payableSum).toLocaleString("es-CO")}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === "PRODUCTOS" && (
            <>
              <div className="reportsSectionHeader">
                <div>
                  <div className="reportsH2">Productos vendidos</div>
                  <div className="reportsHint">Unidades, ventas y cambios por producto</div>
                </div>

                <button
                  onClick={() => window.api.exportProductsSoldExcel(filters)}
                  className="btn"
                >
                  Exportar Excel
                </button>
              </div>

              <div className="tableWrap scrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="right">Unid</th>
                      <th className="right">Ventas</th>
                      <th className="right">Cambios (unid)</th>
                      <th className="right">Cambios ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.productId}>
                        <td>
                          {p.productName}
                          {p.exempt ? <span className="muted"> (E)</span> : ""}
                        </td>
                        <td className="right">{p.unitsSold}</td>
                        <td className="right">
                          ${Number(p.salesTotal).toLocaleString("es-CO")}
                        </td>
                        <td className="right">{p.changesUnits}</td>
                        <td className="right">
                          ${Number(p.changesValue).toLocaleString("es-CO")}
                        </td>
                      </tr>
                    ))}

                    {products.length === 0 && (
                      <tr>
                        <td colSpan={5} className="reportsEmptyRow">
                          No hay productos con esos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "VENDEDORES" && isGlobal && (
            <>
              <div className="reportsSectionHeader">
                <div>
                  <div className="reportsH2">Ventas por vendedor</div>
                  <div className="reportsHint">Comparativo por vendedor</div>
                </div>

                <button
                  onClick={() => window.api.exportSalesBySellerExcel(filters)}
                  className="btn"
                >
                  Exportar Excel
                </button>
              </div>

              <div className="tableWrap scrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th className="right">Facturas</th>
                      <th className="right">Total a pagar</th>
                      <th className="right">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySeller.map((s) => (
                      <tr key={s.sellerId}>
                        <td>{s.sellerName}</td>
                        <td className="right">{s.count}</td>
                        <td className="right">
                          ${Number(s.payableSum).toLocaleString("es-CO")}
                        </td>
                        <td className="right">
                          ${Number(s.commissionSum).toLocaleString("es-CO")}
                        </td>
                      </tr>
                    ))}

                    {bySeller.length === 0 && (
                      <tr>
                        <td colSpan={4} className="reportsEmptyRow">
                          No hay datos con esos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: any }) {
  return (
    <div className="reportsBox">
      <div className="reportsBoxLabel">{label}</div>
      <div className="reportsBoxValue">{value}</div>
    </div>
  );
}
