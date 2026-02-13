// src/electron.d.ts
export { };

type ReportFilters = {
  sellerId?: number | null;
  invoiceId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  includeSeller?: boolean;
};

type SellerRow = { id: number; name: string; active?: number }; // active opcional (solo cuando includeInactive=true)

type InvoiceRow = {
  invoiceId: number;
  issuedAt: string;
  commissionPercent: number;

  subtotal: number;
  exemptTotal: number;
  changesTotal: number;
  commissionBase: number;
  commissionValue: number;
  payableTotal: number;

  sellerId?: number;
  sellerName?: string;
};

type SalesSummary = {
  count: number;
  subtotalSum: number;
  exemptSum: number;
  changesSum: number;
  commissionSum: number;
  payableSum: number;
};

type ProductSoldRow = {
  productId: number;
  productName: string;
  unitPrice: number;
  exempt: number;

  unitsSold: number;
  salesTotal: number;

  changesUnits: number;
  changesValue: number;
};

type SalesBySellerRow = {
  sellerId: number;
  sellerName: string;

  count: number;
  subtotalSum: number;
  exemptSum: number;
  changesSum: number;
  commissionSum: number;
  payableSum: number;
};

type SaveDialogResult =
  | { ok: true; filePath: string }
  | { ok: false; message: string };

declare global {
  interface Window {
    api: {
      seedDB: () => Promise<{
        sellerCount: number;
        productCount: number;
        exemptCount: number;
        stateCount: number;
      }>;

      // ✅ ahora puede recibir includeInactive
      listSellers: (payload?: { includeInactive?: boolean }) => Promise<SellerRow[]>;

      // ✅ nuevo
      setSellerActive: (payload: { id: number; active: boolean }) => Promise<{ ok: boolean; message?: string }>;

      getInventory: (sellerId: number) => Promise<
        Array<{
          productId: number;
          productName: string;
          price: number;
          sortOrder: number;

          carry: number;
          r1: number;
          r2: number;
          r3: number;

          commissionExempt: number;

          nextSlot: number;
          total: number;
        }>
      >;

      updateInventory: (payload: {
        sellerId: number;
        items: Array<{ productId: number; carry: number; r1: number; r2: number; r3: number }>;
      }) => Promise<{ ok: boolean }>;

      commitRechargeDay: (payload: {
        sellerId: number;
        items: Array<{ productId: number; quantity: number }>;
      }) => Promise<{ ok: true; currentSlot: number; nextSlot: number } | { ok: false; message: string }>;

      commitInvoice: (payload: {
        sellerId: number;
        commissionPercent: number;
        lines: Array<{ productId: number; finalQty: number; changesQty: number }>;
      }) => Promise<{
        ok: boolean;
        invoiceId?: number;
        issuedAt?: string;

        subtotal?: number;
        exemptTotal?: number;
        changesTotal?: number;
        commissionBase?: number;
        commissionValue?: number;
        payableTotal?: number;
      }>;

      listInvoices: (filters?: ReportFilters) => Promise<InvoiceRow[]>;
      invoiceList: (filters?: ReportFilters) => Promise<InvoiceRow[]>;

      downloadInvoicePdf: (payload: { invoiceId: number }) => Promise<SaveDialogResult>;

      reportSalesSummary: (filters?: ReportFilters) => Promise<SalesSummary>;
      reportProductsSold: (filters?: ReportFilters) => Promise<ProductSoldRow[]>;
      reportSalesBySeller: (filters?: ReportFilters) => Promise<SalesBySellerRow[]>;

      exportInvoicesExcel: (filters?: ReportFilters) => Promise<SaveDialogResult>;
      exportProductsSoldExcel: (filters?: ReportFilters) => Promise<SaveDialogResult>;
      exportSalesBySellerExcel: (filters?: ReportFilters) => Promise<SaveDialogResult>;
      exportSalesSummaryExcel: (filters?: ReportFilters) => Promise<SaveDialogResult>;

      generateDevInvoices: (payload?: {
        monthsBack?: number;
        invoicesPerMonth?: number;
        wipeBefore?: boolean;
      }) => Promise<{ ok: true; created: number; total: number }>;

      listProducts: () => Promise<Array<{
        id: number;
        name: string;
        price: number;
        sortOrder: number;
        commissionExempt: number;
      }>>;

      createSeller: (payload: { name: string }) => Promise<{ ok: boolean; message?: string; id?: number }>;
      updateSeller: (payload: { id: number; name: string }) => Promise<{ ok: boolean; message?: string }>;

      createProduct: (payload: { name: string; price: number }) => Promise<{ ok: boolean; message?: string; id?: number }>;
      updateProduct: (payload: { id: number; name: string; price: number }) => Promise<{ ok: boolean; message?: string }>;
    };
  }
}
