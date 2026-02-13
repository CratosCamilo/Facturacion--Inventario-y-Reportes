import { useEffect, useMemo, useRef, useState } from "react";

type Row = {
  productId: number;
  productName: string;
  price: number;
  sortOrder: number;

  carry: number;
  r1: number;
  r2: number;
  r3: number;

  total: number;
};

type DraftRow = {
  carry: string;
  r1: string;
  r2: string;
  r3: string;
};

type FieldKey = keyof DraftRow; // "carry" | "r1" | "r2" | "r3"
type CellKey = string; // `${productId}:${field}`

export default function InventoryView({
  sellerId,
  sellerName,
  onBack,
}: {
  sellerId: number;
  sellerName: string;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Record<number, DraftRow>>({}); // productId -> draft fields

  // ✅ refs para navegación (Enter abajo / Tab ya lo maneja el browser)
  const inputRefs = useRef<Record<CellKey, HTMLInputElement | null>>({});

  async function refresh() {
    const data = await window.api.getInventory(sellerId);
    setRows(data);
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (e: any) {
        setError(e?.message ?? "Error cargando inventario");
      }
    })();
  }, [sellerId]);

  // inicializa el draft cuando entras a modo edición
  useEffect(() => {
    if (!editMode) return;

    const d: Record<number, DraftRow> = {};
    for (const r of rows) {
      d[r.productId] = {
        carry: String(r.carry),
        r1: String(r.r1),
        r2: String(r.r2),
        r3: String(r.r3),
      };
    }
    setDraft(d);

    // opcional: enfoca primera celda al entrar en edición
    setTimeout(() => {
      const first = rows[0];
      if (!first) return;
      const key = `${first.productId}:carry`;
      inputRefs.current[key]?.focus();
      inputRefs.current[key]?.select?.();
    }, 0);
  }, [editMode, rows]);

  function setCell(productId: number, key: keyof DraftRow, value: string) {
    // solo números o vacío (para que se pueda borrar)
    if (value !== "" && !/^\d+$/.test(value)) return;

    setDraft((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] ?? { carry: "", r1: "", r2: "", r3: "" }),
        [key]: value,
      },
    }));
  }

  const canSave = useMemo(() => {
    if (!editMode) return false;
    // todos los inputs deben ser naturales (vacío lo tratamos como 0)
    for (const r of rows) {
      const d = draft[r.productId];
      if (!d) continue;
      for (const k of ["carry", "r1", "r2", "r3"] as const) {
        const v = d[k].trim();
        if (v !== "" && !/^\d+$/.test(v)) return false;
      }
    }
    return true;
  }, [editMode, draft, rows]);

  async function guardarEdicion() {
    setError("");
    setMsg("");

    try {
      const items = rows.map((r) => {
        const d = draft[r.productId] ?? { carry: "", r1: "", r2: "", r3: "" };

        const carry = d.carry.trim() === "" ? 0 : Number(d.carry);
        const r1 = d.r1.trim() === "" ? 0 : Number(d.r1);
        const r2 = d.r2.trim() === "" ? 0 : Number(d.r2);
        const r3 = d.r3.trim() === "" ? 0 : Number(d.r3);

        return { productId: r.productId, carry, r1, r2, r3 };
      });

      // validación natural extra
      for (const it of items) {
        for (const k of ["carry", "r1", "r2", "r3"] as const) {
          if (!Number.isInteger(it[k]) || it[k] < 0) {
            setError("Solo se permiten números naturales (0 o mayor).");
            return;
          }
        }
      }

      const res = await window.api.updateInventory({ sellerId, items });
      if (!res.ok) throw new Error("No se pudo guardar");

      setMsg("✅ Inventario actualizado.");
      setEditMode(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error guardando cambios");
    }
  }

  function cancelarEdicion() {
    setMsg("");
    setError("");
    setEditMode(false);
    setDraft({});
  }

  // ✅ guarda ref por celda
  function setRef(productId: number, field: FieldKey, el: HTMLInputElement | null) {
    inputRefs.current[`${productId}:${field}`] = el;
  }

  // ✅ Enter = misma columna, fila de abajo
  function focusDown(productId: number, field: FieldKey) {
    const idx = rows.findIndex((r) => r.productId === productId);
    if (idx < 0) return;

    // intenta ir a la fila de abajo; si no hay, no hace nada
    const nextRow = rows[idx + 1];
    if (!nextRow) return;

    const key = `${nextRow.productId}:${field}`;
    const el = inputRefs.current[key];
    if (el) {
      el.focus();
      el.select?.();
    }
  }

  function onKeyDownCell(
    e: React.KeyboardEvent<HTMLInputElement>,
    productId: number,
    field: FieldKey
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      focusDown(productId, field);
    }
  }

  return (
    <div className="card">
      <div className="cardBody">
        <div className="pageHeader">
          <div className="pageHeaderLeft">
            <button className="btn btnLink" onClick={onBack}>
              ← Volver
            </button>

            <div>
              <div className="pageTitle">Inventario — {sellerName}</div>
              <div className="pageSubtitle">
                Edición rápida del último inventario facturado y recargas
              </div>
            </div>
          </div>

          <div className="pageHeaderRight">
            {!editMode ? (
              <button className="btn btnPrimary" onClick={() => setEditMode(true)}>
                Editar
              </button>
            ) : (
              <>
                <button className="btn" onClick={cancelarEdicion}>
                  Cancelar
                </button>
                <button className="btn btnPrimary" onClick={guardarEdicion} disabled={!canSave}>
                  Guardar cambios
                </button>
              </>
            )}
          </div>
        </div>

        {(msg || error) && <div className="spacer12" />}

        {msg && <div className="alert alertSuccess">{msg}</div>}
        {error && <div className="alert alertDanger">{error}</div>}

        <div className="spacer12" />

        <div className="tableWrap scrollX">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="right">Último inventario facturado</th>
                <th className="right">Recarga 1</th>
                <th className="right">Recarga 2</th>
                <th className="right">Recarga 3</th>
                <th className="right">Total</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const d = draft[r.productId];

                return (
                  <tr key={r.productId}>
                    <td>{r.productName}</td>

                    {/* carry */}
                    <td className="right">
                      {!editMode ? (
                        r.carry
                      ) : (
                        <input
                          ref={(el) => setRef(r.productId, "carry", el)}
                          value={d?.carry ?? ""}
                          placeholder={String(r.carry)}
                          onChange={(e) => setCell(r.productId, "carry", e.target.value)}
                          onKeyDown={(e) => onKeyDownCell(e, r.productId, "carry")}
                          className="input inputSmall inputRight cellInput90"
                          inputMode="numeric"
                          onClick={(e) => e.currentTarget.select()}
                        />
                      )}
                    </td>

                    {/* r1 */}
                    <td className="right">
                      {!editMode ? (
                        r.r1
                      ) : (
                        <input
                          ref={(el) => setRef(r.productId, "r1", el)}
                          value={d?.r1 ?? ""}
                          placeholder={String(r.r1)}
                          onChange={(e) => setCell(r.productId, "r1", e.target.value)}
                          onKeyDown={(e) => onKeyDownCell(e, r.productId, "r1")}
                          className="input inputSmall inputRight cellInput90"
                          inputMode="numeric"
                          onClick={(e) => e.currentTarget.select()}
                        />
                      )}
                    </td>

                    {/* r2 */}
                    <td className="right">
                      {!editMode ? (
                        r.r2
                      ) : (
                        <input
                          ref={(el) => setRef(r.productId, "r2", el)}
                          value={d?.r2 ?? ""}
                          placeholder={String(r.r2)}
                          onChange={(e) => setCell(r.productId, "r2", e.target.value)}
                          onKeyDown={(e) => onKeyDownCell(e, r.productId, "r2")}
                          className="input inputSmall inputRight cellInput90"
                          inputMode="numeric"
                          onClick={(e) => e.currentTarget.select()}
                        />
                      )}
                    </td>

                    {/* r3 */}
                    <td className="right">
                      {!editMode ? (
                        r.r3
                      ) : (
                        <input
                          ref={(el) => setRef(r.productId, "r3", el)}
                          value={d?.r3 ?? ""}
                          placeholder={String(r.r3)}
                          onChange={(e) => setCell(r.productId, "r3", e.target.value)}
                          onKeyDown={(e) => onKeyDownCell(e, r.productId, "r3")}
                          className="input inputSmall inputRight cellInput90"
                          inputMode="numeric"
                          onClick={(e) => e.currentTarget.select()}
                        />
                      )}
                    </td>

                    {/* total (solo lectura) */}
                    <td className="right">
                      {editMode
                        ? (() => {
                            const carry = d?.carry?.trim() === "" ? r.carry : Number(d?.carry ?? r.carry);
                            const r1 = d?.r1?.trim() === "" ? r.r1 : Number(d?.r1 ?? r.r1);
                            const r2 = d?.r2?.trim() === "" ? r.r2 : Number(d?.r2 ?? r.r2);
                            const r3 = d?.r3?.trim() === "" ? r.r3 : Number(d?.r3 ?? r.r3);
                            return carry + r1 + r2 + r3;
                          })()
                        : r.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="note">
          Tip: en modo edición, puedes usar <span className="noteStrong">Enter</span> para bajar en la misma columna.
        </div>
      </div>
    </div>
  );
}
