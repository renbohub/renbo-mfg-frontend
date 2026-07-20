const modules = [
  {
    slug: "manufacturing-bom", label: "Manufacturing BOM", shortLabel: "BOM", icon: "layers",
    description: "Struktur material, proses, costing, dan laporan bill of materials.", color: "violet",
    pages: [
      page("bill-of-materials", "m-Bill of Materials", "Daftar dan revisi bill of materials", "/api/mbom/mbom", "noReg", [
        col("noReg", "No. Registrasi"), col("part.partNumber", "Part Number"), col("part.partName", "Part Name"), col("uomCode", "UOM"), col("revision", "Revisi"), col("effectiveDate", "Berlaku", "date")
      ]),
      placeholder("bom-processes", "mBOM Processes", "Urutan proses dan routing per BOM"),
      placeholder("bom-costing", "mBOM Costing", "Perhitungan biaya material dan proses"),
      report("bom-report", "mBOM Report", "Ringkasan struktur dan pemakaian BOM")
    ]
  },
  {
    slug: "sales", label: "Sales", shortLabel: "Sales", icon: "currency",
    description: "Quotation, Sales Order, dan forecast bulanan pelanggan.", color: "violet",
    pages: [
      { ...page("quotations", "Quotation", "Penawaran harga sebelum dikonversi menjadi Sales Order", "/api/sales/quotations", "quotationNumber", [col("quotationNumber", "No. Quotation"), col("customerName", "Pelanggan"), col("quotationDate", "Tanggal", "date"), col("totalAmount", "Total", "currency"), col("status", "Status", "status"), col("validUntil", "Valid Sampai", "date")]), salesType: "quotation" },
      { ...page("sales-orders", "Sales Order", "Order penjualan hasil konversi quotation atau input langsung", "/api/sales/sales-orders", "soNumber", [col("soNumber", "No. SO"), col("quotationNumber", "No. Quotation"), col("customerName", "Pelanggan"), col("soDate", "Tanggal Order", "date"), col("totalAmount", "Total", "currency"), col("status", "Status", "status"), col("deliveryDate", "Delivery", "date")]), salesType: "sales-order" },
      { ...page("forecasts", "Forecast", "Pemberitahuan kebutuhan bulanan customer untuk acuan MRP dan buffer stock", "/api/planning/forecasts", "forecastNumber", [col("forecastNumber", "Forecast ID"), col("customerCode", "Customer"), col("forecastName", "Nama Forecast"), col("periodStart", "Periode Mulai", "date"), col("periodEnd", "Periode Selesai", "date"), col("totalForecastQty", "Total Qty", "number"), col("status", "Status", "status")]), salesType: "forecast" }
    ]
  },
  {
    slug: "planning-ppic", label: "Planning PPIC", shortLabel: "PPIC", icon: "calendar",
    description: "Perencanaan demand, MPS, MRP, dan rencana produksi.", color: "blue",
    pages: [
      page("consume-forecast", "Consume Forecast", "Monitoring forecast customer yang dipakai sebagai demand planning", "/api/planning/forecasts", "forecastNumber", [col("forecastNumber", "Forecast"), col("customerCode", "Customer"), col("periodStart", "Periode", "date"), col("totalForecastQty", "Total Qty", "number"), col("status", "Status", "status")]),
      page("master-production-schedule", "Master Production Schedule", "MPS yang dihasilkan dari forecast bulanan", "/api/planning/mps", "mpsNumber", [col("mpsNumber", "No. MPS"), col("forecastNumber", "Forecast"), col("mpsName", "Nama MPS"), col("periodStart", "Mulai", "date"), col("periodEnd", "Selesai", "date"), col("totalPlannedQty", "Qty Plan", "number"), col("status", "Status", "status")]),
      page("material-requirements-planning", "Material Requirements Planning", "Kebutuhan material dan planned order hasil MRP", "/api/planning/mrp", "runNumber", [col("runNumber", "No. Run"), col("mpsNumber", "MPS"), col("runDate", "Tanggal", "date"), col("totalRequirements", "Requirements", "number"), col("totalPlannedOrders", "Planned Order", "number"), col("status", "Status", "status")]),
      page("monthly-plan", "Monthly Plan", "Target dan realisasi rencana produksi bulanan", "/api/planning/monthly-production-plans", "planNumber", [col("planNumber", "Plan ID"), col("planMonth", "Bulan", "date"), col("targetQty", "Target Qty", "number"), col("actualQty", "Actual Qty", "number"), col("status", "Status", "status")]),
      page("capacity-planning", "Capacity Planning", "Heatmap schedule dan kapasitas harian per mesin", "/api/planning/capacity-planning", "machineCode", [col("machineCode", "Mesin"), col("machineName", "Nama"), col("lineCode", "Line"), col("status", "Status", "status")]),
      placeholder("planned-orders", "Planned Orders", "Usulan order dari hasil perencanaan"),
      placeholder("monthly-production-plans", "Monthly Production Plans", "Rencana produksi bulanan")
    ]
  },
  {
    slug: "production", label: "Production", shortLabel: "Production", icon: "briefcase",
    description: "Eksekusi order, jadwal harian, kualitas, WIP, dan laporan produksi.", color: "orange",
    pages: [
      page("manufacturing-orders", "Manufacturing Orders", "Order utama pelaksanaan produksi", "/api/production/manufacturing-orders", "moNumber", productionOrderColumns()),
      page("daily-production-schedules", "Daily Production Schedules", "Jadwal produksi harian", "/api/production/daily-production-schedules", "scheduleNumber", [col("scheduleNumber", "No. Jadwal"), col("scheduleDate", "Tanggal", "date"), col("shift", "Shift"), col("moNumber", "MO"), col("partCode", "Part"), col("plannedQty", "Plan", "number"), col("actualQty", "Actual", "number"), col("status", "Status", "status")]),
      page("work-orders", "Work Orders", "Instruksi kerja per proses", "/api/production/work-orders", "woNumber", [col("woNumber", "No. WO"), col("woDate", "Tanggal", "date"), col("outputPartCode", "Output Part"), col("process.processName", "Proses"), col("machine.machineName", "Mesin"), col("plannedQty", "Plan", "number"), col("qtyGood", "Good", "number"), col("status", "Status", "status")]),
      page("vendor-process-orders", "Vendor Process Orders", "Proses produksi melalui vendor", "/api/production/vendor-process-orders", "orderNumber", [col("orderNumber", "No. Order"), col("orderDate", "Tanggal", "date"), col("moNumber", "MO"), col("processName", "Proses"), col("vendorName", "Vendor"), col("qtySent", "Sent", "number"), col("qtyReceived", "Received", "number"), col("status", "Status", "status")]),
      page("material-issues", "Material Issues", "Pengeluaran material ke produksi", "/api/production/material-issues", "issueNumber", [col("issueNumber", "No. Issue"), col("issueDate", "Tanggal", "date"), col("manufacturingOrder.moNumber", "MO"), col("workOrder.woNumber", "WO"), col("warehouseCode", "Warehouse"), col("issuedBy", "Issued By"), col("status", "Status", "status")]),
      page("production-logs", "Production Logs", "Realisasi dan aktivitas produksi", "/api/production/production-logs", "logNumber", [col("logNumber", "No. Log"), col("logDate", "Tanggal", "date"), col("shift", "Shift"), col("machineCode", "Mesin"), col("operatorName", "Operator"), col("qtyProduced", "Produced", "number"), col("qtyReject", "Reject", "number"), col("status", "Status", "status")]),
      page("quality-inspections", "Quality Inspections", "Pemeriksaan kualitas hasil produksi", "/api/production/quality-inspections", "inspectionNumber", [col("inspectionNumber", "No. Inspection"), col("inspectionDate", "Tanggal", "date"), col("part.partNumber", "Part"), col("batchNumber", "Batch"), col("qtyInspected", "Inspected", "number"), col("qtyPassed", "Passed", "number"), col("decision", "Decision", "status")]),
      placeholder("fg-receipt", "FG Receipt", "Penerimaan finished goods dari produksi"),
      page("wip", "WIP", "Posisi work in process", "/api/production/wip", "entryNumber", [col("entryNumber", "No. Entry"), col("entryDate", "Tanggal", "date"), col("partCode", "Part"), col("warehouseCode", "Warehouse"), col("stockType", "Stock Type"), col("qty", "Qty", "number"), col("amount", "Amount", "currency"), col("direction", "Arah", "status")]),
      page("downtime-logs", "Downtime Logs", "Pencatatan waktu berhenti mesin", "/api/production/downtime-logs", "downtimeNumber", [col("downtimeNumber", "No. Downtime"), col("downtimeDate", "Tanggal", "date"), col("machineCode", "Mesin"), col("shift", "Shift"), col("durationMinutes", "Durasi (menit)", "number"), col("category", "Kategori"), col("reason", "Alasan"), col("status", "Status", "status")]),
      report("production-report", "Production Report", "Dashboard dan ringkasan performa produksi", "/api/production/production-reports/dashboard")
    ]
  },
  {
    slug: "purchasing", label: "Purchasing", shortLabel: "Purchasing", icon: "truck",
    description: "Permintaan, pemesanan, penerimaan, invoice, dan inspeksi pembelian.", color: "green",
    pages: [
      page("purchase-requisitions", "Purchase Requisition", "Permintaan pembelian internal dan sumber kebutuhan MRP", "/api/purchasing/purchase-requisitions", "prNumber", [col("prNumber", "No. PR"), col("prDate", "Tanggal", "date"), col("requestedBy", "Requester"), col("department.departmentName", "Department"), col("requiredDate", "Required", "date"), col("priority", "Priority", "status"), col("requestedQty", "Qty Request", "number"), col("orderedQty", "Qty Ordered", "number"), col("status", "Status", "status")]),
      page("purchase-order", "Purchase Order", "Pemesanan barang dan jasa ke supplier", "/api/purchasing/purchase-order", "poNumber", [col("poNumber", "No. PO"), col("poDate", "Tanggal", "date"), col("supplier.supplierName", "Supplier"), col("vendor.vendorName", "Vendor"), col("deliveryDate", "Delivery", "date"), col("poType", "Type"), col("totalAmount", "Total", "currency"), col("status", "Status", "status")]),
      page("goods-receipts", "Goods Receipt (Incoming)", "Penerimaan barang berdasarkan purchase order", "/api/incoming/goods-receipts", "grNumber", [col("grNumber", "No. GR"), col("grDate", "Tanggal", "date"), col("poNumber", "No. PO"), col("supplierName", "Supplier / Vendor"), col("warehouseCode", "Warehouse"), col("qtyReceived", "Received", "number"), col("qtyInspected", "Inspected", "number"), col("status", "Status", "status")]),
      page("purchase-invoices", "Purchase Invoice", "Pencatatan invoice dan matching purchase order", "/api/purchasing/purchase-invoices", "invoiceNumber", [col("invoiceNumber", "No. Invoice"), col("supplierInvoiceNumber", "Invoice Supplier"), col("invoiceDate", "Tanggal", "date"), col("poNumber", "Primary PO"), col("supplierName", "Supplier"), col("totalAmount", "Total", "currency"), col("matchStatus", "Matching", "status"), col("status", "Status", "status")]),
      page("incoming-inspections", "Incoming Inspections", "Pemeriksaan kualitas barang yang diterima", "/api/incoming/incoming-inspections", "inspectionNumber", [col("inspectionNumber", "No. Inspection"), col("inspectionDate", "Tanggal", "date"), col("grNumber", "No. GR"), col("gr.poNumber", "No. PO"), col("qtyInspected", "Inspected", "number"), col("qtyAccepted", "Accepted", "number"), col("qtyRejected", "Rejected", "number"), col("decision", "Decision", "status"), col("status", "Status", "status")]),
      report("purchase-resume", "Purchase Resume", "Ringkasan aktivitas pembelian", "/api/purchasing/purchase-order"),
      report("purchasing-report", "Purchasing Report", "Laporan pembelian dan supplier", "/api/purchasing/purchase-order")
    ]
  },
  {
    slug: "inventory", label: "Inventory", shortLabel: "Inventory", icon: "warehouse",
    description: "Saldo stok, lokasi penyimpanan, lot, mutasi, dan stock opname.", color: "cyan",
    pages: [
      page("stock-balances", "Stock Balances", "Saldo dan ketersediaan stok", "/api/inventory/stock-balances", "id", [col("partCode", "Part Code"), col("partName", "Part Name"), col("warehouseCode", "Warehouse"), col("rackCode", "Rack"), col("lotNumber", "Lot"), col("stockType", "Type"), col("qtyOnHand", "On Hand", "number"), col("qtyAvailable", "Available", "number")]),
      page("warehouses", "Warehouses", "Daftar gudang", "/api/inventory/warehouses", "warehouseCode", [col("warehouseCode", "Code"), col("warehouseName", "Warehouse"), col("warehouseType", "Type"), col("address", "Address"), col("isActive", "Status", "active")]),
      page("racks", "Racks & Locations", "Rak dan lokasi penyimpanan", "/api/inventory/racks", "rackCode", [col("rackCode", "Rack Code"), col("rackName", "Rack Name"), col("zone", "Zone"), col("row", "Row"), col("level", "Level"), col("capacity", "Capacity", "number"), col("isActive", "Status", "active")]),
      page("lots", "Lot Master", "Lot dan batch material", "/api/inventory/lots", "lotNumber", [col("lotNumber", "Lot Number"), col("partCode", "Part Code"), col("description", "Description"), col("supplierBatch", "Supplier Batch"), col("manufacturingDate", "Mfg Date", "date"), col("expiryDate", "Expiry", "date")]),
      placeholder("stock-movements", "Stock Movements", "Riwayat seluruh mutasi persediaan"),
      placeholder("stock-opname", "Stock Opname", "Perhitungan dan penyesuaian stok fisik"),
      report("inventory-report", "Inventory Report", "Laporan persediaan dan aging stok")
    ]
  },
  {
    slug: "incoming", label: "Incoming", shortLabel: "Incoming", icon: "box",
    description: "Alur barang masuk dari penerimaan sampai penyimpanan.", color: "teal",
    pages: [
      page("goods-receipts", "Goods Receipt", "Penerimaan barang dari supplier berdasarkan PO", "/api/incoming/goods-receipts", "grNumber", [col("grNumber", "No. GR"), col("grDate", "Tanggal", "date"), col("poNumber", "No. PO"), col("supplierName", "Supplier / Vendor"), col("warehouseCode", "Warehouse"), col("deliveryNoteNumber", "Surat Jalan"), col("qtyReceived", "Received", "number"), col("status", "Status", "status")]),
      page("incoming-inspections", "Incoming Inspections", "Pemeriksaan kualitas barang yang diterima", "/api/incoming/incoming-inspections", "inspectionNumber", [col("inspectionNumber", "No. Inspection"), col("inspectionDate", "Tanggal", "date"), col("grNumber", "No. GR"), col("gr.poNumber", "No. PO"), col("qtyInspected", "Inspected", "number"), col("qtyAccepted", "Accepted", "number"), col("qtyRejected", "Rejected", "number"), col("decision", "Decision", "status")]),
      page("supplier-deliveries", "Supplier Deliveries", "Jadwal dan realisasi kedatangan berdasarkan purchase order", "/api/incoming/supplier-deliveries", "poNumber", [col("deliveryNumber", "Delivery Ref"), col("deliveryDate", "Expected", "date"), col("partnerName", "Supplier / Vendor"), col("poType", "Type"), col("plannedQty", "Ordered", "number"), col("receivedQty", "Received", "number"), col("status", "Status", "status")]),
      page("putaway", "Putaway", "Jejak penempatan barang hasil receipt dan quality release", "/api/incoming/putaway", "movementNumber", [col("movementNumber", "Movement"), col("movementDate", "Tanggal", "date"), col("referenceNumber", "Referensi"), col("partCode", "Part"), col("warehouseCode", "Warehouse"), col("rackCode", "Rack"), col("lotNumber", "Lot"), col("qty", "Qty", "number"), col("qualityBucket", "Quality", "status")]),
      report("incoming-report", "Incoming Report", "Laporan penerimaan barang", "/api/incoming/goods-receipts")
    ]
  },
  {
    slug: "outgoing", label: "Outgoing", shortLabel: "Outgoing", icon: "truck",
    description: "Alur barang keluar dari jadwal, picking, hingga pengiriman.", color: "rose",
    pages: [
      page("delivery-orders", "Delivery Orders", "Order pengiriman berdasarkan sales order aktif", "/api/outgoing/delivery-orders", "soNumber", [col("deliveryOrderNumber", "Delivery Order"), col("soDate", "Tanggal SO", "date"), col("customerName", "Customer"), col("deliveryDate", "Delivery", "date"), col("plannedQty", "Qty Order", "number"), col("deliveredQty", "Delivered", "number"), col("scheduleCount", "Schedule", "number"), col("status", "Status", "status")]),
      page("delivery-schedules", "SO Delivery Schedules", "Jadwal pengiriman sales order", "/api/outgoing/delivery-schedules", "scheduleNumber", [col("scheduleNumber", "No. Schedule"), col("plannedDate", "Rencana", "date"), col("actualDate", "Aktual", "date"), col("soNumber", "No. SO"), col("customerName", "Customer"), col("plannedQty", "Qty Plan", "number"), col("deliveredQty", "Delivered", "number"), col("status", "Status", "status")]),
      page("picking-packing", "Picking & Packing", "Persiapan barang pada schedule Scheduled dan On Process", "/api/outgoing/picking-packing", "scheduleNumber", [col("scheduleNumber", "Picking Ref"), col("plannedDate", "Rencana", "date"), col("soNumber", "No. SO"), col("customerName", "Customer"), col("deliveryAddress", "Alamat"), col("plannedQty", "Qty Pick", "number"), col("status", "Status", "status")]),
      page("shipments", "Shipments", "Realisasi dan tracking pengiriman", "/api/outgoing/shipments", "scheduleNumber", [col("scheduleNumber", "Shipment Ref"), col("plannedDate", "Rencana", "date"), col("actualDate", "Aktual", "date"), col("soNumber", "No. SO"), col("customerName", "Customer"), col("shippingMethod", "Method"), col("trackingNumber", "Tracking"), col("status", "Status", "status")]),
      report("outgoing-report", "Outgoing Report", "Laporan barang keluar dan pengiriman", "/api/outgoing/delivery-schedules")
    ]
  }
];

