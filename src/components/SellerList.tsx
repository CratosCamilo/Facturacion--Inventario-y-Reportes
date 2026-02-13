type Seller = { id: number; name: string };

export default function SellerList({
  sellers,
  onSelect,
}: {
  sellers: Seller[];
  onSelect: (seller: Seller) => void;
}) {
  return (
    <div className="card">
      <div className="cardBody">
        <div className="pageHeader">
          <div>
            <div className="pageTitle">Hola Saul</div>
            <div className="pageSubtitle">Selecciona un vendedor</div>
          </div>
          <div className="pageHeaderRight">
            <span className="badge">👤 {sellers.length} vendedores</span>
          </div>
        </div>

        <div className="grid gridCols3">
          {sellers.map((s) => (
            <button
              key={s.id}
              className="btn btnPrimary btnLeft"
              onClick={() => onSelect(s)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
