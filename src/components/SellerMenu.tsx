type Seller = { id: number; name: string };

export default function SellerMenu({
  seller,
  onBack,
  onOpen,
}: {
  seller: Seller;
  onBack: () => void;
  onOpen: (module: "CARGAR" | "FACTURAR" | "INVENTARIO" | "INFORMES") => void;
}) {
  return (
    <div className="card">
      <div className="cardBody">
        <div className="pageHeader">
          <div>
            <div className="pageTitle">Administrando a {seller.name}</div>
            <div className="pageSubtitle">Elige un módulo</div>
          </div>
          <div className="pageHeaderRight">
            <button className="btn btnLink" onClick={onBack}>
              ← Volver
            </button>
          </div>
        </div>

        <div className="grid gridCols2 max620">
          <button className="btn btnPrimary" onClick={() => onOpen("CARGAR")}>
            Cargar
          </button>
          <button className="btn btnPrimary" onClick={() => onOpen("FACTURAR")}>
            Facturar
          </button>
          <button className="btn" onClick={() => onOpen("INVENTARIO")}>
            Inventario
          </button>
          <button className="btn" onClick={() => onOpen("INFORMES")}>
            Informes
          </button>
        </div>
      </div>
    </div>
  );
}
