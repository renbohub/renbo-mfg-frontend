const option = (...values) => values.map((value) => ({ value, label: value }));
const field = (name, label, type = "text", extra = {}) => ({ name, label, type, ...extra });
const lookup = (name, label, entity, valueKey, labelKey, extra = {}) => field(name, label, "lookup", { lookup: { entity, valueKey, labelKey }, ...extra });
const column = (data, label, extra = {}) => ({ data, label, ...extra });
const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthLabels = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const materialTypes = option("Besi", "Stainless Steel", "Aluminum", "Plastic", "Copper", "Rubber", "Brass", "Ceramic", "Wood", "Textile", "Chemical", "Electronic", "Other").map((item) => item.value === "Rubber" ? { ...item, label: "Rubber / Karet" } : item);
const materialFamilies = option("Polymer", "Metal", "Ceramic", "Rubber", "Wood", "Textile", "Chemical", "Electronic").map((item) => item.value === "Rubber" ? { ...item, label: "Rubber / Karet" } : item);
const materialForms = option("Pellet", "Granule", "Sheet", "Film", "Coil", "Pieces", "Plate", "Bar", "Rod", "Tube", "Wire", "Powder", "Liquid", "Block", "Roll", "Compound", "Other");
const monthlyFields = months.map((name, index) => field(name, monthLabels[index], "number", { step: "0.01", section: "Harga Bulanan" }));

function entity(config) {
  return {
    permission: config.slug,
    detailKey: "id",
    mutationKey: "id",
    updateMethod: "PATCH",
    removeMethod: "PATCH",
    removeSuffix: "/remove",
    bulkMethod: "PATCH",
    bulkPath: "/bulk-remove",
    ...config
  };
}

