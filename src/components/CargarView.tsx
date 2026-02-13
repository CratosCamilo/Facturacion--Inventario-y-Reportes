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

  nextSlot: number; // 1|2|3|0
  total: number;
};

export default function CargarView({
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
  const [draft, setDraft] = useState<Record<number, string>>({});

  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  async function refresh() {
    const data = await window.api.getInventory(sellerId);
    setRows(data);
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (e: any) {
        setError(e?.message ?? "Error cargando datos");
      }
    })();
  }, [sellerId]);

  const nextSlot = useMemo(() => rows[0]?.nextSlot ?? 1, [rows]);

  const editableColName =
    nextSlot === 1
      ? "Recarga 1"
      : nextSlot === 2
      ? "Recarga 2"
      : nextSlot === 3
      ? "Recarga 3"
      : "Recargas completas";

  function focusNext(currentProductId: number) {
    const idx = rows.findIndex((r) => r.productId === currentProductId);
    if (idx < 0) return;

    for (let i = idx + 1; i < rows.length; i++) {
      const el = inputRefs.current[rows[i].productId];
      if (el) {
        el.focus();
        return;
      }
    }
  }

  function renderEditableCell(r: Row, slot: 1 | 2 | 3) {
    const canEdit = nextSlot === slot;

    if (!canEdit) {
      return slot === 1 ? r.r1 : slot === 2 ? r.r2 : r.r3;
    }

    return (
      <input
        ref={(el) => {
          inputRefs.current[r.productId] = el;
        }}
        value={draft[r.productId] ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          // Solo dígitos o vacío
          if (v === "" || /^\d+$/.test(v)) {
            setDraft((d) => ({ ...d, [r.productId]: v }));
          }
        }}
        onClick={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            focusNext(r.productId);
          }
        }}
        className="input inputSmall inputRight cellInput90"
        inputMode="numeric"
        placeholder="0"
      />
    );
  }

  async function guardarRecarga() {
    setMsg("");
    setError("");

    if (![1, 2, 3].includes(nextSlot)) {
      setMsg("No se puede cargar: R1, R2 y R3 ya están ocupadas. Debes facturar.");
      return;
    }

    const items = rows.map((r) => {
      const raw = (draft[r.productId] ?? "").trim();
      const val = raw === "" ? "0" : raw;
      return { productId: r.productId, quantity: Number(val) };
    });

    // validar naturales (solo si escribió algo)
    for (const r of rows) {
      const raw = (draft[r.productId] ?? "").trim();
      if (raw !== "" && !/^\d+$/.test(raw)) {
        setError("Solo se permiten números naturales (0 o mayor).");
        return;
      }
    }

    const anyPositive = items.some((x) => x.quantity > 0);
    if (!anyPositive) {
      setMsg("No se guardó: debes ingresar al menos 1 producto con cantidad > 0.");
      return;
    }

    const res = await window.api.commitRechargeDay({ sellerId, items });
    if (!res.ok) {
      setMsg(res.message);
      return;
    }

    setDraft({});
    setMsg(`Recarga guardada (${editableColName}).`);
    await refresh();
  }

  const slotIsEditable = (slot: 1 | 2 | 3) => nextSlot === slot;

  return (
    <div className="card">
      <div className="cardBody">
        <div className="pageHeader">
          <div className="pageHeaderLeft">
            <button className="btn btnLink" onClick={onBack}>
              ← Volver
            </button>

            <div>
              <div className="pageTitle">Cargar — {sellerName}</div>
              <div className="pageSubtitle">Ingresa cantidades para la recarga disponible y guarda.</div>
            </div>
          </div>

          <div className="pageHeaderRight">
            <span className="badge">✍️ Columna editable: {editableColName}</span>
            <button className="btn btnPrimary" onClick={guardarRecarga} disabled={nextSlot === 0}>
              Guardar recarga
            </button>
          </div>
        </div>

        {(msg || error) && <div className="spacer12" />}

        {msg && <div className="alert">{msg}</div>}
        {error && <div className="alert alertDanger">{error}</div>}

        <div className="spacer12" />

        <div className="tableWrap scrollX">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="right">Último inventario facturado</th>
                <th className={`right ${slotIsEditable(1) ? "colEditable" : ""}`}>Recarga 1</th>
                <th className={`right ${slotIsEditable(2) ? "colEditable" : ""}`}>Recarga 2</th>
                <th className={`right ${slotIsEditable(3) ? "colEditable" : ""}`}>Recarga 3</th>
                <th className="right">Total</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.productId}>
                  <td>{r.productName}</td>
                  <td className="right">{r.carry}</td>

                  <td className={`right ${slotIsEditable(1) ? "colEditable" : ""}`}>
                    {renderEditableCell(r, 1)}
                  </td>

                  <td className={`right ${slotIsEditable(2) ? "colEditable" : ""}`}>
                    {renderEditableCell(r, 2)}
                  </td>

                  <td className={`right ${slotIsEditable(3) ? "colEditable" : ""}`}>
                    {renderEditableCell(r, 3)}
                  </td>

                  <td className="right">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="note">
          Tip: usa <span className="noteStrong">Enter</span> o <span className="noteStrong">Tab</span> para saltar al
          siguiente producto.
        </div>
      </div>
    </div>
  );
}
