const modules = [
  {
    slug: "manufacturing-bom", label: "Manufacturing BOM", shortLabel: "BOM", icon: "layers",
    description: "Struktur material, proses, costing, dan laporan bill of materials.", color: "violet",
    pages: [
      page("bill-of-materials", "m-Bill of Materials", "Daftar dan revisi bill of materials", "/api/mbom/mbom", "noReg", [
        col("noReg", "No. Registrasi"), col("part.partNumber", "Part Number"), col("part.partName", "Part Name"), col("uomCode", "UOM"), col("revision", "Revisi"), col("effectiveDate", "Berlaku", "date")
      ]),
      page("bom-processes", "Routing", "Routing header dan operasi proses yang dapat ditautkan ke mBOM", "/api/engineering/routings", "routingCode", [col("routingCode", "Kode Routing"), col("part.partCode", "Part"), col("revision", "Revisi"), col("status", "Status", "status")]),
      page("work-centers", "Work Centers", "Kelompok mesin dan kapasitas produksi", "/api/engineering/work-centers", "workCenterCode", [col("workCenterCode", "Kode"), col("workCenterName", "Work Center"), col("plantCode", "Plant"), col("lineCode", "Line"), col("capacityMinutesPerDay", "Capacity (min)", "number"), col("isActive", "Status", "active")]),
      { ...report("bom-costing", "mBOM Costing", "Perhitungan biaya material, proses, overhead, dan cost per unit", "/api/reports/mbom-costing"), reportColumns: [
        col("noReg", "No. BOM"), col("partCode", "Part Code"), col("partName", "Part Name"), col("costVersion", "Cost Version"),
        col("materialCost", "Material", "currency"), col("processCost", "Process", "currency"), col("overheadCost", "Overhead", "currency"),
        col("costPerUnit", "Cost / Unit", "currency"), col("costingStatus", "Costing", "status"), col("readinessStatus", "Routing", "status")
      ] },
      { ...report("bom-report", "mBOM Report", "Ringkasan struktur, routing, dan kesiapan BOM", "/api/reports/mbom-structure"), reportColumns: [
        col("noReg", "No. BOM"), col("partCode", "Part Code"), col("partNumber", "Drawing"), col("partName", "Part Name"),
        col("revision", "Revision", "number"), col("componentCount", "Components", "number"), col("processCount", "Processes", "number"),
        col("maximumLevel", "Max Level", "number"), col("routingMissing", "Routing Gap", "number"), col("readinessStatus", "Readiness", "status")
      ] },
      { ...report("cost-trend", "Price & Cost Trend", "Perbandingan rata-rata harga part dan material per bulan", "/api/reports/cost-trend"), reportColumns: [
        col("month", "Month"), col("partAverage", "Part Average", "currency"), col("materialAverage", "Material Average", "currency")
      ] }
    ]
  },
  {
    slug: "sales", label: "Sales", shortLabel: "Sales", icon: "currency",
    description: "Quotation, Sales Order, dan forecast bulanan pelanggan.", color: "violet",
    pages: [
      { ...page("quotations", "Quotation", "Penawaran harga sebelum dikonversi menjadi Sales Order", "/api/sales/quotations", "quotationNumber", [col("quotationNumber", "No. Quotation"), col("customerName", "Pelanggan"), col("quotationDate", "Tanggal", "date"), col("totalAmount", "Total", "currency"), col("status", "Status", "status"), col("validUntil", "Valid Sampai", "date")]), salesType: "quotation" },
      { ...page("sales-orders", "Sales Order", "Order penjualan hasil konversi quotation atau input langsung", "/api/sales/sales-orders", "soNumber", [col("soNumber", "No. SO"), col("quotationNumber", "No. Quotation"), col("customerName", "Pelanggan"), col("soDate", "Tanggal Order", "date"), col("totalAmount", "Total", "currency"), col("status", "Status", "status"), col("deliveryDate", "Delivery", "date")]), salesType: "sales-order" },
      { ...page("forecasts", "Forecast", "Pemberitahuan kebutuhan bulanan customer untuk acuan MRP dan buffer stock", "/api/planning/forecasts", "forecastNumber", [col("forecastNumber", "Forecast ID"), col("customerCode", "Customer"), col("forecastName", "Nama Forecast"), col("periodStart", "Periode Mulai", "date"), col("periodEnd", "Periode Selesai", "date"), col("totalForecastQty", "Total Qty", "number"), col("status", "Status", "status")]), salesType: "forecast" },
      { ...report("sales-margin-report", "Sales Revenue & Margin", "Rekonsiliasi revenue Sales Order terhadap standard cost mBOM", "/api/reports/sales-margin"), reportColumns: [
        col("soNumber", "Sales Order"), col("soDate", "Date", "date"), col("customerName", "Customer"), col("partCode", "Part Code"),
        col("qty", "Qty", "number"), col("unitPrice", "Sales / Unit", "currency"), col("revenue", "Revenue", "currency"),
        col("costPerUnit", "Cost / Unit", "currency"), col("cogs", "COGS", "currency"), col("margin", "Margin", "currency"),
        col("marginPercent", "Margin %", "number"), col("costingStatus", "Costing", "status")
      ] }
    ]
  },
  {
    slug: "planning-ppic", label: "Planning PPIC", shortLabel: "PPIC", icon: "calendar",
    description: "Perencanaan demand, MPS, MRP, dan rencana produksi.", color: "blue",
    pages: [
      dashboardPage("Planning Performance", "MPP plan dibanding realisasi produksi aktual per bulan."),
      page("consume-forecast", "Consume Forecast", "Monitoring forecast customer yang dipakai sebagai demand planning", "/api/planning/forecasts", "forecastNumber", [col("forecastNumber", "Forecast"), col("customerCode", "Customer"), col("periodStart", "Periode", "date"), col("totalForecastQty", "Total Qty", "number"), col("status", "Status", "status")]),
      page("master-production-schedule", "Master Production Schedule", "MPS yang dihasilkan dari forecast bulanan", "/api/planning/mps", "mpsNumber", [col("mpsNumber", "No. MPS"), col("forecastNumber", "Forecast"), col("mpsName", "Nama MPS"), col("periodStart", "Mulai", "date"), col("periodEnd", "Selesai", "date"), col("totalPlannedQty", "Qty Plan", "number"), col("status", "Status", "status")]),
      page("material-requirements-planning", "Material Requirements Planning", "Kebutuhan material dan planned order hasil MRP", "/api/planning/mrp", "runNumber", [col("runNumber", "No. Run"), col("mpsNumber", "MPS"), col("runDate", "Tanggal", "date"), col("totalRequirements", "Requirements", "number"), col("totalPlannedOrders", "Planned Order", "number"), col("status", "Status", "status")]),
      page("monthly-production-plans", "Monthly Production Plans", "Rencana produksi bulanan milik PPIC", "/api/planning/monthly-production-plans", "planNumber", [col("planNumber", "Plan ID"), col("periodStart", "Mulai", "date"), col("periodEnd", "Selesai", "date"), col("targetQty", "Target", "number"), col("actualQty", "Actual", "number"), col("status", "Status", "status")]),
      page("capacity-planning", "Capacity Planning", "Heatmap capacity harian untuk mengalokasikan Monthly Plan", "/api/planning/capacity-planning", "machineCode", [col("machineCode", "Mesin"), col("machineName", "Nama"), col("lineCode", "Line"), col("status", "Status", "status")]),
      page("daily-production-plans", "Daily Production Plans", "Hasil konversi Monthly Plan berdasarkan Capacity Check; siap dikonsumsi Production", "/api/planning/monthly-production-plans/daily-plans", "scheduleNumber", [col("scheduleNumber", "No. Daily Plan"), col("scheduleDate", "Tanggal", "date"), col("shift", "Shift"), col("monthlyProductionPlanNumber", "MPP"), col("moNumber", "MO Reference"), col("partCode", "Part"), col("machineCode", "Mesin"), col("plannedQty", "Plan", "number"), col("status", "Status", "status")]),
      page("control-tower", "Demand-to-Delivery Control Tower", "Visibilitas demand, delivery, dan risiko lintas proses", "/api/dashboard/control-tower", "soNumber", [col("soNumber", "Sales Order"), col("customer.customerName", "Customer"), col("deliveryDate", "Required", "date"), col("orderedQty", "Demand", "number"), col("deliveredQty", "Delivered", "number"), col("outstandingQty", "Outstanding", "number"), col("purchaseDemandQty", "PR Demand", "number"), col("supplierAllocatedQty", "Supplier Allocation", "number"), col("supplierAllocationStatus", "Supplier Status", "status"), col("purchaseOrderedQty", "PO Ordered", "number"), col("purchaseOrderControlStatus", "Order Status", "status"), col("risk", "Risk", "status")]),
      page("planned-orders", "Planned Orders", "Usulan order dari hasil perencanaan", "/api/planning/mrp/planned-orders", "orderNumber", [col("orderNumber", "No. Planned Order"), col("partCode", "Part Code"), col("part.partName", "Part Name"), col("orderType", "Type"), col("requiredDate", "Required", "date"), col("qty", "Qty", "number"), col("supplierReadiness.supplierCode", "Supplier"), col("supplierReadiness.status", "Supplier Readiness", "status"), col("status", "Status", "status")])
    ]
  },
  {
    slug: "production", label: "Production", shortLabel: "Production", icon: "briefcase",
    description: "Consume Daily Production Plan dari PPIC dengan referensi MO dan Material Issue.", color: "orange",
    pages: [
      dashboardPage("Production Dashboard", "Perbandingan daily production plan dan actual output per bulan."),
      page("daily-production-schedules", "Daily Production Schedule", "Schedule harian tim produksi berdasarkan alokasi PPIC", "/api/production/daily-production-schedules", "scheduleNumber", [col("scheduleNumber", "No. Schedule"), col("scheduleDate", "Tanggal", "date"), col("shift", "Shift"), col("machineCode", "Mesin"), col("processName", "Proses"), col("partCode", "Part"), col("plannedQty", "Target", "number"), col("actualQty", "Aktual", "number"), col("status", "Status", "status")]),
      page("manufacturing-orders", "MO Reference", "Referensi Manufacturing Order dari PPIC; bukan titik pembuatan jadwal harian", "/api/production/manufacturing-orders", "moNumber", productionOrderColumns()),
      page("material-issues", "Material Issue Reference", "Referensi Material Issue yang terbentuk saat Daily Production Plan dikonsumsi", "/api/production/material-issues", "issueNumber", [col("issueNumber", "No. Issue"), col("issueDate", "Tanggal", "date"), col("manufacturingOrder.moNumber", "MO"), col("workOrder.woNumber", "WO"), col("warehouseCode", "Warehouse"), col("issuedBy", "Issued By"), col("status", "Status", "status")]),
      { ...page("work-orders", "Work Orders", "Instruksi kerja per proses", "/api/production/work-orders", "woNumber", [col("woNumber", "No. WO"), col("woDate", "Tanggal", "date"), col("outputPartCode", "Output Part"), col("process.processName", "Proses"), col("machine.machineName", "Mesin"), col("plannedQty", "Plan", "number"), col("qtyGood", "Good", "number"), col("status", "Status", "status")]), createRoute: "/modules/production/work-orders/new", navHidden: true },
      { ...page("prepare-delivery-vendor", "Prepare Delivery to Vendor", "Persiapan WIP dan pengiriman proses eksternal ke vendor", "/api/production/vendor-process-orders", "orderNumber", [col("orderNumber", "No. Order"), col("dueDate", "Target Kembali", "date"), col("moNumber", "MO"), col("inputPartCode", "Part Dikirim"), col("processName", "Proses"), col("vendorName", "Vendor"), col("qtyPlanned", "Plan Kirim", "number"), col("qtySent", "Terkirim", "number"), col("status", "Status", "status")]), fixedQuery: { status: "Planned,Ready to Send,Partial Sent" }, vendorProcessFlow: "SEND" },
      { ...page("vendor-process-orders", "Vendor Process Orders", "Seluruh histori proses produksi melalui vendor", "/api/production/vendor-process-orders", "orderNumber", [col("orderNumber", "No. Order"), col("orderDate", "Tanggal", "date"), col("moNumber", "MO"), col("processName", "Proses"), col("vendorName", "Vendor"), col("qtySent", "Sent", "number"), col("qtyReceived", "Received", "number"), col("status", "Status", "status")]), createRoute: "/modules/production/vendor-process-orders/new", navHidden: true, vendorProcessFlow: "ALL" },
      { ...page("production-logs", "Production Logs", "Realisasi shop-floor dari Daily Production Schedule", "/api/production/production-logs", "logNumber", [col("logNumber", "No. Log"), col("logDate", "Tanggal", "date"), col("shift", "Shift"), col("dailyProductionSchedule.productionPlan.planNumber", "Production Plan"), col("dailyProductionSchedule.scheduleNumber", "Daily Production Schedule"), col("processCode", "Proses"), col("machineCode", "Mesin"), col("operatorName", "Operator"), col("qtyProduced", "Produced", "number"), col("qtyGood", "Good", "number"), col("qtyReject", "NG", "number"), col("downtime", "Downtime (min)", "number"), col("status", "Status", "status")]), createRoute: "/modules/production/production-logs/new" },
      { ...page("quality-inspections", "Quality Inspections", "Pemeriksaan kualitas hasil produksi", "/api/production/quality-inspections", "inspectionNumber", [col("inspectionNumber", "No. Inspection"), col("inspectionDate", "Tanggal", "date"), col("part.partNumber", "Part"), col("batchNumber", "Batch"), col("qtyInspected", "Inspected", "number"), col("qtyPassed", "Passed", "number"), col("decision", "Decision", "status")]), createRoute: "/modules/production/quality-inspections/new", navHidden: true },
      page("fg-receipt", "FG Receipt", "Penerimaan finished goods dari produksi", "/api/production/quality-inspections/fg-receipts/history", "movementNumber", [col("movementNumber", "Receipt Ref"), col("receivedAt", "Tanggal", "date"), col("inspectionNumber", "Inspection"), col("fgPart.partCode", "Part"), col("fgPart.partName", "Part Name"), col("targetLocation.lotNumber", "Lot"), col("qtyReceived", "Qty", "number"), col("targetLocation.warehouseCode", "Warehouse")]),
      { ...page("wip", "WIP", "Posisi work in process", "/api/production/wip", "entryNumber", [col("entryNumber", "No. Entry"), col("entryDate", "Tanggal", "date"), col("partCode", "Part"), col("warehouseCode", "Warehouse"), col("stockType", "Stock Type"), col("qty", "Qty", "number"), col("amount", "Amount", "currency"), col("direction", "Arah", "status")]), createRoute: "/modules/production/wip/new", navHidden: true },
      { ...page("downtime-logs", "Downtime Logs", "Pencatatan waktu berhenti mesin", "/api/production/downtime-logs", "downtimeNumber", [col("downtimeNumber", "No. Downtime"), col("downtimeDate", "Tanggal", "date"), col("machineCode", "Mesin"), col("shift", "Shift"), col("durationMinutes", "Durasi (menit)", "number"), col("category", "Kategori"), col("reason", "Alasan"), col("status", "Status", "status")]), createRoute: "/modules/production/downtime-logs/new", navHidden: true },
      { ...report("production-report", "Production Report", "Laporan harian per mesin: process time, downtime, net time, output, NG, dan cycle time", "/api/production/production-reports/machine-daily"), reportMode: "production-machine", reportColumns: [
        col("logDate", "Tanggal", "date"), col("shift", "Shift"), col("machineCode", "Mesin"), col("customerCode", "Customer"),
        col("partName", "Part Name"), col("partNumber", "Part Number"), col("processCode", "Proses"),
        col("startTimeLabel", "Start"), col("endTimeLabel", "End"), col("grossMinutes", "Gross (min)", "number"),
        col("downtimeMinutes", "Downtime (min)", "number"), col("downtimeBreakdown", "Jenis Downtime"),
        col("netMinutes", "Net (min)", "number"), col("qtyProduced", "Process Qty", "number"),
        col("qtyGood", "Good", "number"), col("qtyNg", "NG", "number"), col("ngReason", "NG Reason"),
        col("actualCycleTimeSeconds", "Actual C/T (s)", "number"), col("cycleEfficiencyPercent", "C/T %", "number"),
        col("operatorName", "Operator"), col("notes", "Keterangan")
      ] }
    ]
  },
  {
    slug: "purchasing", label: "Purchasing", shortLabel: "Purchasing", icon: "truck",
    description: "Permintaan, pemesanan, penerimaan, invoice, dan inspeksi pembelian.", color: "green",
    pages: [
      dashboardPage("Purchasing Dashboard", "Purchase Order plan dibanding Goods Receipt aktual dalam qty dan rupiah."),
      page("purchase-suggestions", "Purchase Suggestion", "Rekomendasi pembelian hasil backward scheduling MRP dan konfirmasi supplier sebelum PR", "/api/purchasing/purchase-suggestions", "suggestionNumber", [col("suggestionNumber", "Suggestion"), col("dueDate", "Due Date", "date"), col("runNumber", "Sumber MRP", "mrpLink"), col("warehouseCode", "Warehouse"), col("itemCount", "Items", "number"), col("netRequirement", "Net Requirement", "number"), col("recommendedPurchaseQty", "Recommended Qty", "number"), col("excessQty", "Excess Qty", "number"), col("status", "Status", "status")]),
      page("purchase-requisitions", "Purchase Requisition", "Permintaan pembelian yang dikonsolidasikan per Material Master dengan trace MRP/MPS/Forecast/SO", "/api/purchasing/purchase-requisitions", "prNumber", [col("prNumber", "No. PR"), col("headerMaterialCode", "Material Master"), col("headerMaterialName", "Material Name"), col("demandBucket", "Demand Period"), col("prDate", "Tanggal", "date"), col("procurementCategory", "Kategori"), col("requestedBy", "Requester"), col("department.departmentName", "Department"), col("requiredDate", "Required", "date"), col("priority", "Priority", "status"), col("poType", "Type"), col("requestedQtyLabel", "Qty Request"), col("orderedQtyLabel", "Qty Ordered"), col("totalAmount", "Est. Total", "currency"), col("lineCount", "Lines", "number"), col("convertedToPO", "PO"), col("status", "Status", "status")]),
      { ...page("purchase-order", "Purchase Order", "Pemesanan barang dan jasa ke supplier", "/api/purchasing/purchase-order", "poNumber", [col("poNumber", "No. PO"), col("poDate", "Tanggal", "date"), col("supplier.supplierName", "Supplier"), col("vendor.vendorName", "Vendor"), col("deliveryDate", "Delivery", "date"), col("poType", "Type"), col("totalAmount", "Total", "currency"), col("status", "Status", "status")]), createRoute: "/modules/purchasing/purchase-order/new" },
      { ...page("goods-receipts", "Goods Receipt (Incoming)", "Penerimaan barang berdasarkan purchase order", "/api/incoming/goods-receipts", "grNumber", [col("grNumber", "No. GR"), col("grDate", "Tanggal", "date"), col("poNumber", "No. PO"), col("supplierName", "Supplier / Vendor"), col("warehouseCode", "Warehouse"), col("qtyReceived", "Received", "number"), col("qtyInspected", "Inspected", "number"), col("status", "Status", "status")]), createRoute: "/modules/incoming/goods-receipts/new" },
      { ...page("purchase-invoices", "Purchase Invoice", "Pencatatan invoice dan matching purchase order", "/api/purchasing/purchase-invoices", "invoiceNumber", [col("invoiceNumber", "No. Invoice"), col("supplierInvoiceNumber", "Invoice Supplier"), col("invoiceDate", "Tanggal", "date"), col("poNumber", "Primary PO"), col("supplierName", "Supplier"), col("totalAmount", "Total", "currency"), col("matchStatus", "Matching", "status"), col("status", "Status", "status")]), createRoute: "/modules/purchasing/purchase-invoices/new" },
      page("incoming-inspections", "Incoming Inspections", "Pemeriksaan kualitas barang yang diterima", "/api/incoming/incoming-inspections", "inspectionNumber", [col("inspectionNumber", "No. Inspection"), col("inspectionDate", "Tanggal", "date"), col("grNumber", "No. GR"), col("gr.poNumber", "No. PO"), col("qtyInspected", "Inspected", "number"), col("qtyAccepted", "Accepted", "number"), col("qtyRejected", "Rejected", "number"), col("decision", "Decision", "status"), col("status", "Status", "status")]),
      { ...report("purchase-resume", "Purchase Resume", "Ringkasan aktivitas pembelian", "/api/reports/purchasing?view=resume"), reportColumns: [
        col("poNumber", "No. PO"), col("poDate", "Tanggal", "date"), col("partnerName", "Supplier / Vendor"),
        col("deliveryDate", "Delivery", "date"), col("actualReceiptDate", "Receipt", "date"),
        col("totalAmount", "Total", "currency"), col("lineCount", "Lines", "number"),
        col("receiptCoveragePercent", "Coverage %", "number"), col("onTimeStatus", "Delivery", "status"), col("status", "Status", "status")
      ] },
      { ...report("purchasing-report", "Purchasing Report", "Laporan pembelian dan performa supplier", "/api/reports/purchasing?view=supplier"), reportColumns: [
        col("partnerCode", "Code"), col("partnerName", "Supplier / Vendor"), col("partnerType", "Type"),
        col("poCount", "PO", "number"), col("totalSpend", "Spend", "currency"), col("completedPoCount", "Completed", "number"),
        col("openPoCount", "Open", "number"), col("latePoCount", "Late", "number"),
        col("receiptCoveragePercent", "Coverage %", "number"), col("averageLeadTimeDays", "Avg Lead Time", "number"),
        col("performanceStatus", "Performance", "status")
      ] }
    ]
  },
  {
    slug: "inventory", label: "Inventory", shortLabel: "Inventory", icon: "warehouse",
    description: "Saldo stok, lokasi penyimpanan, lot, mutasi, dan stock opname.", color: "cyan",
    pages: [
      dashboardPage("Inventory Dashboard", "Minimum stock target dibanding saldo on-hand dan available aktual."),
      page("stock-balances", "Stock Balances", "Saldo dan ketersediaan stok", "/api/inventory/stock-balances", "id", [col("materialCode", "Material Code"), col("materialName", "Material Name"), col("partCode", "Part Code"), col("partNumber", "Part Number"), col("partName", "Part Name"), col("mbomProcessName", "Proses mBOM"), col("warehouseCode", "Warehouse"), col("rackCode", "Rack"), col("lotNumber", "Lot"), col("stockType", "Type"), col("qtyOnHand", "On Hand", "number"), col("qtyAvailable", "Available", "number")]),
      page("stock-reservations", "Stock Reservations", "Audit alokasi stok ke Sales Order dan Manufacturing Order", "/api/inventory/stock-reservations", "reservationNumber", [col("reservationNumber", "Reservation"), col("reservationDate", "Tanggal", "date"), col("partCode", "Part Code"), col("partName", "Part Name"), col("warehouseCode", "Warehouse"), col("rackCode", "Rack"), col("lotNumber", "Lot"), col("referenceType", "Sumber"), col("sourceDocumentNumber", "Dokumen Sumber", "reservationSource"), col("qtyReserved", "Reserved", "number"), col("qtyReleased", "Released", "number"), col("qtyOpen", "Open", "number"), col("uomCode", "UOM"), col("status", "Status", "status")]),
      page("warehouses", "Warehouse Control", "Kontrol gudang, lokasi, kapasitas, stok, dan freeze opname", "/api/inventory/warehouses", "warehouseCode", [col("warehouseCode", "Code"), col("warehouseName", "Warehouse"), col("type", "Type"), col("location", "Location"), col("rackCount", "Locations", "number"), col("stockItemCount", "Stock Lines", "number"), col("qtyOnHand", "On Hand", "number"), col("qtyAvailable", "Available", "number"), col("activeStoCount", "Active STO", "number"), col("isActive", "Status", "active")]),
      page("racks", "Racks & Locations", "Rak dan lokasi penyimpanan", "/api/inventory/racks", "rackCode", [col("rackCode", "Rack Code"), col("rackName", "Rack Name"), col("warehouse.warehouseName", "Warehouse"), col("zone", "Zone"), col("row", "Row"), col("level", "Level"), col("capacity", "Capacity", "number"), col("isActive", "Status", "active")]),
      page("lots", "Lot Master", "Lot dan batch material", "/api/inventory/lots", "lotNumber", [col("lotNumber", "Lot Number"), col("partCode", "Part Code"), col("description", "Description"), col("supplierBatch", "Supplier Batch"), col("manufacturingDate", "Mfg Date", "date"), col("expiryDate", "Expiry", "date")]),
      { ...page("material-issues", "Material Issue / Consume", "Consume material issue dari Daily Plan dan keluarkan stok ke produksi", "/api/production/material-issues", "issueNumber", [col("issueNumber", "No. Issue"), col("issueDate", "Tanggal", "date"), col("manufacturingOrder.moNumber", "MO"), col("workOrder.woNumber", "WO"), col("warehouseCode", "Warehouse"), col("status", "Status", "status")]), createRoute: "/modules/inventory/material-issues/new" },
      { ...page("stock-movements", "Stock Movements", "Riwayat seluruh mutasi persediaan", "/api/inventory/stock-movements", "movementNumber", [col("movementNumber", "Movement"), col("movementDate", "Tanggal", "date"), col("movementType", "Type"), col("direction", "Arah"), col("materialCode", "Material Code"), col("materialName", "Material Name"), col("partCode", "Part Code"), col("partNumber", "Part Number"), col("partName", "Part Name"), col("mbomProcessName", "Proses mBOM"), col("warehouseCode", "Warehouse"), col("rackCode", "Rack"), col("lotNumber", "Lot"), col("qty", "Qty", "number"), col("uomCode", "UOM"), col("referenceNumber", "Referensi")]), createRoute: "/modules/inventory/stock-movements/new" },
      { ...page("stock-opname", "Stock Opname", "Blind count, freeze, maker-checker approval, variance, dan posting adjustment", "/api/inventory/stock-opname", "stoNo", [col("stoNo", "No. STO"), col("stoDate", "Tanggal", "date"), col("stoType", "Type"), col("warehouseCode", "Warehouse"), col("detailCount", "Lines", "number"), col("countedCount", "Counted", "number"), col("countProgressPercent", "Progress %", "number"), col("varianceCount", "Variance", "number"), col("status", "Status", "status"), col("inventoryFrozen", "Frozen", "active")]), createRoute: "/modules/inventory/stock-opname/new" },
      { ...report("inventory-report", "Inventory Report", "Laporan saldo, aging, dan traceability stok FG COMP sampai WIP serta material", "/api/reports/inventory"), reportMode: "inventory-traceability", reportColumns: [
        col("partCode", "Part Code"), col("partName", "Part Name"), col("warehouseCode", "Warehouse"), col("rackCode", "Rack"),
        col("lotNumber", "Lot"), col("stockType", "Stock Type"), col("qtyOnHand", "On Hand", "number"),
        col("qtyReserved", "Reserved", "number"), col("qtyQC", "QC", "number"), col("qtyAvailable", "Available", "number"),
        col("agingDays", "Aging Days", "number"), col("agingBucket", "Aging"), col("stockStatus", "Status", "status")
      ] }
    ]
  },
  {
    slug: "incoming", label: "Incoming", shortLabel: "Incoming", icon: "box",
    description: "Alur barang masuk dari penerimaan sampai penyimpanan.", color: "teal",
    pages: [
      dashboardPage("Incoming Dashboard", "Purchase delivery plan dibanding penerimaan barang aktual per bulan."),
      { ...page("incoming-from-vendor", "Incoming from Vendor", "Penerimaan hasil proses vendor ke QC Hold", "/api/production/vendor-process-orders", "orderNumber", [col("orderNumber", "No. Vendor Process"), col("dueDate", "Target Kembali", "date"), col("moNumber", "MO"), col("outputPartCode", "Part Kembali"), col("processName", "Proses"), col("vendorName", "Vendor"), col("qtySent", "Dikirim", "number"), col("qtyReceived", "Diterima", "number"), col("status", "Status", "status")]), fixedQuery: { status: "Partial Sent,Sent,Partial Received,QC Hold,Completed,Closed" }, vendorProcessFlow: "RECEIVE" },
      { ...page("goods-receipts", "Goods Receipt", "Penerimaan barang dari supplier berdasarkan PO", "/api/incoming/goods-receipts", "grNumber", [col("grNumber", "No. GR"), col("grDate", "Tanggal", "date"), col("poNumber", "No. PO"), col("supplierName", "Supplier / Vendor"), col("warehouseCode", "Warehouse"), col("deliveryNoteNumber", "Surat Jalan"), col("qtyReceived", "Received", "number"), col("status", "Status", "status")]), createRoute: "/modules/incoming/goods-receipts/new" },
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
      dashboardPage("Outgoing Dashboard", "Delivery schedule plan dibanding delivery aktual per bulan."),
      page("delivery-orders", "Delivery Orders", "Order pengiriman berdasarkan sales order aktif", "/api/outgoing/delivery-orders", "soNumber", [col("deliveryOrderNumber", "Delivery Order"), col("soDate", "Tanggal SO", "date"), col("customerName", "Customer"), col("deliveryDate", "Delivery", "date"), col("plannedQty", "Qty Order", "number"), col("deliveredQty", "Delivered", "number"), col("scheduleCount", "Schedule", "number"), col("status", "Status", "status")]),
      { ...page("delivery-schedules", "SO Delivery Schedules", "Jadwal pengiriman sales order", "/api/outgoing/delivery-schedules", "scheduleNumber", [col("scheduleNumber", "No. Schedule"), col("plannedDate", "Rencana", "date"), col("actualDate", "Aktual", "date"), col("soNumber", "No. SO"), col("customerName", "Customer"), col("plannedQty", "Qty Plan", "number"), col("deliveredQty", "Delivered", "number"), col("status", "Status", "status")]), createRoute: "/modules/outgoing/delivery-schedules/new" },
      page("picking-packing", "Picking & Packing", "Persiapan barang pada schedule Scheduled dan On Process", "/api/outgoing/picking-packing", "scheduleNumber", [col("scheduleNumber", "Picking Ref"), col("plannedDate", "Rencana", "date"), col("soNumber", "No. SO"), col("customerName", "Customer"), col("deliveryAddress", "Alamat"), col("plannedQty", "Qty Pick", "number"), col("status", "Status", "status")]),
      page("shipments", "Shipments", "Realisasi dan tracking pengiriman", "/api/outgoing/shipments", "scheduleNumber", [col("scheduleNumber", "Shipment Ref"), col("plannedDate", "Rencana", "date"), col("actualDate", "Aktual", "date"), col("soNumber", "No. SO"), col("customerName", "Customer"), col("shippingMethod", "Method"), col("trackingNumber", "Tracking"), col("status", "Status", "status")]),
      report("outgoing-report", "Outgoing Report", "Laporan barang keluar dan pengiriman", "/api/outgoing/delivery-schedules")
    ]
  }
];

