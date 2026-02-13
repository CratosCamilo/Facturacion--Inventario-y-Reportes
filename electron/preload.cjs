// electron/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // ---- DB ----
  seedDB: () => ipcRenderer.invoke("db:seed"),

  // ---- Sellers ----
  // ✅ ahora le puedes pasar { includeInactive: true }
  listSellers: (payload) => ipcRenderer.invoke("catalog:sellers:list", payload ?? {}),

  // ✅ NUEVO: activar/inactivar vendedor
  setSellerActive: (payload) => ipcRenderer.invoke("catalog:sellers:setActive", payload),

  // ---- Inventory ----
  getInventory: (sellerId) => ipcRenderer.invoke("inventory:get", sellerId),
  updateInventory: (payload) => ipcRenderer.invoke("inventory:update", payload),

  // ---- Recharge ----
  commitRechargeDay: (payload) => ipcRenderer.invoke("recharge:commitDay", payload),

  // ---- Invoice ----
  commitInvoice: (payload) => ipcRenderer.invoke("invoice:commit", payload),

  invoiceList: (filters) => ipcRenderer.invoke("invoice:list", filters ?? {}),
  listInvoices: (payload) => ipcRenderer.invoke("invoice:list", payload ?? {}),

  // PDF
  downloadInvoicePdf: (payload) => ipcRenderer.invoke("invoice:pdf", payload),

  // Reportes (JSON)
  reportSalesSummary: (filters) => ipcRenderer.invoke("report:salesSummary", filters ?? {}),
  reportProductsSold: (filters) => ipcRenderer.invoke("report:productsSold", filters ?? {}),
  reportSalesBySeller: (filters) => ipcRenderer.invoke("report:salesBySeller", filters ?? {}),

  // Export Excel
  exportInvoicesExcel: (filters) => ipcRenderer.invoke("report:export:invoicesExcel", filters ?? {}),
  exportProductsSoldExcel: (filters) => ipcRenderer.invoke("report:export:productsSoldExcel", filters ?? {}),
  exportSalesBySellerExcel: (filters) => ipcRenderer.invoke("report:export:salesBySellerExcel", filters ?? {}),
  exportSalesSummaryExcel: (filters) => ipcRenderer.invoke("report:export:salesSummaryExcel", filters ?? {}),

  generateDevInvoices: (payload) => ipcRenderer.invoke("dev:generateInvoices", payload),

  // ---- Products ----
  listProducts: () => ipcRenderer.invoke("catalog:products:list"),

  createSeller: (payload) => ipcRenderer.invoke("catalog:sellers:create", payload),
  updateSeller: (payload) => ipcRenderer.invoke("catalog:sellers:update", payload),

  createProduct: (payload) => ipcRenderer.invoke("catalog:products:create", payload),
  updateProduct: (payload) => ipcRenderer.invoke("catalog:products:update", payload),
});
