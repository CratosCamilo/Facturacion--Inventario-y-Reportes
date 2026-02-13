import { useEffect, useMemo, useState } from "react";

type Seller = { id: number; name: string; active?: number };
type Product = { id: number; name: string; price: number; sortOrder: number; commissionExempt: number };

export default function ConfigModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void; // para refrescar listas en App si quieres
}) {
  const [tab, setTab] = useState<"SELLERS" | "PRODUCTS">("SELLERS");

  // data
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // drafts
  const [newSellerName, setNewSellerName] = useState("");
  const [sellerDraft, setSellerDraft] = useState<Record<number, string>>({});

  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState<string>("");
  const [productDraft, setProductDraft] = useState<Record<number, { name: string; price: string }>>({});

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function loadAll() {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      // ✅ en configuración queremos ver también inactivos
      const [s, p] = await Promise.all([
        window.api.listSellers({ includeInactive: true }),
        window.api.listProducts(),
      ]);

      setSellers(s);
      setProducts(p);

      const sd: Record<number, string> = {};
      s.forEach((x) => (sd[x.id] = x.name));
      setSellerDraft(sd);

      const pd: Record<number, { name: string; price: string }> = {};
      p.forEach((x) => (pd[x.id] = { name: x.name, price: String(x.price) }));
      setProductDraft(pd);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canCreateSeller = useMemo(() => newSellerName.trim().length > 0, [newSellerName]);

  const canCreateProduct = useMemo(() => {
    const n = newProductName.trim();
    const p = newProductPrice.trim();
    return n.length > 0 && (p === "" || /^\d+$/.test(p));
  }, [newProductName, newProductPrice]);

  if (!open) return null;

  return (
    <div
      className="modalOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modalCard card" role="dialog" aria-modal="true">
        <div className="cardBody">
          <div className="modalHeader">
            <div>
              <div className="pageTitle">Configuración</div>
              <div className="pageSubtitle">Administra vendedores y productos</div>
            </div>

            <div className="pageHeaderRight">
              <button className="btn" onClick={() => loadAll()} disabled={loading}>
                {loading ? "Cargando..." : "Refrescar"}
              </button>
              <button className="btn btnPrimary" onClick={() => onClose()}>
                Cerrar
              </button>
            </div>
          </div>

          {(msg || error) && <div className="spacer12" />}
          {msg && <div className="alert alertSuccess">{msg}</div>}
          {error && <div className="alert alertDanger">{error}</div>}

          <div className="spacer12" />

          <div className="reportsTabsRow">
            <button
              className={`reportsTab ${tab === "SELLERS" ? "reportsTabActive" : ""}`}
              onClick={() => setTab("SELLERS")}
            >
              Vendedores
            </button>
            <button
              className={`reportsTab ${tab === "PRODUCTS" ? "reportsTabActive" : ""}`}
              onClick={() => setTab("PRODUCTS")}
            >
              Productos
            </button>
          </div>

          <div className="spacer12" />

          {tab === "SELLERS" && (
            <>
              <div className="reportsSectionHeader">
                <div>
                  <div className="reportsH2">Vendedores</div>
                  <div className="reportsHint">Agregar, editar nombres y activar/inactivar</div>
                </div>
              </div>

              <div className="card">
                <div className="cardBody">
                  <div className="formRow">
                    <div className="field grow">
                      <label className="label">Nuevo vendedor</label>
                      <input
                        className="input"
                        value={newSellerName}
                        onChange={(e) => setNewSellerName(e.target.value)}
                        placeholder="Ej: MARIA PEREZ"
                      />
                    </div>
                    <button
                      className="btn btnPrimary"
                      disabled={!canCreateSeller}
                      onClick={async () => {
                        setError("");
                        setMsg("");
                        try {
                          const name = newSellerName.trim();
                          const res = await window.api.createSeller({ name });
                          if (!res.ok) throw new Error(res.message || "No se pudo crear");
                          setNewSellerName("");
                          setMsg("✅ Vendedor creado.");
                          await loadAll();
                          onDone?.();
                        } catch (e: any) {
                          setError(e?.message ?? "Error");
                        }
                      }}
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </div>

              <div className="spacer12" />

              <div className="tableWrap scrollY maxH420">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nombre</th>
                      <th>Estado</th>
                      <th className="right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((s) => {
                      const isActive = (s.active ?? 1) === 1;

                      return (
                        <tr key={s.id}>
                          <td>{s.id}</td>

                          <td>
                            <input
                              className="input inputSmall"
                              value={sellerDraft[s.id] ?? ""}
                              onChange={(e) => setSellerDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                              disabled={!isActive}
                              title={!isActive ? "Activa el vendedor para editar el nombre" : undefined}
                            />
                          </td>

                          <td>
                            <span className={`badge ${isActive ? "badgeSuccess" : "badgeMuted"}`}>
                              {isActive ? "Activo" : "Inactivo"}
                            </span>
                          </td>

                          <td className="right">
                            <div className="rowActions">
                              <button
                                className="btn btnSmall"
                                disabled={!isActive}
                                onClick={async () => {
                                  setError("");
                                  setMsg("");
                                  try {
                                    const name = (sellerDraft[s.id] ?? "").trim();
                                    const res = await window.api.updateSeller({ id: s.id, name });
                                    if (!res.ok) throw new Error(res.message || "No se pudo actualizar");
                                    setMsg("✅ Vendedor actualizado.");
                                    await loadAll();
                                    onDone?.();
                                  } catch (e: any) {
                                    setError(e?.message ?? "Error");
                                  }
                                }}
                              >
                                Guardar
                              </button>

                              <button
                                className={`btn btnSmall ${isActive ? "btnDanger" : ""}`}
                                onClick={async () => {
                                  setError("");
                                  setMsg("");
                                  try {
                                    const res = await window.api.setSellerActive({ id: s.id, active: !isActive });
                                    if (!res.ok) throw new Error(res.message || "No se pudo actualizar el estado");

                                    setMsg(isActive ? "✅ Vendedor inactivado." : "✅ Vendedor activado.");
                                    await loadAll();
                                    onDone?.();
                                  } catch (e: any) {
                                    setError(e?.message ?? "Error");
                                  }
                                }}
                              >
                                {isActive ? "Inactivar" : "Activar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {sellers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="reportsEmptyRow">
                          No hay vendedores.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "PRODUCTS" && (
            <>
              <div className="reportsSectionHeader">
                <div>
                  <div className="reportsH2">Productos</div>
                  <div className="reportsHint">Agregar y editar nombre / precio</div>
                </div>
              </div>

              <div className="card">
                <div className="cardBody">
                  <div className="formRow">
                    <div className="field grow">
                      <label className="label">Nuevo producto</label>
                      <input
                        className="input"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        placeholder="Ej: PAN INTEGRAL 500"
                      />
                    </div>

                    <div className="field w160">
                      <label className="label">Precio</label>
                      <input
                        className="input inputRight"
                        value={newProductPrice}
                        inputMode="numeric"
                        placeholder="0"
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d+$/.test(v)) setNewProductPrice(v);
                        }}
                      />
                    </div>

                    <button
                      className="btn btnPrimary"
                      disabled={!canCreateProduct}
                      onClick={async () => {
                        setError("");
                        setMsg("");
                        try {
                          const name = newProductName.trim();
                          const price = newProductPrice.trim() === "" ? 0 : Number(newProductPrice);
                          const res = await window.api.createProduct({ name, price });
                          if (!res.ok) throw new Error(res.message || "No se pudo crear");
                          setNewProductName("");
                          setNewProductPrice("");
                          setMsg("✅ Producto creado.");
                          await loadAll();
                          onDone?.();
                        } catch (e: any) {
                          setError(e?.message ?? "Error");
                        }
                      }}
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </div>

              <div className="spacer12" />

              <div className="tableWrap scrollY maxH420">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Producto</th>
                      <th className="right">Precio</th>
                      <th className="right">Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td>{p.id}</td>
                        <td>
                          <input
                            className="input inputSmall"
                            value={productDraft[p.id]?.name ?? ""}
                            onChange={(e) =>
                              setProductDraft((d) => ({
                                ...d,
                                [p.id]: { ...(d[p.id] ?? { name: "", price: "" }), name: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="right">
                          <input
                            className="input inputSmall inputRight cellInput120"
                            inputMode="numeric"
                            value={productDraft[p.id]?.price ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d+$/.test(v)) {
                                setProductDraft((d) => ({
                                  ...d,
                                  [p.id]: { ...(d[p.id] ?? { name: "", price: "" }), price: v },
                                }));
                              }
                            }}
                          />
                        </td>
                        <td className="right">
                          <button
                            className="btn btnSmall"
                            onClick={async () => {
                              setError("");
                              setMsg("");
                              try {
                                const name = (productDraft[p.id]?.name ?? "").trim();
                                const priceRaw = (productDraft[p.id]?.price ?? "").trim();
                                const price = priceRaw === "" ? 0 : Number(priceRaw);

                                const res = await window.api.updateProduct({ id: p.id, name, price });
                                if (!res.ok) throw new Error(res.message || "No se pudo actualizar");
                                setMsg("✅ Producto actualizado.");
                                await loadAll();
                              } catch (e: any) {
                                setError(e?.message ?? "Error");
                              }
                            }}
                          >
                            Guardar
                          </button>
                        </td>
                      </tr>
                    ))}

                    {products.length === 0 && (
                      <tr>
                        <td colSpan={4} className="reportsEmptyRow">
                          No hay productos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="note mt16">
            Nota: esto solo permite <span className="noteStrong">agregar</span> y{" "}
            <span className="noteStrong">editar</span>. No hay eliminar (más seguro).
          </div>
        </div>
      </div>
    </div>
  );
}