const registry = {
  products: entity({
    slug: "products", label: "Data Barang", singular: "Barang", group: "Data Umum", icon: "box",
    endpoint: "/api/master-data/products", detailKey: "productCode", generateCode: "productCode",
    columns: [column("productCode", "Kode"), column("productName", "Nama Barang"), column("category", "Kategori"), column("uom.uomName", "Satuan"), column("isDeleted", "Status", { type: "status" })],
    fields: [field("productCode", "Kode Barang", "text", { required: true, generated: true }), field("productName", "Nama Barang", "text", { required: true }), field("category", "Kategori"), lookup("uomCode", "Satuan", "uom", "uomCode", "uomName"), field("description", "Deskripsi", "textarea"), field("notes", "Catatan", "textarea")]
  }),
  parts: entity({
    slug: "parts", label: "Data Part", singular: "Part", group: "Data Umum", icon: "box", endpoint: "/api/master-data/parts", detailKey: "partCode", multipart: true,
    columns: [column("partCode", "Kode Part"), column("partNumber", "Part Number"), column("partName", "Nama Part"), column("customerCode", "Pelanggan", { type: "entityLink", entity: "customers" }), column("itemType", "Item Type"), column("rawType", "Raw Type"), column("partType", "Tipe"), column("hasDrawing", "Drawing", { type: "boolean" }), column("bomLevel", "Level BOM"), column("processSequence", "Urutan Proses"), column("branchCode", "Cabang"), column("status", "Status", { type: "statusText" })],
    fields: [
      field("partCode", "Kode Part", "text", { help: "Boleh dikosongkan agar dibuat otomatis." }), field("partNumber", "Part Number"), field("partName", "Nama Part", "text", { required: true }), field("model", "Model"), field("variant", "Varian"),
      field("itemType", "Item Type", "select", { options: option("FG", "WIP", "RAW"), required: true }), field("rawType", "Raw Type", "select", { options: option("MATERIAL", "PURCHASE_PART") }), field("partType", "Tipe Part", "select", { options: option("STANDARD", "COMP"), help: "STANDARD = non-component; COMP = component." }), field("hasDrawing", "Ada Drawing / Standar Khusus", "checkbox", { help: "Purchase part dengan drawing mengikuti penomoran FG non-component; tanpa drawing memakai PART_RAW." }), field("bomLevel", "Level BOM", "number", { min: 0, help: "Diisi otomatis oleh BOM Generator berdasarkan posisi tree." }), field("componentLevel", "Nomor Proses Dasar", "number", { min: 0, help: "Kompatibilitas data lama; generator BOM mengisi urutan proses aktual." }), field("processSequence", "Urutan Proses Aktual", "number", { min: 0, help: "Contoh 010, 020, atau nomor sisipan 011/015." }), field("branchCode", "Kode Cabang", "text", { help: "Abjad pembeda sibling, misalnya A/B. Turunan mewarisi kode ini." }), field("category", "Kategori"), field("status", "Status", "select", { options: option("Active", "Inactive") }), field("statusService", "Status Service", "select", { options: option("Service", "Non Service") }),
      field("planningPolicy", "Planning Policy", "select", { options: option("MTO", "MTS") }), field("itemClass", "Item Class", "select", { options: option("FG", "SFG", "COMPONENT", "RAW_MATERIAL", "PACKAGING", "CONSUMABLE", "MRO", "SERVICE"), section: "Normalized Item" }), field("procurementType", "Procurement Type", "select", { options: option("MAKE", "BUY", "SUBCONTRACT", "MAKE_OR_BUY"), section: "Normalized Item" }), lookup("baseUomCode", "Base UOM", "uom", "uomCode", "uomName", { section: "Normalized Item" }), lookup("purchaseUomCode", "Purchase UOM", "uom", "uomCode", "uomName", { section: "Normalized Item" }), lookup("stockUomCode", "Stock UOM", "uom", "uomCode", "uomName", { section: "Normalized Item" }), lookup("productionUomCode", "Production UOM", "uom", "uomCode", "uomName", { section: "Normalized Item" }), lookup("salesUomCode", "Sales UOM", "uom", "uomCode", "uomName", { section: "Normalized Item" }), field("safetyStock", "Safety Stock", "number", { step: "0.01", section: "Normalized Item" }), field("assemblyPolicy", "Assembly Policy", "select", { options: option("INLINE", "SUB_ASSEMBLY") }), field("bufferStock", "Buffer Stock (%)", "number", { step: "0.01" }),
      lookup("materialId", "Material", "materials", "id", "materialCode"), lookup("supplierId", "Supplier", "suppliers", "id", "supplierName"), lookup("processId", "Proses", "processes", "id", "processName"),
      lookup("customerCode", "Pelanggan Utama", "customers", "customerCode", "customerName", { showValue: true, detailLink: { entity: "customers" }, help: "Kode diambil langsung dari Master Pelanggan." }), lookup("customerCodes", "Daftar Pelanggan", "customers", "customerCode", "customerName", { multiple: true, showValue: true, help: "Pilih satu atau beberapa pelanggan yang menggunakan part ini." }), field("noPhp", "No. PHP"), field("statusPhp", "Status PHP", "select", { options: option("Php", "Non-Php") }),
      field("canPurchase", "Can Purchase", "checkbox", { section: "Transaction Permissions", defaultChecked: true }), field("canManufacture", "Can Manufacture", "checkbox", { section: "Transaction Permissions", defaultChecked: true }), field("canSell", "Can Sell", "checkbox", { section: "Transaction Permissions", defaultChecked: true }), field("canStore", "Can Store", "checkbox", { section: "Transaction Permissions", defaultChecked: true }),
      field("canUseInBom", "Can Use in BOM", "checkbox", { section: "Transaction Permissions", defaultChecked: true }), field("canSubcontract", "Can Subcontract", "checkbox", { section: "Transaction Permissions", defaultChecked: true }), field("canTrackLot", "Can Track Lot", "checkbox", { section: "Transaction Permissions", defaultChecked: true }), field("canTrackSerial", "Can Track Serial", "checkbox", { section: "Transaction Permissions", defaultChecked: true }),
      field("pcsPerBox", "Pcs/Box", "number", { step: "0.01", section: "Packing" }), field("kgPerBox", "Kg/Box", "number", { step: "0.01", section: "Packing" }), field("packingPlastic", "Packing Plastic", "text", { section: "Packing" }), field("pcsPerPlastic", "Pcs/Plastic", "number", { step: "0.01", section: "Packing" }), field("kgPerPlastic", "Kg/Plastic", "number", { step: "0.01", section: "Packing" }), field("qtyPlasticPerBox", "Qty Plastic/Box", "number", { step: "0.01", section: "Packing" }),
      field("photos", "Photo Part", "file", { multiple: true, accept: "image/*", section: "Drawing & Photo", sourcePath: "photos" }), field("files", "Drawing / Dokumen Teknik", "file", { multiple: true, accept: ".pdf,.dwg,.dxf,.step,.stp,.igs,.iges,image/*", section: "Drawing & Photo", sourcePath: "attachments", help: "Upload drawing PDF/CAD atau gambar teknik. File lama tetap tersimpan saat menambah file baru." }), field("notes", "Catatan", "textarea")
    ]
  }),
  "material-substances": entity({
    slug: "material-substances", permission: "materials", label: "Bahan Material", singular: "Bahan Material", group: "Data Umum", icon: "layers", endpoint: "/api/master-data/material-substances", detailKey: "substanceCode",
    columns: [column("substanceCode", "Kode"), column("substanceName", "Nama Bahan"), column("description", "Deskripsi"), column("isActive", "Aktif", { type: "boolean" })],
    fields: [field("substanceCode", "Kode Bahan", "text", { required: true }), field("substanceName", "Nama Bahan", "text", { required: true }), field("description", "Deskripsi", "textarea"), field("isActive", "Aktif", "checkbox", { defaultChecked: true })]
  }),
  "material-densities": entity({
    slug: "material-densities", permission: "materials", label: "Berat Jenis Material", singular: "Berat Jenis", group: "Data Umum", icon: "layers", endpoint: "/api/master-data/material-densities", detailKey: "densityCode",
    columns: [column("densityCode", "Kode"), column("densityName", "Nama"), column("substance.substanceName", "Bahan Material"), column("densityKgMm3", "Density kg/mm3", { type: "number" }), column("isDefault", "Default", { type: "boolean" })],
    fields: [field("densityCode", "Kode Density", "text", { required: true }), field("densityName", "Nama Density"), lookup("substanceId", "Bahan Material", "material-substances", "id", "substanceName", { required: true }), field("densityKgMm3", "Density (kg/mm3)", "number", { required: true, step: "0.00000001", help: "Contoh baja: 0.00000785 kg/mm3." }), field("isDefault", "Default untuk bahan ini", "checkbox"), field("notes", "Catatan", "textarea")]
  }),
  "material-grades": entity({
    slug: "material-grades", permission: "materials", label: "Material Grade", singular: "Material Grade", group: "Data Umum", icon: "layers", endpoint: "/api/master-data/material-grades", detailKey: "id",
    columns: [column("gradeCode", "Kode Grade"), column("gradeName", "Nama Grade"), column("substance.substanceName", "Bahan Material"), column("thickness", "Thickness", { type: "number" }), column("density.densityKgMm3", "Density", { type: "number" })],
    fields: [field("gradeCode", "Kode Grade", "text", { required: true }), field("gradeName", "Nama Grade", "text", { required: true }), lookup("substanceId", "Bahan Material", "material-substances", "id", "substanceName", { required: true }), field("thickness", "Thickness (mm)", "number", { required: true, step: "0.001" }), lookup("densityId", "Berat Jenis", "material-densities", "id", "densityName", { required: true, help: "Harus berasal dari bahan material yang sama." }), field("spec", "Spesifikasi / Standard"), field("isActive", "Aktif", "checkbox", { defaultChecked: true }), field("notes", "Catatan", "textarea")]
  }),
  "material-forms": entity({
    slug: "material-forms", permission: "materials", label: "Material Form", singular: "Material Form", group: "Data Umum", icon: "layers", endpoint: "/api/master-data/material-forms", detailKey: "formCode",
    columns: [column("formCode", "Kode"), column("formName", "Nama Form"), column("symbol", "Notasi"), column("defaultPurchaseUomCode", "Purchase UOM"), column("defaultConversionUomCode", "Stock UOM")],
    fields: [field("formCode", "Kode Form", "text", { required: true, help: "Contoh: COIL, SHEET, PIECES." }), field("formName", "Nama Form", "text", { required: true }), field("symbol", "Notasi C/S/P", "text", { required: true, help: "Simbol singkat unik, misalnya C, S, P." }), lookup("defaultPurchaseUomCode", "Default Purchase UOM", "uom", "uomCode", "uomName"), lookup("defaultConversionUomCode", "Default Stock/Conversion UOM", "uom", "uomCode", "uomName"), field("defaultConversionFactor", "Default Conversion Factor", "number", { step: "0.000001" }), field("isActive", "Aktif", "checkbox", { defaultChecked: true }), field("notes", "Catatan", "textarea")]
  }),
  materials: entity({
    slug: "materials", label: "Data Material", singular: "Material", group: "Data Umum", icon: "layers", endpoint: "/api/master-data/materials", detailKey: "materialCode", generateCode: "materialCode",
    columns: [column("materialCode", "Kode"), column("materialName", "Nama Material"), column("materialSubstance.substanceName", "Bahan"), column("materialGradeRef.gradeCode", "Grade"), column("thickness", "Thickness", { type: "number" }), column("width", "Lebar", { type: "number" })],
    fields: [
      field("materialCode", "Material Code", "text", { generated: true, section: "Informasi Umum", help: "Dibuat otomatis dari grade/thickness dan width; tidak dibedakan berdasarkan Coil/Sheet/Pieces." }), field("materialName", "Material Name", "text", { required: true, section: "Informasi Umum" }),
      lookup("materialGradeId", "Material Grade + Thickness", "material-grades", "id", "displayName", { required: true, section: "Klasifikasi Material", help: "Bahan, thickness, dan density mengikuti master grade." }),
      field("materialType", "Jenis Material", "select", { options: materialTypes, hidden: true, section: "Informasi Umum" }), field("itemCategory", "Item Category", "select", { options: option("Raw Material", "Semi Finished", "Consumable", "Packaging", "Chemical"), section: "Informasi Umum" }),
      field("materialFamily", "Material Family", "select", { options: materialFamilies, section: "Informasi Umum" }), field("materialForm", "Material Form", "select", { options: materialForms, hidden: true, section: "Informasi Umum" }), field("materialGrade", "Material Grade", "text", { hidden: true, section: "Informasi Umum" }), field("attributeSet", "Attribute Set", "text", { section: "Informasi Umum", help: "Menentukan kelompok atribut teknis material." }), field("status", "Status", "select", { options: option("Draft", "Released", "Inactive"), section: "Informasi Umum" }),
      field("spec", "Spesifikasi", "text", { required: true, section: "Technical Attributes" }), field("thickness", "Thickness (mm)", "number", { step: "0.001", section: "Technical Attributes" }), field("width", "Width (mm)", "number", { required: true, step: "0.001", section: "Technical Attributes", help: "Material Form C/S/P dipilih pada skema default/alternatif BOM." }), field("density", "Density (kg/mm³)", "number", { step: "0.00000001", section: "Technical Attributes", help: "Contoh density baja: 0.00000785 kg/mm³." }),
      field("canTrackLot", "Can Track Lot", "checkbox", { section: "Lot Tracking" }), field("notes", "Catatan", "textarea", { section: "Catatan" })
    ]
  }),
  customers: entity({
    slug: "customers", label: "Data Pelanggan", singular: "Pelanggan", group: "Data Umum", icon: "users", endpoint: "/api/master-data/customers", detailKey: "customerCode", generateCode: "customerCode",
    columns: [column("customerCode", "Kode"), column("customerName", "Nama Pelanggan"), column("contact", "Kontak"), column("phone", "Telepon"), column("email", "Email"), column("status", "Status", { type: "statusText" })],
    fields: [field("customerCode", "Kode Pelanggan", "text", { required: true, generated: true }), field("customerName", "Nama Pelanggan", "text", { required: true }), field("contact", "Contact Person"), field("phone", "Telepon", "tel"), field("email", "Email", "email"), field("billingAddress", "Alamat Penagihan", "textarea"), field("shippingAddress", "Alamat Pengiriman", "textarea"), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName"), lookup("paymentTerms", "Syarat Pembayaran", "payment-terms", "termCode", "description", { showValue: true }), field("taxId", "NPWP/Tax ID"), field("customerClassification", "Klasifikasi", "select", { options: option("Regular", "Dies Only", "Job Order"), multiple: true }), field("status", "Status", "select", { options: option("Active", "Inactive") }), field("notes", "Catatan", "textarea")]
  }),
  suppliers: entity({
    slug: "suppliers", label: "Data Supplier", singular: "Supplier", group: "Data Umum", icon: "truck", endpoint: "/api/master-data/suppliers", detailKey: "supplierCode", generateCode: "supplierCode",
    columns: [column("supplierCode", "Kode"), column("supplierName", "Nama Supplier"), column("contact", "Kontak"), column("phone", "Telepon"), column("leadTimeDays", "Lead Time"), column("status", "Status", { type: "statusText" })],
    fields: partyFields("supplierCode", "supplierName", "Supplier")
  }),
  vendors: entity({
    slug: "vendors", label: "Data Vendor", singular: "Vendor", group: "Data Umum", icon: "truck", endpoint: "/api/master-data/vendors", detailKey: "vendorCode", generateCode: "vendorCode",
    columns: [column("vendorCode", "Kode"), column("vendorName", "Nama Vendor"), column("contact", "Kontak"), column("phone", "Telepon"), column("leadTimeDays", "Lead Time"), column("status", "Status", { type: "statusText" })],
    fields: partyFields("vendorCode", "vendorName", "Vendor")
  }),
  uom: entity({
    slug: "uom", label: "Data Satuan", singular: "Satuan", group: "Data Umum", icon: "hash", endpoint: "/api/master-data/uom", detailKey: "uomCode",
    columns: [column("uomCode", "Kode"), column("uomName", "Nama Satuan"), column("category", "Kategori"), column("notes", "Catatan")],
    fields: [field("uomCode", "Kode Satuan", "text", { required: true }), field("uomName", "Nama Satuan", "text", { required: true }), field("category", "Kategori UOM", "select", { options: option("COUNT", "WEIGHT", "LENGTH", "AREA", "VOLUME", "TIME", "PACKAGING", "OTHER") }), field("notes", "Catatan", "textarea")]
  }),
  warehouses: entity({
    slug: "warehouses", label: "Data Gudang", singular: "Gudang", group: "Data Umum", icon: "warehouse", endpoint: "/api/inventory/warehouses", detailKey: "warehouseCode", mutationKey: "warehouseCode", generateCode: "warehouseCode",
    columns: [column("warehouseCode", "Kode"), column("warehouseName", "Nama Gudang"), column("location", "Lokasi"), column("type", "Tipe"), column("stockStatus", "Stock Status"), column("isActive", "Status", { type: "active" })],
    fields: [field("warehouseCode", "Kode Gudang", "text", { required: true, generated: true }), field("warehouseName", "Nama Gudang", "text", { required: true }), field("location", "Lokasi", "textarea"), field("type", "Tipe", "select", { options: option("Main", "Sub", "Transit", "Quarantine") }), field("stockStatus", "Stock Status", "select", { options: option("AVAILABLE", "QC_HOLD", "QUARANTINE", "NG", "WIP", "FG", "TRANSIT", "MRB") }), field("availableForMrp", "Available for MRP", "checkbox", { defaultChecked: true }), field("availableForProduction", "Available for Production", "checkbox", { defaultChecked: true }), field("availableForDelivery", "Available for Delivery", "checkbox", { defaultChecked: true }), field("isActive", "Aktif", "checkbox"), field("capacity", "Kapasitas", "number", { step: "0.01" }), field("notes", "Catatan", "textarea")]
  }),
  racks: entity({
    slug: "racks", label: "Rack Warehouse", singular: "Rack Warehouse", group: "Data Umum", icon: "layers", endpoint: "/api/inventory/racks", detailKey: "rackCode", mutationKey: "rackCode", generateCode: "rackCode",
    columns: [column("rackCode", "Kode Rack"), column("rackName", "Nama Rack"), column("warehouse.warehouseName", "Warehouse"), column("zone", "Zona"), column("row", "Baris"), column("level", "Level"), column("position", "Posisi"), column("capacity", "Kapasitas", { type: "number" }), column("isActive", "Status", { type: "active" })],
    fields: [field("rackCode", "Kode Rack", "text", { required: true, generated: true }), field("rackName", "Nama Rack", "text", { required: true }), lookup("warehouseCode", "Warehouse", "warehouses", "warehouseCode", "warehouseName", { required: true, showValue: true }), field("zone", "Zona"), field("row", "Baris"), field("level", "Level"), field("position", "Posisi"), field("capacity", "Kapasitas", "number", { step: "0.01" }), lookup("capacityUnit", "Satuan Kapasitas", "uom", "uomCode", "uomName"), field("isActive", "Aktif", "checkbox", { defaultChecked: true }), field("notes", "Catatan", "textarea")]
  }),
  currencies: entity({
    slug: "currencies", label: "Data Mata Uang", singular: "Mata Uang", group: "Data Keuangan", icon: "currency", endpoint: "/api/master-data/currencies", detailKey: "currencyCode",
    columns: [column("currencyCode", "Kode"), column("currencyName", "Nama Mata Uang"), column("symbol", "Simbol"), column("exchangeRate", "Kurs", { type: "number" })],
    fields: [field("currencyCode", "Kode Mata Uang", "text", { required: true }), field("currencyName", "Nama Mata Uang", "text", { required: true }), field("symbol", "Simbol"), field("exchangeRate", "Kurs", "number", { required: true, step: "0.0001" })]
  }),
  "payment-terms": entity({
    slug: "payment-terms", label: "Syarat Pembayaran", singular: "Syarat Pembayaran", group: "Data Keuangan", icon: "calendar", endpoint: "/api/master-data/payment-terms", detailKey: "termCode",
    columns: [column("termCode", "Kode"), column("description", "Deskripsi"), column("days", "Jumlah Hari")],
    fields: [field("termCode", "Kode Termin", "text", { required: true }), field("description", "Deskripsi", "textarea"), field("days", "Jumlah Hari", "number", { required: true, min: 0 })]
  }),
  "price-list": priceListEntity("price-list", "Price List Umum", "/api/master-data/price-list", "file"),
  "customer-part-prices": entity({
    slug: "customer-part-prices", label: "Master Harga Customer", singular: "Harga Customer", group: "Data Keuangan", icon: "currency", endpoint: "/api/master-data/customer-part-prices",
    columns: [column("customer.customerCode", "Customer"), column("customer.customerName", "Nama Customer"), column("part.partCode", "Part"), column("currencyCode", "Currency"), column("unitPrice", "Unit Price", { type: "number" }), column("effectiveFrom", "Berlaku Mulai", { type: "date" }), column("effectiveUntil", "Berlaku Sampai", { type: "date" }), column("isActive", "Status", { type: "active" })],
    fields: [lookup("customerCode", "Customer", "customers", "customerCode", "customerName", { required: true, showValue: true }), lookup("partId", "Finished Good", "parts", "id", "partCode", { required: true, lookupQuery: { itemType: "FG" }, labelKeys: ["partCode","partName"], labelSeparator: " — " }), lookup("currencyCode", "Currency", "currencies", "currencyCode", "currencyName", { required: true }), field("unitPrice", "Unit Price", "number", { required: true, min: 0, step: "0.01" }), field("effectiveFrom", "Berlaku Mulai", "date", { required: true }), field("effectiveUntil", "Berlaku Sampai", "date"), field("isActive", "Aktif", "checkbox", { defaultChecked: true }), field("notes", "Catatan", "textarea")]
  }),
  "vendor-price-lists": entity({
    slug: "vendor-price-lists", label: "Price List Vendor", singular: "Price List Vendor", group: "Data Keuangan", icon: "file", endpoint: "/api/master-data/vendor-price-lists", multipart: true,
    columns: [column("vendor.vendorName", "Vendor"), column("part.partCode", "Part"), column("category", "Kategori"), column("currencyCode", "Mata Uang"), column("pricingYear", "Tahun")],
    fields: [lookup("vendorId", "Vendor", "vendors", "id", "vendorName"), lookup("partId", "Part", "parts", "id", "partCode"), lookup("customerId", "Customer", "customers", "id", "customerName"), field("category", "Kategori", "text", { required: true }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName", { required: true }), field("pricingYear", "Tahun Harga", "number"), field("quotationFiles", "File Quotation", "file", { multiple: true }), field("details", "Detail Proses dan Harga", "json", { help: "Array JSON detail vendor price list." }), field("notes", "Catatan", "textarea")]
  }),
  "part-price-lists": monthlyPriceEntity("part-price-lists", "Harga Part per Bulan", "/api/master-data/part-price-lists", lookup("partId", "Purchase Part", "parts", "id", "partCode", { lookupQuery: { itemType: "RAW", rawType: "PURCHASE_PART" }, labelKeys: ["partCode", "partNumber"], labelSeparator: " — ", help: "Hanya Part Master bertipe Purchase Part yang dapat dipilih." }), [lookup("supplierId", "Supplier", "suppliers", "id", "supplierName", { required: true })]),
  "material-price-lists": monthlyPriceEntity("material-price-lists", "Harga Material per Bulan", "/api/master-data/material-price-lists", lookup("materialGradeId", "Material Grade + Thickness", "material-grades", "id", "displayName"), [lookup("materialSubstanceId", "Bahan Material", "material-substances", "id", "substanceName", { required: true }), lookup("materialId", "Material SKU (opsional)", "materials", "id", "materialCode"), lookup("supplierId", "Supplier", "suppliers", "id", "supplierName", { required: true }), field("thickness", "Thickness dari Grade", "number", { step: "0.001", help: "Diisi otomatis dari Material Grade saat disimpan." }), field("CSP", "C/S/P (opsional)"), field("partNumberCP", "Part Number CP"), field("partNameCP", "Part Name CP")]),
  "scrap-price-masters": entity({
    slug: "scrap-price-masters", permission: "materialPriceLists", label: "Harga Scrap per KG", singular: "Harga Scrap", group: "Data Keuangan", icon: "currency", endpoint: "/api/master-data/scrap-price-masters",
    columns: [column("scrapCode", "Kode Scrap"), column("scrapName", "Nama Scrap"), column("materialType", "Jenis Material"), column("partCode", "Khusus Part"), column("pricePerKg", "Harga / KG", { type: "currency" }), column("effectiveFrom", "Berlaku Mulai", { type: "date" }), column("effectiveUntil", "Berlaku Sampai", { type: "date" }), column("isActive", "Status", { type: "active" })],
    fields: [
      field("scrapCode", "Kode Scrap", "text", { required: true, help: "Contoh SCRAP-STEEL. Kode unik untuk audit harga." }),
      field("scrapName", "Nama Scrap", "text", { required: true }),
      field("materialType", "Jenis Material", "select", { options: [{ value: "", label: "Semua jenis (default)" }, ...materialTypes], help: "Kosong berarti harga default bila tidak ada harga yang lebih spesifik." }),
      lookup("partCode", "Part Khusus", "parts", "partCode", "partName", { showValue: true, help: "Opsional. Jika dipilih, harga ini diprioritaskan hanya untuk part tersebut." }),
      field("pricePerKg", "Harga Scrap / KG (Rupiah)", "number", { required: true, min: 0.01, step: "0.01" }),
      field("effectiveFrom", "Berlaku Mulai", "date", { required: true, defaultValue: "today" }),
      field("effectiveUntil", "Berlaku Sampai", "date"),
      field("isActive", "Aktif", "checkbox", { defaultChecked: true }),
      field("notes", "Catatan / sumber harga", "textarea")
    ]
  }),
  "product-price-lists": monthlyPriceEntity("product-price-lists", "Price List Barang", "/api/master-data/product-price-lists", lookup("productId", "Barang", "products", "id", "productName"), [lookup("supplierId", "Supplier", "suppliers", "id", "supplierName"), lookup("uomCode", "Satuan", "uom", "uomCode", "uomName")]),
  departments: entity({
    slug: "departments", label: "Data Departemen", singular: "Departemen", group: "Data Karyawan", icon: "layers", endpoint: "/api/master-data/departments", detailKey: "departmentCode", generateCode: "departmentCode",
    columns: [column("departmentCode", "Kode"), column("departmentName", "Nama Departemen"), column("notes", "Catatan")],
    fields: [field("departmentCode", "Kode Departemen", "text", { required: true, generated: true }), field("departmentName", "Nama Departemen", "text", { required: true }), field("notes", "Catatan", "textarea")]
  }),
  divisions: entity({
    slug: "divisions", label: "Data Divisi", singular: "Divisi", group: "Data Karyawan", icon: "layers", endpoint: "/api/master-data/divisions", detailKey: "divisionCode", generateCode: "divisionCode",
    columns: [column("divisionCode", "Kode"), column("divisionName", "Nama Divisi"), column("department.departmentName", "Departemen"), column("notes", "Catatan")],
    fields: [field("divisionCode", "Kode Divisi", "text", { required: true, generated: true }), field("divisionName", "Nama Divisi", "text", { required: true }), lookup("departmentId", "Departemen", "departments", "id", "departmentName"), field("notes", "Catatan", "textarea")]
  }),
  employees: entity({
    slug: "employees", label: "Data Pegawai", singular: "Pegawai", group: "Data Karyawan", icon: "user", endpoint: "/api/master-data/employees", detailKey: "employeeId", generateCode: "employeeId", multipart: true,
    columns: [column("employeeId", "NIK"), column("fullName", "Nama Pegawai"), column("position", "Jabatan"), column("department.departmentName", "Departemen"), column("division.divisionName", "Divisi"), column("status", "Status", { type: "statusText" })],
    fields: [field("employeeId", "NIK", "text", { required: true, generated: true }), field("firstName", "Nama Depan"), field("lastName", "Nama Belakang"), field("fullName", "Nama Lengkap", "text", { required: true }), field("email", "Email", "email"), field("phone", "Telepon", "tel"), field("nationalId", "NIK KTP"), field("birthPlace", "Tempat Lahir"), field("birthDate", "Tanggal Lahir", "date"), field("gender", "Jenis Kelamin", "select", { options: option("Male", "Female") }), field("maritalStatus", "Status Pernikahan", "select", { options: option("Single", "Married", "Divorced", "Widowed") }), field("religion", "Agama"), field("bloodType", "Golongan Darah", "select", { options: option("A", "B", "AB", "O") }), field("heightCm", "Tinggi (cm)", "number"), field("weightKg", "Berat (kg)", "number"), field("address", "Alamat", "textarea"), field("position", "Jabatan"), lookup("departmentId", "Departemen", "departments", "id", "departmentName"), lookup("divisionId", "Divisi Utama", "divisions", "id", "divisionName"), field("divisionIds", "Semua Divisi", "json", { help: "Array JSON ID divisi." }), field("hireDate", "Tanggal Masuk", "date"), field("status", "Status", "select", { options: option("Active", "Inactive") }), field("profilePhoto", "Foto Profil", "file", { accept: "image/*" }), field("signature", "Tanda Tangan", "file", { accept: "image/*" }), field("notes", "Catatan", "textarea")]
  }),
  "main-businesses": entity({
    slug: "main-businesses", label: "Bidang Usaha", singular: "Bidang Usaha", group: "Data Operasional", icon: "briefcase", endpoint: "/api/master-data/main-businesses",
    columns: [column("mainBusinessCode", "Kode"), column("mainBusinessName", "Nama Bidang Usaha"), column("notes", "Catatan")],
    fields: [field("mainBusinessCode", "Kode", "text", { required: true }), field("mainBusinessName", "Nama Bidang Usaha", "text", { required: true }), field("notes", "Catatan", "textarea")]
  }),
  processes: entity({
    slug: "processes", label: "Data Proses", singular: "Proses", group: "Data Operasional", icon: "layers", endpoint: "/api/master-data/processes", detailKey: "processCode",
    columns: [column("processCode", "Kode"), column("processName", "Nama Proses"), column("notes", "Catatan")],
    fields: [field("processCode", "Kode Proses", "text", { required: true }), field("processName", "Nama Proses", "text", { required: true }), field("notes", "Catatan", "textarea")]
  }),
  "numbering-rules": entity({
    slug: "numbering-rules", label: "Pengaturan Penomoran", singular: "Aturan Penomoran", group: "Data Operasional", icon: "hash", endpoint: "/api/master-data/numbering-rules", detailKey: "ruleKey",
    columns: [column("ruleKey", "Rule Key"), column("ruleName", "Nama"), column("pattern", "Pola Kode"), column("nextNumber", "Nomor Berikutnya"), column("resetPolicy", "Reset"), column("isActive", "Status", { type: "active" })],
    fields: [
      field("ruleKey", "Rule Key", "text", { required: true, help: "ID unik. Lot tersedia sebagai LOT_INCOMING, LOT_PRODUCTION, LOT_WIP, LOT_VENDOR_PROCESS, dan LOT_ADJUSTMENT." }), field("ruleName", "Nama Aturan", "text", { required: true }), field("prefix", "Prefix"),
      field("pattern", "Pola Pembentukan Kode", "text", { required: true, help: "Token: {PREFIX}, {YYYY}, {YY}, {MM}, {DD}, {CUSTOMER}, {TYPE}, {REV}, {CODE}, {PROCESS}, {BRANCH}, {SEQ}. Posisi {BRANCH} menentukan posisi abjad. {SEQ} wajib ada." }),
      field("sequenceLength", "Panjang Sequence", "number", { required: true, min: 1, max: 12 }), field("nextNumber", "Nomor Berikutnya", "number", { required: true, min: 1 }), field("incrementBy", "Kenaikan", "number", { required: true, min: 1 }),
      field("processStep", "Interval Urutan Proses", "number", { required: true, min: 1, help: "Nilai 10 menghasilkan proses utama 010, 020, 030." }), field("insertionStart", "Awal Nomor Sisipan", "number", { required: true, min: 2, help: "Isi 11 untuk sisipan mulai 011, atau 15 untuk mulai 015. Pada proses 020 otomatis menjadi 021/025." }), field("siblingAlphaMode", "Pembeda Abjad Sibling", "select", { options: option("SAME_PROCESS", "ALWAYS", "NONE"), required: true, help: "SAME_PROCESS menyiapkan A/B untuk child pada urutan proses yang sama." }), field("inheritBranchAlpha", "Wariskan Abjad ke Child", "checkbox", { defaultChecked: true }),
      field("resetPolicy", "Reset Sequence", "select", { options: option("NONE", "YEARLY", "MONTHLY", "DAILY"), required: true }), field("isActive", "Aktif", "checkbox", { defaultChecked: true }), field("notes", "Catatan", "textarea")
    ]
  }),
  "sub-processes": entity({
    slug: "sub-processes", label: "Sub Proses", singular: "Sub Proses", group: "Data Operasional", icon: "layers", endpoint: "/api/master-data/sub-processes", detailKey: "subProcessCode", generateCode: "subProcessCode",
    columns: [column("subProcessCode", "Kode"), column("subProcessName", "Nama Sub Proses"), column("process.processName", "Proses Induk"), column("notes", "Catatan")],
    fields: [field("subProcessCode", "Kode Sub Proses", "text", { required: true, generated: true }), field("subProcessName", "Nama Sub Proses", "text", { required: true }), lookup("processId", "Proses Induk", "processes", "id", "processName", { required: true }), field("notes", "Catatan", "textarea")]
  }),
  "vendor-processes": entity({
    slug: "vendor-processes", label: "Kode Proses Vendor", singular: "Kode Proses Vendor", group: "Data Operasional", icon: "briefcase", endpoint: "/api/master-data/vendor-processes", detailKey: "vendorProcessCode",
    columns: [
      column("vendorProcessCode", "Kode Proses"), column("vendorProcessName", "Nama Proses Vendor"), column("routingProcessName", "Proses Routing"),
      column("category", "Kategori"), column("vendorCodes", "Vendor Pelaksana"),
      column("vendorCount", "Jml Vendor", { type: "number" }), column("priceListCount", "Dipakai Price List", { type: "number" }),
      column("isDeleted", "Status", { type: "status" })
    ],
    fields: [
      lookup("vendorProcessCode", "Kode Proses Routing", "processes", "processCode", "processName", { required: true, showValue: true, section: "Identitas Proses", help: "Pilih dari Master Data Proses agar kode vendor sama persis dengan routing BOM dan pencarian harga tidak ambigu." }),
      field("vendorProcessName", "Nama Proses Vendor", "text", { required: true, section: "Identitas Proses" }),
      field("routingProcessName", "Nama Proses Routing", "text", { formHidden: true, section: "Identitas Proses" }),
      field("category", "Kategori Proses", "select", { required: true, section: "Identitas Proses", options: option("COATING", "PLATING", "HEAT_TREATMENT", "MACHINING", "WELDING", "ASSEMBLY", "INSPECTION", "OTHER") }),
      lookup("vendorIds", "Vendor Pelaksana", "vendors", "id", "vendorCode", { multiple: true, sourceValueKey: "id", detailHidden: true, section: "Vendor Pelaksana", labelKeys: ["vendorCode", "vendorName"], help: "Pilih seluruh vendor yang memiliki kapabilitas menjalankan proses ini. Lead time tetap mengikuti master masing-masing vendor." }),
      field("vendorCodes", "Kode Vendor Pelaksana", "text", { formHidden: true, section: "Vendor Pelaksana" }),
      field("vendorNames", "Nama Vendor Pelaksana", "text", { formHidden: true, section: "Vendor Pelaksana" }),
      field("priceListCount", "Jumlah Price List Aktif", "number", { formHidden: true, section: "Penggunaan Master" }),
      field("notes", "Catatan & Standar Proses", "textarea", { section: "Tata Kelola", help: "Tuliskan spesifikasi umum, standar kualitas, atau persyaratan sertifikat. Harga proses tetap dikelola di Vendor Price List." })
    ]
  }),
  "work-centers": entity({
    slug: "work-centers", permission: "machines", label: "Work Centers", singular: "Work Center", group: "Data Operasional", icon: "layers",
    endpoint: "/api/engineering/work-centers", detailKey: "workCenterCode", mutationKey: "id",
    formView: "master-data/work-center-form", detailView: "master-data/work-center-detail",
    formPageScript: "/js/work-center-form.js?v=20260824-enterprise-1", detailPageScript: "/js/work-center-detail.js?v=20260824-enterprise-1",
    columns: [
      column("workCenterCode", "Kode Work Center"), column("workCenterName", "Nama Work Center"),
      column("lineCode", "Line"), column("machineCount", "Mesin", { type: "number" }),
      column("primaryMachineCode", "Mesin Primary"), column("capacityMinutesPerDay", "Kapasitas/Hari", { type: "number" }),
      column("efficiencyPercent", "Efisiensi %", { type: "number" }), column("sourceLabel", "Sumber"),
      column("isActive", "Status", { type: "active" })
    ],
    fields: [
      field("workCenterCode", "Kode Work Center", "text", { required: true, section: "Identitas Work Center", help: "Kode unik yang digunakan oleh routing dan Monthly Production Plan." }),
      field("workCenterName", "Nama Work Center", "text", { required: true, section: "Identitas Work Center" }),
      field("plantCode", "Plant", "text", { section: "Lokasi & Organisasi" }),
      field("lineCode", "Line", "text", { section: "Lokasi & Organisasi", help: "Contoh: L1, L2, atau WELDING-A." }),
      field("capacityMinutesPerDay", "Kapasitas per Hari (menit)", "number", { required: true, min: 0, step: "1", section: "Kapasitas" }),
      field("efficiencyPercent", "Efisiensi (%)", "number", { required: true, min: 0.01, max: 100, step: "0.01", defaultValue: 100, section: "Kapasitas" }),
      lookup("workingHourProfileId", "Working Hour Profile", "working-hour-profiles", "id", "profileName", { section: "Kapasitas", labelKeys: ["profileCode", "profileName"], help: "Kalender default Work Center. Override plan atau mesin memiliki prioritas lebih tinggi." }),
      lookup("machineIds", "Mesin Anggota", "machines", "id", "machineCode", { required: true, multiple: true, sourceValueKey: "machineId", section: "Assignment Mesin", labelKeys: ["machineCode", "machineName"] }),
      lookup("primaryMachineId", "Mesin Primary", "machines", "id", "machineCode", { section: "Assignment Mesin", labelKeys: ["machineCode", "machineName"] }),
      field("isActive", "Work Center Aktif", "checkbox", { defaultChecked: true, section: "Kontrol" }),
      field("notes", "Catatan", "textarea", { section: "Kontrol" })
    ]
  }),
  shifts: entity({
    slug: "shifts", permission: "machines", label: "Shift", singular: "Shift", group: "Data Operasional", icon: "clock", endpoint: "/api/master-data/shifts", detailKey: "shiftCode",
    columns: [column("shiftCode", "Kode Shift"), column("shiftName", "Nama Shift"), column("sequence", "Urutan", { type: "number" }), column("isActive", "Status", { type: "active" })],
    fields: [field("shiftCode", "Kode Shift", "text", { required: true, section: "Identitas" }), field("shiftName", "Nama Shift", "text", { required: true, section: "Identitas" }), field("sequence", "Urutan", "number", { required: true, min: 1, section: "Identitas" }), field("isActive", "Aktif", "checkbox", { defaultChecked: true, section: "Kontrol" }), field("notes", "Catatan", "textarea", { section: "Kontrol" })]
  }),
  "working-hour-profiles": entity({
    slug: "working-hour-profiles", permission: "machines", label: "Working Hours", singular: "Working Hour Profile", group: "Data Operasional", icon: "calendar", endpoint: "/api/master-data/working-hour-profiles", detailKey: "profileCode",
    mutationKey: "id", formView: "master-data/working-hour-profile-form", detailView: "master-data/working-hour-profile-detail",
    formPageScript: "/js/working-hour-profile-form.js?v=20260824-enterprise-1", detailPageScript: "/js/working-hour-profile-detail.js?v=20260824-enterprise-1",
    columns: [column("profileCode", "Kode Profile"), column("profileName", "Nama Profile"), column("profileType", "Tipe"), column("effectiveFrom", "Berlaku Mulai", { type: "date" }), column("effectiveUntil", "Berlaku Sampai", { type: "date" }), column("assignmentCount", "Dipakai", { type: "number" }), column("isActive", "Status", { type: "active" })],
    fields: [field("profileCode", "Kode Profile", "text", { required: true, section: "Identitas" }), field("profileName", "Nama Profile", "text", { required: true, section: "Identitas" }), field("profileType", "Tipe Profile", "select", { required: true, options: option("REGULAR", "RAMADAN", "SPECIAL"), section: "Masa Berlaku" }), field("effectiveFrom", "Berlaku Mulai", "date", { section: "Masa Berlaku" }), field("effectiveUntil", "Berlaku Sampai", "date", { section: "Masa Berlaku" }), field("priority", "Prioritas", "number", { min: 0, defaultValue: 0, section: "Masa Berlaku" }), field("isActive", "Aktif", "checkbox", { defaultChecked: true, section: "Kontrol" }), field("notes", "Catatan", "textarea", { section: "Kontrol" })]
  }),
  "yearly-working-calendars": entity({
    slug: "yearly-working-calendars", permission: "machines", label: "Kalender Kerja Tahunan", singular: "Event Kalender Kerja", group: "Data Operasional", icon: "calendar",
    endpoint: "/api/master-data/yearly-working-calendars", customView: "master-data/yearly-working-calendar", pageScript: "/js/yearly-working-calendar.js?v=20260904-2",
    columns: [], fields: []
  }),
  machines: machineEntity(),
  dies: diesEntity(),
  "dies-parts": entity({
    slug: "dies-parts", label: "Relasi Dies-Part", singular: "Relasi Dies-Part", group: "Data Engineering", icon: "layers", endpoint: "/api/master-data/dies-part",
    columns: [column("dies.diesCode", "Dies"), column("part.partCode", "Part"), column("isPrimary", "Primary", { type: "boolean" }), column("isActive", "Status", { type: "active" }), column("expectedOutput", "Output/Shot")],
    fields: [lookup("diesId", "Dies", "dies", "id", "diesCode", { required: true }), lookup("partId", "Part", "parts", "id", "partCode", { required: true }), field("isPrimary", "Dies Utama", "checkbox"), field("isActive", "Aktif", "checkbox"), field("effectiveDate", "Tanggal Efektif", "date"), field("expiryDate", "Tanggal Berakhir", "date"), field("expectedOutput", "Expected Output/Shot", "number"), field("notes", "Catatan", "textarea")]
  }),
  "dies-maintenance": diesMaintenanceEntity(),
  "dies-usage": diesUsageEntity(),
  "part-attachments": entity({
    slug: "part-attachments", label: "Dokumen Part", singular: "Dokumen Part", group: "Data Engineering", icon: "file", endpoint: "/api/master-data/part-attachments", multipart: true, updateMethod: "PUT", removeMethod: "DELETE", removeSuffix: "", bulkMethod: "POST",
    columns: [column("part.partCode", "Part"), column("title", "Judul"), column("description", "Deskripsi"), column("uploadedBy", "Diupload Oleh"), column("createdAt", "Tanggal", { type: "date" })],
    fields: [lookup("partId", "Part", "parts", "id", "partCode", { required: true, labelKeys: ["partCode", "partName"] }), field("title", "Judul", "text", { required: true }), field("files", "File", "file", { multiple: true, requiredOnCreate: true }), field("description", "Deskripsi", "textarea"), lookup("uploadedBy", "Diupload Oleh", "employee-names", "fullName", "fullName")]
  }),
  "roles-permissions": entity({
    slug: "roles-permissions", label: "Role & Permission", singular: "Role", group: "Data Sistem", icon: "users",
    endpoint: "/api/system/roles", customView: "master-data/roles-permissions", pageScript: "/js/roles-permissions.js",
    columns: [], fields: []
  }),
  "approval-rules": entity({
    slug: "approval-rules", label: "Approval Rules", singular: "Approval Rule", group: "Data Sistem", icon: "file",
    endpoint: "/api/system/approval-rules", customView: "master-data/approval-rules", pageScript: "/js/approval-rules.js?v=20260827-dropdown-1",
    columns: [], fields: []
  }),
  "ai-model-profiles": entity({
    slug: "ai-model-profiles", permission: "aiModelProfiles", label: "AI Model Registry", singular: "AI Model Profile", group: "Data Sistem", icon: "cpu",
    endpoint: "/api/ai/admin/model-profiles", customView: "master-data/ai-model-profiles", pageScript: "/js/ai-model-profiles.js?v=20260825-1",
    columns: [], fields: []
  }),
  formulas: entity({
    slug: "formulas", label: "Master Formula", singular: "Formula", group: "Data Sistem", icon: "file",
    endpoint: "/api/system/master-formulas", customView: "master-data/formulas", pageScript: "/js/master-formulas.js?v=20260827-dropdown-1",
    columns: [], fields: []
  }),
  "excel-imports": entity({
    slug: "excel-imports", label: "Excel Import Staging", singular: "Excel Import", group: "Data Sistem", icon: "file",
    endpoint: "/api/system/excel-imports", customView: "master-data/excel-imports", pageScript: "/js/excel-imports.js",
    columns: [], fields: []
  })
};

// Effective-dated price masters. The old monthly columns stay in the API as a
// compatibility adapter, but new maintenance is always one price per period.
registry["machine-cost-rates"] = entity({
  slug: "machine-cost-rates", permission: "machines", label: "Riwayat Rate Proses", singular: "Rate Proses",
  group: "Data Keuangan", icon: "currency", endpoint: "/api/master-data/machine-cost-rates",
  columns: [column("machine.machineCode", "Mesin"), column("machine.machineName", "Nama Mesin"), column("unitPrice", "Rate", { type: "currency" }), column("costingRateType", "Dasar Rate"), column("currencyCode", "Mata Uang"), column("effectiveFrom", "Berlaku Mulai", { type: "date" }), column("effectiveUntil", "Berlaku Sampai", { type: "date" }), column("isActive", "Status", { type: "active" })],
  fields: [lookup("machineId", "Mesin / Proses In-house", "machines", "id", "machineCode", { required: true, labelKeys: ["machineCode", "machineName"] }), field("costingRateType", "UOM Rate", "select", { required: true, options: option("PER_SECOND", "PER_MINUTE", "PER_HOUR", "PER_CYCLE") }), field("unitPrice", "Rate Proses", "number", { required: true, min: 0, step: "0.01" }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName", { required: true }), field("effectiveFrom", "Berlaku Mulai", "date", { required: true, defaultValue: "today", help: "Rate lama ditutup otomatis saat Rate Baru dibuat." }), field("effectiveUntil", "Berlaku Sampai", "date", { help: "Boleh kosong; sistem mengisi saat periode berikutnya dimulai." }), field("isActive", "Aktif", "checkbox", { defaultChecked: true }), field("notes", "Catatan", "textarea")]
});

registry["part-price-lists"].label = "Riwayat Harga Purchase Part";
registry["part-price-lists"].singular = "Harga Purchase Part";
registry["material-price-lists"].label = "Riwayat Harga Material";
registry["material-price-lists"].singular = "Harga Material";
registry["product-price-lists"].label = "Riwayat Harga Barang";
registry["product-price-lists"].singular = "Harga Barang";

const materialPriceFields = registry["material-price-lists"].fields;
materialPriceFields.filter((item) => ["materialGradeId", "materialSubstanceId"].includes(item.name)).forEach((item) => {
  item.required = false;
  item.help = "Diisi otomatis bila Material SKU dipilih; wajib hanya untuk harga generik tanpa Material SKU.";
});
const materialSkuPriceField = materialPriceFields.find((item) => item.name === "materialId");
if (materialSkuPriceField) {
  materialSkuPriceField.label = "Material SKU";
  materialSkuPriceField.help = "Pilih material spesifik, atau kosongkan bila harga berlaku generik per substance/grade/thickness.";
}
const materialPriceInsertAt = materialPriceFields.findIndex((item) => item.name === "uomCode");
materialPriceFields.splice(materialPriceInsertAt, 0,
  field("purchasePackageUomCode", "Bentuk Pembelian Default", "select", {
    options: option("COIL", "SHEET", "PLATE", "BAR", "ROD", "TUBE", "WIRE", "PCS", "KG"),
    help: "Contoh COIL. Menjadi default pada Purchase Suggestion."
  }),
  field("moq", "MOQ Default", "number", { min: 0, step: "0.01", help: "Fallback bila Supplier Item belum memiliki MOQ." }),
  field("orderMultiple", "Kelipatan Order", "number", { min: 0, step: "0.01" })
);

// Product previously supplied its own UOM field; keep only the effective-price UOM.
registry["product-price-lists"].fields = registry["product-price-lists"].fields.filter((item, index, all) =>
  item.name !== "uomCode" || index === all.map((candidate) => candidate.name).lastIndexOf("uomCode"));

registry["customer-part-prices"].fields.find((item) => item.name === "effectiveFrom").defaultValue = "today";
registry["customer-part-prices"].fields.find((item) => item.name === "effectiveFrom").help = "Harga sebelumnya ditutup otomatis saat Harga Baru disimpan.";
registry["customer-part-prices"].fields.find((item) => item.name === "effectiveUntil").help = "Boleh kosong; sistem mengisi saat harga berikutnya berlaku.";

const machineCalendarIndex = registry.machines.fields.findIndex((item) => item.name === "defaultShiftHours");
registry.machines.fields.splice(machineCalendarIndex < 0 ? registry.machines.fields.length : machineCalendarIndex, 0,
  lookup("workingHourProfileId", "Working Hour Profile", "working-hour-profiles", "id", "profileName", { section: "Capacity Calendar", labelKeys: ["profileCode", "profileName"], help: "Override khusus mesin; bila kosong mengikuti profile Work Center." }));

function replaceRegistryField(slug, name, replacement) {
  const index = registry[slug]?.fields?.findIndex((item) => item.name === name) ?? -1;
  if (index >= 0) registry[slug].fields.splice(index, 1, replacement);
}

replaceRegistryField("parts", "customerCode", lookup("customerCode", "Pelanggan Utama", "customer-codes", "customerCode", "customerName", { showValue: true, detailLink: { entity: "customers" }, help: "Kode diambil langsung dari Master Pelanggan." }));
replaceRegistryField("parts", "customerCodes", lookup("customerCodes", "Daftar Pelanggan", "customer-codes", "customerCode", "customerName", { multiple: true, showValue: true, help: "Pilih satu atau beberapa pelanggan yang menggunakan part ini." }));
replaceRegistryField("racks", "warehouseCode", lookup("warehouseCode", "Warehouse", "warehouse-codes", "warehouseCode", "warehouseName", { required: true, showValue: true }));
replaceRegistryField("price-list", "partCode", lookup("partCode", "Part", "part-codes", "partCode", "partName", { showValue: true }));
replaceRegistryField("price-list", "materialCode", lookup("materialCode", "Material", "material-codes", "materialCode", "materialName", { showValue: true }));
replaceRegistryField("price-list", "supplierCode", lookup("supplierCode", "Supplier", "supplier-codes", "supplierCode", "supplierName", { showValue: true }));
replaceRegistryField("customer-part-prices", "customerCode", lookup("customerCode", "Customer", "customer-codes", "customerCode", "customerName", { required: true, showValue: true }));
replaceRegistryField("scrap-price-masters", "partCode", lookup("partCode", "Part Khusus", "part-codes", "partCode", "partName", { showValue: true, help: "Opsional. Jika dipilih, harga ini diprioritaskan hanya untuk part tersebut." }));
replaceRegistryField("vendor-processes", "vendorProcessCode", lookup("vendorProcessCode", "Kode Proses Routing", "process-codes", "processCode", "processName", { required: true, showValue: true, section: "Identitas Proses", help: "Pilih dari Master Data Proses agar kode vendor sama persis dengan routing BOM dan pencarian harga tidak ambigu." }));
replaceRegistryField("machines", "warehouseCode", lookup("warehouseCode", "Gudang", "warehouse-codes", "warehouseCode", "warehouseName", { showValue: true, section: "Lokasi" }));
replaceRegistryField("dies", "customerCode", lookup("customerCode", "Customer Pemilik", "customer-codes", "customerCode", "customerName", { showValue: true }));
replaceRegistryField("dies", "warehouseCode", lookup("warehouseCode", "Gudang", "warehouse-codes", "warehouseCode", "warehouseName", { showValue: true }));
replaceRegistryField("dies-maintenance", "vendorCode", lookup("vendorCode", "Vendor Maintenance", "vendor-codes", "vendorCode", "vendorName", { showValue: true }));
replaceRegistryField("dies-usage", "machineCode", lookup("machineCode", "Mesin", "machine-codes", "machineCode", "machineName", { showValue: true }));
replaceRegistryField("employees", "divisionIds", lookup("divisionIds", "Semua Divisi", "divisions", "id", "divisionName", { multiple: true, sourceValueKey: "id", help: "Pilih satu atau beberapa divisi pegawai." }));
replaceRegistryField("material-price-lists", "CSP", field("CSP", "C/S/P (opsional)", "select", { options: option("C", "S", "P") }));
replaceRegistryField("dies-maintenance", "performedBy", lookup("performedBy", "Dilakukan Oleh", "employee-names", "fullName", "fullName"));
replaceRegistryField("dies-maintenance", "statusBefore", field("statusBefore", "Status Sebelum", "select", { options: option("Active", "Maintenance", "Retired", "Scrapped", "Reserved") }));
replaceRegistryField("dies-maintenance", "statusAfter", field("statusAfter", "Status Sesudah", "select", { options: option("Active", "Maintenance", "Retired", "Scrapped", "Reserved") }));
replaceRegistryField("dies-usage", "operatorName", lookup("operatorName", "Operator", "employee-names", "fullName", "fullName"));
replaceRegistryField("dies-usage", "shift", lookup("shift", "Shift", "shifts", "shiftCode", "shiftName", { showValue: true }));

registry["vendor-price-lists"].columns = [
  column("vendor.vendorName", "Vendor"), column("part.partCode", "Part"), column("category", "Kategori"),
  column("currencyCode", "Mata Uang"), column("effectiveFrom", "Berlaku Mulai", { type: "date" }),
  column("effectiveUntil", "Berlaku Sampai", { type: "date" }), column("isActive", "Status", { type: "active" })
];
registry["vendor-price-lists"].fields = [
  lookup("vendorId", "Vendor", "vendors", "id", "vendorName", { required: true }),
  lookup("partId", "Part", "parts", "id", "partCode", { required: true }),
  lookup("customerId", "Customer", "customers", "id", "customerName"),
  field("category", "Kategori", "select", { required: true, options: option("COATING", "PLATING", "HEAT_TREATMENT", "MACHINING", "WELDING", "ASSEMBLY", "INSPECTION", "OTHER") }),
  lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName", { required: true }),
  field("effectiveFrom", "Berlaku Mulai", "date", { required: true, defaultValue: "today", help: "Harga vendor sebelumnya ditutup otomatis." }),
  field("effectiveUntil", "Berlaku Sampai", "date", { help: "Boleh kosong; diisi otomatis saat periode berikutnya dibuat." }),
  field("isActive", "Aktif", "checkbox", { defaultChecked: true }),
  field("quotationFiles", "File Quotation", "file", { multiple: true }),
  field("details", "Detail Proses, Harga & MOQ", "vendor-price-details", { section: "Harga Proses", help: "Pilih proses dan UOM dari master; tidak perlu menulis ID atau JSON." }),
  field("notes", "Catatan", "textarea")
];

function partyFields(codeName, nameName, noun) {
  return [field(codeName, `Kode ${noun}`, "text", { required: true, generated: true }), field(nameName, `Nama ${noun}`, "text", { required: true }), field("contact", "Contact Person"), field("phone", "Telepon", "tel"), field("email", "Email", "email"), field("billingAddress", "Alamat Penagihan", "textarea"), field("shippingAddress", "Alamat Pengiriman", "textarea"), field("leadTimeDays", "Lead Time (hari)", "number"), field("taxId", "NPWP/Tax ID"), lookup("mainBusiness", "Bidang Usaha", "main-businesses", "id", "mainBusinessName", { multiple: true, sourceValueKey: "id" }), field("users", "Pengguna/Kategori", "select", { options: option("operational", "engineer", "other"), multiple: true }), field("status", "Status", "select", { options: option("Active", "Inactive") }), field("notes", "Catatan", "textarea")];
}

function priceListEntity(slug, label, endpoint, icon) {
  return entity({ slug, label, singular: label, group: "Data Keuangan", icon, endpoint,
    columns: [column("priceListCode", "Kode"), column("itemType", "Tipe Item"), column("partCode", "Part"), column("materialCode", "Material"), column("supplierName", "Supplier"), column("unitPrice", "Harga", { type: "currency" }), column("currencyCode", "Mata Uang")],
    fields: [field("priceListCode", "Kode Price List", "text", { help: "Dibuat otomatis bila kosong." }), field("itemType", "Tipe Item", "select", { options: option("PART", "MATERIAL", "PRODUCT") }), lookup("partCode", "Part", "parts", "partCode", "partName", { showValue: true }), field("partName", "Nama Part", "text", { readOnly: true }), field("partDiameter", "Diameter Part", "number", { step: "0.001" }), lookup("materialCode", "Material", "materials", "materialCode", "materialName", { showValue: true }), field("materialType", "Tipe Material", "text", { readOnly: true }), field("materialThickness", "Thickness Material", "number", { step: "0.001", readOnly: true }), lookup("supplierCode", "Supplier", "suppliers", "supplierCode", "supplierName", { showValue: true }), field("supplierName", "Nama Supplier", "text", { readOnly: true }), field("unitPrice", "Harga Satuan", "number", { required: true, step: "0.01" }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName"), field("notes", "Catatan", "textarea")]
  });
}

function monthlyPriceEntity(slug, label, endpoint, ownerField, extraFields = []) {
  const supplierField = extraFields.find((item) => item.name === "supplierId");
  return entity({ slug, label, singular: label, group: "Data Keuangan", icon: "file", endpoint,
    columns: [column(ownerField.name.replace("Id", "." + (ownerField.lookup?.labelKey || "name")), ownerField.label), ...(supplierField ? [column("supplier.supplierName", "Supplier")] : []), column("uomCode", "UOM Harga"), column("unitPrice", "Harga", { type: "currency" }), column("currencyCode", "Mata Uang"), column("effectiveFrom", "Berlaku Mulai", { type: "date" }), column("effectiveUntil", "Berlaku Sampai", { type: "date" }), column("isActive", "Status", { type: "active" })],
    fields: [{ ...ownerField, required: true }, ...extraFields, lookup("uomCode", "UOM Harga", "uom", "uomCode", "uomName", { required: true, help: "Satuan dasar harga, misalnya KG atau PCS." }), field("unitPrice", "Harga Satuan", "number", { required: true, min: 0, step: "0.01" }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName", { required: true }), field("effectiveFrom", "Berlaku Mulai", "date", { required: true, defaultValue: "today", help: "Simpan Harga Baru; harga sebelumnya ditutup otomatis dan histori tidak dihapus." }), field("effectiveUntil", "Berlaku Sampai", "date", { help: "Boleh kosong; sistem mengisi ketika harga berikutnya berlaku." }), field("isActive", "Aktif", "checkbox", { defaultChecked: true }), ...(slug === "part-price-lists" ? [field("statusService", "Status Service", "select", { options: option("Service", "Non-Service") })] : []), field("notes", "Catatan / sumber quotation", "textarea")]
  });
}

function machineEntity() {
  return entity({ slug: "machines", label: "Data Mesin", singular: "Mesin", group: "Data Operasional", icon: "briefcase", endpoint: "/api/master-data/machines", detailKey: "machineCode", generateCode: "machineCode", multipart: true,
    columns: [column("machineCode", "Kode Aset"), column("machineName", "Nama Mesin"), column("machineSpecificationCode", "Specification"), column("machineFamily", "Keluarga"), column("tonnage", "Tonnage"), column("location", "Lokasi"), column("status", "Status", { type: "statusText" })],
    fields: [field("machineCode", "Kode Aset Mesin", "text", { required: true, generated: true }), field("machineName", "Nama Mesin", "text", { required: true }), field("machineSpecificationCode", "Kode Machine Specification", "text", { required: true, section: "Machine Specification", help: "Gunakan kode yang sama untuk mesin yang saling menggantikan, contoh PRESS-MECHANICAL-110T." }), field("machineSpecificationName", "Nama Machine Specification", "text", { required: true, section: "Machine Specification" }), field("machineFamily", "Keluarga Mesin", "select", { required: true, section: "Machine Specification", options: option("PRESS", "SPOT_WELDING", "ARC_WELDING", "MACHINING", "BENDING", "CUTTING", "GRINDING", "PAINTING", "HEAT_TREATMENT", "ASSEMBLY", "INSPECTION", "OTHER") }), field("machineTechnology", "Teknologi", "text", { section: "Machine Specification", help: "Contoh: MECHANICAL, HYDRAULIC, MFDC, MIG, VMC, CMM." }), field("machineType", "Tipe Mesin (Legacy)", "text", { section: "Machine Specification" }), field("tonnage", "Rated Force / Tonnage", "number", { step: "0.01", section: "Machine Specification" }), field("capacity", "Kapasitas Produksi", "number", { step: "0.01", section: "Machine Specification" }), field("capacityUnit", "Satuan Kapasitas", "text", { section: "Machine Specification", help: "Contoh: pcs/jam, kg/jam, kVA, A, mm." }), field("powerKw", "Daya (kW)", "number", { step: "0.01", section: "Machine Specification" }), field("voltage", "Voltage", "number", { step: "0.01", section: "Machine Specification" }), field("specificationDetails", "Detail Spesifikasi per Keluarga", "json", { section: "Machine Specification", help: "JSON terstruktur, contoh Press: {\"strokeMm\":120,\"spmMin\":30,\"spmMax\":80,\"dieHeightMm\":300,\"bolsterLengthMm\":900,\"bolsterWidthMm\":600}." }), field("brand", "Merek", "text", { section: "Identitas Aset" }), field("modelNumber", "Model Number", "text", { section: "Identitas Aset" }), field("serialNumber", "Serial Number", "text", { section: "Identitas Aset" }), field("cycleTime", "Default Cycle Time (detik)", "number", { step: "0.01", help: "Fallback saja; cycle time utama tetap pada routing BOM." }), field("defaultShiftHours", "Jam Standar per Shift", "number", { step: "0.25", section: "Capacity Calendar" }), field("shift1Start", "Shift 1 Mulai", "time", { section: "Capacity Calendar" }), field("shift1End", "Shift 1 Selesai", "time", { section: "Capacity Calendar" }), field("shift2Start", "Shift 2 Mulai", "time", { section: "Capacity Calendar" }), field("shift2End", "Shift 2 Selesai", "time", { section: "Capacity Calendar" }), field("shift3Start", "Shift 3 Mulai", "time", { section: "Capacity Calendar" }), field("shift3End", "Shift 3 Selesai", "time", { section: "Capacity Calendar" }), field("location", "Lokasi"), field("warehouseCode", "Kode Gudang"), field("lineCode", "Kode Line"), field("status", "Status", "select", { options: option("Active", "Inactive", "Maintenance", "Retired") }), field("purchaseDate", "Tanggal Pembelian", "date"), field("purchaseCost", "Harga Pembelian", "number", { step: "0.01" }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName"), field("depreciationRate", "Depresiasi (%)", "number", { step: "0.01" }), field("costingRate", "Costing Rate", "number", { step: "0.01" }), field("costingRateType", "Tipe Costing", "select", { options: option("PER_SECOND", "PER_MINUTE", "PER_HOUR", "PER_CYCLE") }), field("lastMaintenanceDate", "Maintenance Terakhir", "date"), field("nextMaintenanceDate", "Maintenance Berikutnya", "date"), field("maintenanceInterval", "Interval Maintenance (hari)", "number"), field("photos", "Foto", "file", { multiple: true, accept: "image/*" }), field("drawings", "Drawing", "file", { multiple: true }), field("notes", "Catatan", "textarea")]
  });
}

function diesEntity() {
  return entity({ slug: "dies", label: "Data Dies", singular: "Dies", group: "Data Engineering", icon: "box", endpoint: "/api/master-data/dies", detailKey: "diesCode", generateCode: "diesCode", multipart: true,
    columns: [column("diesCode", "Kode"), column("diesNumber", "Nomor Dies"), column("diesName", "Nama Dies"), column("diesType", "Tipe/QD"), column("ownerType", "Pemilik"), column("shotCounter", "Shot Counter", { type: "number" }), column("status", "Status", { type: "statusText" })],
    fields: [field("diesCode", "Kode Dies", "text", { required: true, generated: true }), field("diesNumber", "Nomor Dies"), field("diesName", "Nama Dies", "text", { required: true }), field("diesType", "Tipe Dies / QD", "select", { options: option("QD_SMALL", "QD_MEDIUM", "QD_LARGE", "PROGRESSIVE", "SINGLE", "OTHER") }), field("ownerType", "Pemilik", "select", { options: option("Mitsutoyo", "Customer") }), field("customerCode", "Kode Customer"), field("category", "Kategori", "select", { options: option("Dies Only", "Dies & Part") }), field("status", "Status", "select", { options: option("Active", "Maintenance", "Retired", "Scrapped", "Reserved") }), field("location", "Lokasi"), field("warehouseCode", "Kode Gudang"), field("shotCounter", "Shot Counter", "number"), field("maxShotLifetime", "Maksimum Shot", "number"), field("purchaseDate", "Tanggal Pembelian", "date"), field("purchaseCost", "Harga Pembelian", "number", { step: "0.01" }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName"), field("depreciationRate", "Depresiasi (%)", "number", { step: "0.01" }), field("lastMaintenanceDate", "Maintenance Terakhir", "date"), field("nextMaintenanceDate", "Maintenance Berikutnya", "date"), field("maintenanceInterval", "Interval Maintenance", "number"), field("cavity", "Cavity", "number"), field("tonnage", "Tonnage", "number", { step: "0.01" }), field("cycleTime", "Cycle Time", "number", { step: "0.01" }), field("photos", "Foto", "file", { multiple: true, accept: "image/*" }), field("drawings", "Drawing", "file", { multiple: true }), field("specs", "Spesifikasi", "file", { multiple: true }), field("diesParts", "Relasi Part", "json", { help: "Array JSON relasi dies-part." }), field("notes", "Catatan", "textarea")]
  });
}

function diesMaintenanceEntity() {
  return entity({ slug: "dies-maintenance", label: "Maintenance Dies", singular: "Maintenance Dies", group: "Data Engineering", icon: "calendar", endpoint: "/api/master-data/dies-maintenance", detailKey: "maintenanceNumber", mutationKey: "maintenanceNumber",
    columns: [column("maintenanceNumber", "Nomor"), column("dies.diesCode", "Dies"), column("maintenanceDate", "Tanggal", { type: "date" }), column("maintenanceType", "Tipe"), column("performedBy", "Pelaksana"), column("cost", "Biaya", { type: "currency" })],
    fields: [lookup("diesId", "Dies", "dies", "id", "diesCode", { required: true }), field("maintenanceNumber", "Nomor Maintenance", "text", { required: true }), field("maintenanceDate", "Tanggal Maintenance", "date", { required: true }), field("maintenanceType", "Tipe Maintenance", "select", { options: option("Preventive", "Corrective", "Overhaul", "Inspection"), required: true }), field("shotCounterBefore", "Shot Sebelum", "number"), field("statusBefore", "Status Sebelum"), field("workDescription", "Deskripsi Pekerjaan", "textarea"), field("partsReplaced", "Part Diganti", "textarea"), field("shotCounterReset", "Reset Shot Counter", "checkbox"), field("statusAfter", "Status Sesudah"), field("performedBy", "Dilakukan Oleh"), field("vendorCode", "Kode Vendor"), field("cost", "Biaya", "number", { step: "0.01" }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName"), field("startDate", "Mulai", "datetime-local"), field("endDate", "Selesai", "datetime-local"), field("downtime", "Downtime (menit)", "number", { step: "0.01" }), field("nextMaintenanceDate", "Maintenance Berikutnya", "date"), field("notes", "Catatan", "textarea")]
  });
}

function diesUsageEntity() {
  return entity({ slug: "dies-usage", label: "Pemakaian Dies", singular: "Pemakaian Dies", group: "Data Engineering", icon: "calendar", endpoint: "/api/master-data/dies-usage",
    columns: [column("dies.diesCode", "Dies"), column("part.partCode", "Part"), column("usageDate", "Tanggal", { type: "date" }), column("referenceNumber", "Referensi"), column("shotCount", "Shot"), column("qtyGood", "Good"), column("qtyReject", "Reject")],
    fields: [lookup("diesId", "Dies", "dies", "id", "diesCode", { required: true }), lookup("partId", "Part", "parts", "id", "partCode"), field("usageDate", "Tanggal Pemakaian", "date", { required: true }), field("referenceType", "Tipe Referensi", "select", { options: option("SO", "MANUFACTURING_ORDER", "MPS") }), field("referenceNumber", "Nomor Referensi"), field("shotCount", "Jumlah Shot", "number", { required: true }), field("qtyProduced", "Qty Produced", "number", { step: "0.01" }), field("qtyGood", "Qty Good", "number", { step: "0.01" }), field("qtyReject", "Qty Reject", "number", { step: "0.01" }), field("machineCode", "Kode Mesin"), field("operatorName", "Operator"), field("shift", "Shift"), field("startTime", "Mulai", "datetime-local"), field("endTime", "Selesai", "datetime-local"), field("runningMinutes", "Running Minutes", "number", { step: "0.01" }), field("notes", "Catatan", "textarea")]
  });
}

const entityAliases = {
  "numering-rules": "numbering-rules"
};

function getRegistry() { return registry; }
function getEntity(slug) { return registry[entityAliases[slug] || slug] || null; }
function getGroups() {
  const order = ["Data Umum", "Data Keuangan", "Data Karyawan", "Data Operasional", "Data Engineering", "Data Sistem"];
  return order.map((title) => ({ title, items: Object.values(registry).filter((item) => item.group === title) })).filter((group) => group.items.length);
}

const resourceOverrides = {
  "manufacturing-bom/bill-of-materials": "mbom",
  "planning-ppic/consume-forecast": "forecasts",
  "planning-ppic/master-production-schedule": "mps",
  "planning-ppic/material-requirements-planning": "mrp",
  "planning-ppic/monthly-plan": "monthlyProductionPlan",
  "planning-ppic/capacity-planning": "capacityPlanning",
  "production/manufacturing-orders": "manufacturingOrders",
  "production/work-orders": "workOrders",
  "production/daily-production-schedules": "dailyProductionSchedules",
  "production/production-logs": "productionLogs",
  "production/downtime-logs": "downtimeLogs",
  "production/quality-inspections": "qualityInspections",
  "production/material-issues": "materialIssues",
  "production/vendor-process-orders": "vendorProcessOrders",
  "production/prepare-delivery-vendor": "vendorProcessOrders",
  "purchasing/purchase-requisitions": "purchaseRequisitions",
  "purchasing/purchase-order": "purchaseOrder",
  "purchasing/purchase-invoices": "purchaseInvoices",
  "inventory/stock-balances": "stockBalances",
  "incoming/goods-receipts": "goodsReceipts",
  "incoming/incoming-from-vendor": "vendorProcessOrders",
  "incoming/incoming-inspections": "incomingInspections",
  "incoming/supplier-deliveries": "supplierDeliveries",
  "outgoing/delivery-orders": "deliveryOrders",
  "outgoing/delivery-schedules": "deliverySchedules",
  "outgoing/picking-packing": "pickingPacking",
  "outgoing/shipments": "shipments"
};

function getPermissionCatalog() {
  const { modules } = require("./moduleRegistry");
  const masterPages = Object.values(registry).map((item) => ({
    moduleCode: "master-data",
    moduleLabel: "Master Data",
    pageCode: item.slug,
    pageLabel: item.label,
    resourceCode: item.permission || item.slug,
    apiReady: true
  }));
  const modulePages = modules.flatMap((module) => module.pages.map((pageItem) => ({
    moduleCode: module.slug,
    moduleLabel: module.label,
    pageCode: pageItem.slug,
    pageLabel: pageItem.label,
    resourceCode: resourceOverrides[`${module.slug}/${pageItem.slug}`] || pageItem.slug,
    apiReady: pageItem.apiReady !== false
  })));
  return [...masterPages, ...modulePages, {
    moduleCode: "system", moduleLabel: "System", pageCode: "approvals", pageLabel: "Approval Requests", resourceCode: "approvals", apiReady: true
  }];
}

module.exports = { getRegistry, getEntity, getGroups, getPermissionCatalog };