function col(data, label, type = "text") { return { data, label, type }; }
function dashboardPage(label, description) { return { slug: "dashboard", label, description, kind: "dashboard", apiReady: true }; }
function page(slug, label, description, endpoint, detailKey, columns) { return { slug, label, description, endpoint, detailKey, columns, kind: "data", apiReady: true }; }
function placeholder(slug, label, description) { return { slug, label, description, columns: defaultPlaceholderColumns(slug), kind: "data", apiReady: false }; }
function report(slug, label, description, endpoint = "") { return { slug, label, description, endpoint, kind: "report", apiReady: Boolean(endpoint) }; }
function defaultPlaceholderColumns(slug) {
  if (slug.includes("report") || slug.includes("resume")) return [];
  return [col("documentNumber", "Document Number"), col("documentDate", "Date", "date"), col("reference", "Reference"), col("description", "Description"), col("status", "Status", "status")];
}
function productionOrderColumns() { return [col("moNumber", "No. MO"), col("moDate", "Tanggal", "date"), col("part.partNumber", "Part"), col("qtyPlanned", "Planned", "number"), col("qtyProduced", "Produced", "number"), col("qtyGood", "Good", "number"), col("qtyReject", "Reject", "number"), col("status", "Status", "status")]; }

function getModule(slug) { return modules.find((item) => item.slug === slug); }
function getPage(moduleSlug, pageSlug) {
  const canonicalSlug =
    moduleSlug === "planning-ppic" && pageSlug === "monthly-plan"
      ? "monthly-production-plans"
      : pageSlug;
  return getModule(moduleSlug)?.pages.find((item) => item.slug === canonicalSlug);
}

module.exports = { modules, getModule, getPage };