function col(data, label, type = "text") { return { data, label, type }; }
function page(slug, label, description, endpoint, detailKey, columns) { return { slug, label, description, endpoint, detailKey, columns, kind: "data", apiReady: true }; }
function placeholder(slug, label, description) { return { slug, label, description, columns: defaultPlaceholderColumns(slug), kind: "data", apiReady: false }; }
function report(slug, label, description, endpoint = "") { return { slug, label, description, endpoint, kind: "report", apiReady: Boolean(endpoint) }; }
function defaultPlaceholderColumns(slug) {
  if (slug.includes("report") || slug.includes("resume")) return [];
  return [col("documentNumber", "Document Number"), col("documentDate", "Date", "date"), col("reference", "Reference"), col("description", "Description"), col("status", "Status", "status")];
}
function productionOrderColumns() { return [col("moNumber", "No. MO"), col("moDate", "Tanggal", "date"), col("part.partNumber", "Part"), col("qtyPlanned", "Planned", "number"), col("qtyProduced", "Produced", "number"), col("qtyGood", "Good", "number"), col("qtyReject", "Reject", "number"), col("status", "Status", "status")]; }

function getModule(slug) { return modules.find((item) => item.slug === slug); }
function getPage(moduleSlug, pageSlug) { return getModule(moduleSlug)?.pages.find((item) => item.slug === pageSlug); }

module.exports = { modules, getModule, getPage };
