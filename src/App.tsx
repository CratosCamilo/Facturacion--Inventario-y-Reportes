// src/App.tsx
import { useEffect, useState } from "react";
import SellerList from "./components/SellerList";
import SellerMenu from "./components/SellerMenu";
import InventoryView from "./components/InventoryView";
import CargarView from "./components/CargarView";
import FacturarView from "./components/FacturarView";
import ReportsView from "./components/ReportsView"; // ✅ nuevo
import ConfigModal from "./components/ConfigModal";


type Seller = { id: number; name: string };
type View =
  | "SELLERS"
  | "MENU"
  | "INVENTORY"
  | "CARGAR"
  | "FACTURAR"
  | "REPORTS_SELLER"
  | "REPORTS_GLOBAL";

export default function App() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [view, setView] = useState<View>("SELLERS");
  const [configOpen, setConfigOpen] = useState(false);


  useEffect(() => {
    (async () => {
      try {
        const data = await window.api.listSellers();
        setSellers(data);
      } catch (e) {
        console.error("Error inicializando la app:", e);
      }
    })();
  }, []);

  const topbarSubtitle =
  view === "SELLERS"
    ? "Sistema de facturación e inventario"
    : view === "REPORTS_GLOBAL"
      ? "Reportes globales"
      : selectedSeller
        ? `Vendedor: ${selectedSeller.name}`
        : "Módulo";


  return (
    <div className="appShell">
      <header className="appTopbar">
        <div className="appTopbarInner">
          <div className="brand">
            <div className="brandMark" aria-hidden="true">
              <img src="/assets/logonb.png" alt="" className="brandLogo" />
            </div>

            <div className="brandText">
              <div className="brandTitle">INDUSTRIA BIZCOPAN ZAPATOCA — Dashboard</div>
              <div className="brandSub">{topbarSubtitle}</div>
            </div>
          </div>

          <div className="topbarActions">
            {view === "SELLERS" && (
              <>
                {/* Reportes globales */}
                <button
                  className="btn btnPrimary"
                  onClick={() => {
                    setSelectedSeller(null);      // ✅ limpia vendedor para topbar
                    setView("REPORTS_GLOBAL");
                  }}
                >
                  📊 Reportes (Global)
                </button>

                <button className="btn btnGhost" onClick={() => setConfigOpen(true)}>
                  ⚙️ Configuración
                </button>


                {/* Seed */}
                <button
                  className="btn btnGhost"
                  onClick={async () => {
                    try {
                      const res = await window.api.seedDB();
                      console.log("Seed:", res);

                      const data = await window.api.listSellers();
                      setSellers(data);

                      alert("Seed OK ✅");
                    } catch (e: any) {
                      console.error(e);
                      alert(e?.message ?? "Error haciendo seed");
                    }
                  }}
                >
                  🌱 SEED (admin)
                </button>

                {/* Generar data de prueba */}
                <button
                  className="btn btnGhost"
                  onClick={async () => {
                    try {
                      const res = await window.api.generateDevInvoices({
                        monthsBack: 6,        // últimos 6 meses
                        invoicesPerMonth: 35, // ~35 facturas por mes
                        wipeBefore: true,     // limpia facturas previas
                      });

                      alert(`📦 Datos generados\nFacturas creadas: ${res.created}\nTotal en DB: ${res.total}`);
                    } catch (e: any) {
                      console.error(e);
                      alert(e?.message ?? "Error generando facturas");
                    }
                  }}
                >
                  🧪 Generar data (admin)
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="appMain">
        {/* ===== VISTAS POR VENDEDOR ===== */}
        {view === "MENU" && selectedSeller && (
          <SellerMenu
            seller={selectedSeller}
            onBack={() => setView("SELLERS")}
            onOpen={(module) => {
              if (module === "CARGAR") setView("CARGAR");
              else if (module === "INVENTARIO") setView("INVENTORY");
              else if (module === "FACTURAR") setView("FACTURAR");
              else if (module === "INFORMES") setView("REPORTS_SELLER");
              else alert(module);
            }}
          />
        )}

        {view === "INVENTORY" && selectedSeller && (
          <InventoryView
            sellerId={selectedSeller.id}
            sellerName={selectedSeller.name}
            onBack={() => setView("MENU")}
          />
        )}

        {view === "CARGAR" && selectedSeller && (
          <CargarView
            sellerId={selectedSeller.id}
            sellerName={selectedSeller.name}
            onBack={() => setView("MENU")}
          />
        )}

        {view === "FACTURAR" && selectedSeller && (
          <FacturarView
            sellerId={selectedSeller.id}
            sellerName={selectedSeller.name}
            onBack={() => setView("MENU")}
          />
        )}

        {view === "REPORTS_SELLER" && selectedSeller && (
          <ReportsView
            mode="SELLER"
            sellerId={selectedSeller.id}
            sellerName={selectedSeller.name}
            onBack={() => setView("MENU")}
          />
        )}

        {/* ===== REPORTES GLOBALES ===== */}
        {view === "REPORTS_GLOBAL" && (
          <ReportsView
            mode="GLOBAL"
            onBack={() => setView("SELLERS")}
          />
        )}

        {/* ===== HOME (SELLERS) ===== */}
        {view === "SELLERS" && (
          <>
            <SellerList
              sellers={sellers}
              onSelect={(s) => {
                setSelectedSeller(s);
                setView("MENU");
              }}
            />

            <button className="btn btnPrimary floatingConfigBtn" onClick={() => setConfigOpen(true)}>
              ⚙️ Configuración
            </button>
          </>
        )}

        <ConfigModal
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          onDone={async () => {
            const data = await window.api.listSellers();
            setSellers(data);
          }}
        />

      </main>

    </div>
  );
}
