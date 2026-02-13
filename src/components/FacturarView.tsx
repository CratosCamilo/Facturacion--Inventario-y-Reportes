import { useEffect, useMemo, useRef, useState } from "react";

type Row = {
  productId: number;
  productName: string;
  price: number;

  carry: number;
  r1: number;
  r2: number;
  r3: number;

  total: number; // carry+r1+r2+r3
  commissionExempt?: number; // 1 exento
};

type CellKey = string; // `${productId}:final` | `${productId}:chg`

export default function FacturarView({
  sellerId,
  sellerName,
  onBack,
}: {
  sellerId: number;
  sellerName: string;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [draftFinal, setDraftFinal] = useState<Record<number, string>>({});
  const [draftChanges, setDraftChanges] = useState<Record<number, string>>({});
  const [commissionPercent, setCommissionPercent] = useState<string>(""); // obligatorio
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);

  const inputRefs = useRef<Record<CellKey, HTMLInputElement | null>>({});
  const commissionRef = useRef<HTMLInputElement | null>(null);

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

  function setRef(key: CellKey, el: HTMLInputElement | null) {
    inputRefs.current[key] = el;
  }

  function focusCell(key: CellKey) {
    const el = inputRefs.current[key];
    if (el) el.focus();
  }

  const tabOrder = useMemo(() => {
    const finals = rows.map((r) => `${r.productId}:final`);
    const chgs = rows.map((r) => `${r.productId}:chg`);
    return [...finals, ...chgs];
  }, [rows]);

  function focusNextKey(current: CellKey) {
    const idx = tabOrder.indexOf(current);
    if (idx < 0) return;
    for (let i = idx + 1; i < tabOrder.length; i++) {
      const k = tabOrder[i];
      const el = inputRefs.current[k];
      if (el) {
        el.focus();
        return;
      }
    }
  }

  function getNaturalFromDraft(map: Record<number, string>, productId: number) {
    const raw = (map[productId] ?? "").trim();
    if (raw === "") return 0;
    return Number(raw);
  }

  // ✅ obligatorio: si está vacío => null (inválido)
  function parseCommissionPercent(): number | null {
    const raw = commissionPercent.trim();
    if (raw === "") return null;
    return Number(raw);
  }

  const computed = useMemo(() => {
    let subtotal = 0;
    let exemptTotal = 0;
    let changesTotal = 0;

    let hasInvalid = false;
    let invalidMsg = "";
    let firstInvalidKey: CellKey | null = null;

    const pct = parseCommissionPercent();
    if (pct === null) {
      hasInvalid = true;
      invalidMsg = "El % de comisión es obligatorio. Si es 0, digita 0.";
      firstInvalidKey = null;
    } else if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      hasInvalid = true;
      invalidMsg = "El % debe ser un número entero entre 0 y 100.";
      firstInvalidKey = null;
    }

    const lines = rows.map((r) => {
      const available = r.carry + r.r1 + r.r2 + r.r3;

      const finalQty = getNaturalFromDraft(draftFinal, r.productId);
      const changesQty = getNaturalFromDraft(draftChanges, r.productId);

      if (!Number.isInteger(finalQty) || finalQty < 0) {
        if (!hasInvalid) {
          hasInvalid = true;
          invalidMsg = `Inventario final inválido en: ${r.productName}`;
          firstInvalidKey = `${r.productId}:final`;
        }
      }

      if (!Number.isInteger(changesQty) || changesQty < 0) {
        if (!hasInvalid) {
          hasInvalid = true;
          invalidMsg = `Cambios inválido en: ${r.productName}`;
          firstInvalidKey = `${r.productId}:chg`;
        }
      }

      if (finalQty + changesQty > available) {
        if (!hasInvalid) {
          hasInvalid = true;
          invalidMsg = `No se puede: Inventario final + cambios supera disponible en ${r.productName}`;
          firstInvalidKey = `${r.productId}:chg`;
        }
      }

      const billedQty = Math.max(0, available - finalQty - changesQty);
      const lineTotal = billedQty * r.price;
      const chgValue = changesQty * r.price;

      subtotal += lineTotal;
      changesTotal += chgValue;

      const exempt = (r.commissionExempt ?? 0) === 1;
      if (exempt) exemptTotal += lineTotal;

      return {
        ...r,
        available,
        finalQty,
        changesQty,
        billedQty,
        lineTotal,
        changesValue: chgValue,
        exempt,
      };
    });

    const commissionBase = subtotal - exemptTotal;

    const pctInt = pct ?? 0;
    const commissionValue = Math.round((commissionBase * pctInt) / 100);
    const payableTotal = subtotal - commissionValue;

    const baseNoExemptGross = commissionBase + changesTotal;
    const subtotalNoExemptNet = commissionBase;
    const totalNoExemptAfterCommission = Math.max(0, subtotalNoExemptNet - commissionValue);

    return {
      lines,
      subtotal,
      exemptTotal,
      changesTotal,
      commissionBase,
      commissionValue,
      payableTotal,
      baseNoExemptGross,
      subtotalNoExemptNet,
      totalNoExemptAfterCommission,
      hasInvalid,
      invalidMsg,
      firstInvalidKey,
      commissionPercentInt: pct ?? 0,
      pctNullable: pct,
    };
  }, [rows, draftFinal, draftChanges, commissionPercent]);

  function openConfirmModal() {
    setError("");
    setMsg("");

    // ✅ validación primero
    if (computed.hasInvalid) {
      setError(computed.invalidMsg || "Hay valores inválidos.");

      if (computed.firstInvalidKey) {
        setTimeout(() => focusCell(computed.firstInvalidKey!), 0);
      } else {
        // si el error es el % comisión
        setTimeout(() => commissionRef.current?.focus(), 0);
      }
      return;
    }

    setConfirmOpen(true);
  }

  async function confirmarFacturar() {
    setConfirmOpen(false);
    setError("");
    setMsg("");

    const pct = computed.pctNullable ?? 0;

    const lines = rows.map((r) => ({
      productId: r.productId,
      finalQty: getNaturalFromDraft(draftFinal, r.productId),
      changesQty: getNaturalFromDraft(draftChanges, r.productId),
    }));

    const res = await window.api.commitInvoice({
      sellerId,
      commissionPercent: pct,
      lines,
    });

    if (!res.ok) {
      setError("No se pudo facturar.");
      return;
    }

    if (res.invoiceId) {
      const pdfRes = await window.api.downloadInvoicePdf({ invoiceId: res.invoiceId });
      if (!pdfRes.ok) {
        setError("✅ Factura guardada, pero no se pudo generar/guardar el PDF.");
      }
    }

    setDraftFinal({});
    setDraftChanges({});
    setMsg(`✅ Liquidación guardada. TOTAL A PAGAR: $ ${computed.payableTotal.toLocaleString("es-CO")}`);
    await refresh();
  }

  return (
    <div className="card facturarFullBleed">
      <div className="cardBody">
        <div className="pageHeader">
          <div className="pageHeaderLeft">
            <button className="btn btnLink" onClick={onBack}>
              ← Volver
            </button>

            <div>
              <div className="pageTitle">Facturar — {sellerName}</div>
              <div className="pageSubtitle">
                Ingresa inventario final y cambios. El resumen se actualiza al digitar.
              </div>
            </div>
          </div>

          <div className="pageHeaderRight">
            <span className="badge">%</span>

            <div className="fieldInline">
              <span className="label">% Comisión</span>
              <input
                ref={(el) => { commissionRef.current = el; }}  // ✅ FIX TS
                value={commissionPercent}
                inputMode="numeric"
                placeholder="0"
                className="input inputSmall inputRight cellInput70"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d+$/.test(v)) setCommissionPercent(v);
                }}
                onBlur={() => {
                  // si lo dejan vacío, no forzamos nada, solo se validará al confirmar
                }}
                onClick={(e) => e.currentTarget.select()}
              />
            </div>

            <button className="btn btnPrimary" onClick={openConfirmModal}>
              Aceptar / Facturar
            </button>
          </div>
        </div>

        {(msg || error) && <div className="spacer12" />}
        {msg && <div className="alert alertSuccess">{msg}</div>}
        {error && <div className="alert alertDanger">{error}</div>}

        <div className="spacer12" />

        <div className="twoCol">
          {/* TABLE */}
          <div className="tableWrap scrollX">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="right">Inventario inicial</th>
                  <th className="right">Recarga 1</th>
                  <th className="right">Recarga 2</th>
                  <th className="right">Recarga 3</th>
                  <th className="right">Inventario final</th>
                  <th className="right">Cambios</th>
                  <th className="right">Producto a facturar</th>
                  <th className="right">Total $</th>
                </tr>
              </thead>

              <tbody>
                {computed.lines.map((r) => {
                  const finalKey: CellKey = `${r.productId}:final`;
                  const chgKey: CellKey = `${r.productId}:chg`;

                  return (
                    <tr key={r.productId}>
                      <td>
                        {r.productName}
                        {r.exempt ? <span className="muted ml8">(Exento)</span> : null}
                      </td>

                      <td className="right">{r.carry}</td>
                      <td className="right">{r.r1}</td>
                      <td className="right">{r.r2}</td>
                      <td className="right">{r.r3}</td>

                      <td className="right">
                        <input
                          ref={(el) => setRef(finalKey, el)}
                          value={draftFinal[r.productId] ?? ""}
                          placeholder="0"
                          inputMode="numeric"
                          className="input inputSmall inputRight cellInput90"
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v)) {
                              setDraftFinal((d) => ({ ...d, [r.productId]: v }));
                            }
                          }}
                          onClick={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              focusNextKey(finalKey);
                            }
                          }}
                        />
                      </td>

                      <td className="right">
                        <input
                          ref={(el) => setRef(chgKey, el)}
                          value={draftChanges[r.productId] ?? ""}
                          placeholder="0"
                          inputMode="numeric"
                          className="input inputSmall inputRight cellInput90"
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v)) {
                              setDraftChanges((d) => ({ ...d, [r.productId]: v }));
                            }
                          }}
                          onClick={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              focusNextKey(chgKey);
                            }
                          }}
                        />
                      </td>

                      <td className="right">{r.billedQty}</td>
                      <td className="right">{r.lineTotal.toLocaleString("es-CO")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PANEL DERECHO */}
          <div className="card sidePanel">
            <div className="cardBody">
              <div className="panelTitle">Resumen (se actualiza al digitar)</div>

              <RowLineDark label="Total sin pudines ni rosquitas" value={computed.baseNoExemptGross} />
              <RowLineDark label="Cambios" value={computed.changesTotal} negative />

              <hr className="hr" />

              <RowLineDark label="Subtotal" value={computed.subtotalNoExemptNet} />
              <RowLineDark
                label={`Comisión (${computed.commissionPercentInt}%)`}
                value={computed.commissionValue}
                negative
              />

              <hr className="hr" />

              <RowLineDark label="Total sin rosquitas ni pudín" value={computed.totalNoExemptAfterCommission} />
              <RowLineDark label="Rosquitas + pudín (exentos)" value={computed.exemptTotal} />

              <hr className="hr" />

              <div className="totalRow">
                <b>TOTAL A PAGAR</b>
                <b>$ {computed.payableTotal.toLocaleString("es-CO")}</b>
              </div>

              <div className="note">
                Aviso:
                <br />
                <span className="noteStrong">comisión aplica solo a NO exentos</span>
              </div>
            </div>
          </div>
        </div>

        <div className="note mt16">
          Tip: usa <span className="noteStrong">Enter</span> o <span className="noteStrong">Tab</span> para avanzar por
          los campos en el orden definido.
        </div>
      </div>

      {/* ✅ MODAL CONFIRMAR */}
      {confirmOpen && (
        <div
          className="modalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="modalCard card" role="dialog" aria-modal="true">
            <div className="cardBody">
              <div className="modalHeader">
                <div>
                  <div className="pageTitle">Confirmar liquidación</div>
                  <div className="pageSubtitle">Vendedor: {sellerName}</div>
                </div>

                <div className="pageHeaderRight">
                  <button className="btn" onClick={() => setConfirmOpen(false)}>
                    Cancelar
                  </button>
                  <button className="btn btnPrimary" onClick={confirmarFacturar}>
                    Confirmar / Facturar
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="cardBody">
                  <div className="panelTitle">Resumen</div>

                  <RowLineDark label="Total sin pudines ni rosquitas" value={computed.baseNoExemptGross} />
                  <RowLineDark label="Cambios" value={computed.changesTotal} negative />

                  <hr className="hr" />

                  <RowLineDark label="Subtotal" value={computed.subtotalNoExemptNet} />
                  <RowLineDark
                    label={`Comisión (${computed.commissionPercentInt}%)`}
                    value={computed.commissionValue}
                    negative
                  />

                  <hr className="hr" />

                  <RowLineDark label="Total sin rosquitas ni pudín" value={computed.totalNoExemptAfterCommission} />
                  <RowLineDark label="Rosquitas + pudín (exentos)" value={computed.exemptTotal} />

                  <hr className="hr" />

                  <div className="totalRow">
                    <b>TOTAL A PAGAR</b>
                    <b>$ {computed.payableTotal.toLocaleString("es-CO")}</b>
                  </div>

                  <div className="note">
                    Aviso:
                    <br />
                    <span className="noteStrong">comisión aplica solo a NO exentos</span>
                  </div>
                </div>
              </div>

              <div className="note mt16">
                Esto generará la factura y luego te pedirá guardar el PDF.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RowLineDark({
  label,
  value,
  negative,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="rowLine">
      <span className="rowLineLabel">{label}</span>
      <span className="rowLineValue">
        {negative ? "- " : ""}$ {Math.abs(value).toLocaleString("es-CO")}
      </span>
    </div>
  );
}
