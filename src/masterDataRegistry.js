const option = (...values) => values.map((value) => ({ value, label: value }));
const field = (name, label, type = "text", extra = {}) => ({ name, label, type, ...extra });
const lookup = (name, label, entity, valueKey, labelKey, extra = {}) => field(name, label, "lookup", { lookup: { entity, valueKey, labelKey }, ...extra });
const column = (data, label, extra = {}) => ({ data, label, ...extra });
const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthLabels = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const materialTypes = option("Besi", "Stainless Steel", "Aluminum", "Plastic", "Copper", "Rubber", "Brass", "Ceramic", "Wood", "Textile", "Chemical", "Electronic", "Other").map((item) => item.value === "Rubber" ? { ...item, label: "Rubber / Karet" } : item);
const materialFamilies = option("Polymer", "Metal", "Ceramic", "Rubber", "Wood", "Textile", "Chemical", "Electronic").map((item) => item.value === "Rubber" ? { ...item, label: "Rubber / Karet" } : item);
const materialForms = option("Pellet", "Granule", "Sheet", "Film", "Coil", "Plate", "Bar", "Rod", "Tube", "Wire", "Powder", "Liquid", "Block", "Roll", "Compound", "Other");
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
      field("photos", "Foto", "file", { multiple: true, accept: "image/*", section: "Lampiran" }), field("files", "Dokumen", "file", { multiple: true, section: "Lampiran" }), field("partBases", "Part Bases", "json", { section: "Data Lanjutan" }), field("attachments", "Metadata Lampiran", "json", { section: "Data Lanjutan" }), field("notes", "Catatan", "textarea")
    ]
  }),
  materials: entity({
    slug: "materials", label: "Data Material", singular: "Material", group: "Data Umum", icon: "layers", endpoint: "/api/master-data/materials", detailKey: "materialCode", generateCode: "materialCode",
    columns: [column("materialCode", "Kode"), column("materialName", "Nama Material"), column("materialType", "Tipe Material"), column("materialFamily", "Family"), column("materialForm", "Form"), column("spec", "Spesifikasi")],
    fields: [
      field("materialCode", "Material Code", "text", { generated: true, section: "Informasi Umum", help: "Dibuat otomatis dari spesifikasi dan dimensi." }), field("materialName", "Material Name", "text", { required: true, section: "Informasi Umum" }),
      field("materialType", "Jenis Material", "select", { options: materialTypes, required: true, section: "Informasi Umum" }), field("itemCategory", "Item Category", "select", { options: option("Raw Material", "Semi Finished", "Consumable", "Packaging", "Chemical"), section: "Informasi Umum" }),
      field("materialFamily", "Material Family", "select", { options: materialFamilies, section: "Informasi Umum" }), field("materialForm", "Material Form", "select", { options: materialForms, section: "Informasi Umum" }), field("materialGrade", "Material Grade", "text", { section: "Informasi Umum" }), field("attributeSet", "Attribute Set", "text", { section: "Informasi Umum", help: "Menentukan kelompok atribut teknis material." }), field("status", "Status", "select", { options: option("Draft", "Released", "Inactive"), section: "Informasi Umum" }),
      field("spec", "Spesifikasi", "text", { required: true, section: "Technical Attributes" }), field("thickness", "Thickness (mm)", "number", { step: "0.001", section: "Technical Attributes" }), field("width", "Width (mm)", "number", { step: "0.001", section: "Technical Attributes" }), field("CSP", "C/S/P", "text", { section: "Technical Attributes" }), field("density", "Density (kg/mm³)", "number", { step: "0.00000001", section: "Technical Attributes", help: "Contoh density baja: 0.00000785 kg/mm³." }),
      field("canTrackLot", "Can Track Lot", "checkbox", { section: "Lot Tracking" }), field("notes", "Catatan", "textarea", { section: "Catatan" })
    ]
  }),
  customers: entity({
    slug: "customers", label: "Data Pelanggan", singular: "Pelanggan", group: "Data Umum", icon: "users", endpoint: "/api/master-data/customers", detailKey: "customerCode", generateCode: "customerCode",
    columns: [column("customerCode", "Kode"), column("customerName", "Nama Pelanggan"), column("contact", "Kontak"), column("phone", "Telepon"), column("email", "Email"), column("status", "Status", { type: "statusText" })],
    fields: [field("customerCode", "Kode Pelanggan", "text", { required: true, generated: true }), field("customerName", "Nama Pelanggan", "text", { required: true }), field("contact", "Contact Person"), field("phone", "Telepon", "tel"), field("email", "Email", "email"), field("billingAddress", "Alamat Penagihan", "textarea"), field("shippingAddress", "Alamat Pengiriman", "textarea"), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName"), field("paymentTerms", "Syarat Pembayaran"), field("taxId", "NPWP/Tax ID"), field("customerClassification", "Klasifikasi", "select", { options: option("Regular", "Dies Only", "Job Order"), multiple: true }), field("status", "Status", "select", { options: option("Active", "Inactive") }), field("notes", "Catatan", "textarea")]
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
    fields: [field("uomCode", "Kode Satuan", "text", { required: true }), field("uomName", "Nama Satuan", "text", { required: true }), field("category", "Kategori UOM"), field("notes", "Catatan", "textarea")]
  }),
  warehouses: entity({
    slug: "warehouses", label: "Data Gudang", singular: "Gudang", group: "Data Umum", icon: "warehouse", endpoint: "/api/inventory/warehouses", detailKey: "warehouseCode", mutationKey: "warehouseCode", generateCode: "warehouseCode",
    columns: [column("warehouseCode", "Kode"), column("warehouseName", "Nama Gudang"), column("location", "Lokasi"), column("type", "Tipe"), column("stockStatus", "Stock Status"), column("isActive", "Status", { type: "active" })],
    fields: [field("warehouseCode", "Kode Gudang", "text", { required: true, generated: true }), field("warehouseName", "Nama Gudang", "text", { required: true }), field("location", "Lokasi", "textarea"), field("type", "Tipe", "select", { options: option("Main", "Sub", "Transit", "Quarantine") }), field("stockStatus", "Stock Status", "select", { options: option("AVAILABLE", "QC_HOLD", "QUARANTINE", "NG", "WIP", "FG", "TRANSIT", "MRB") }), field("availableForMrp", "Available for MRP", "checkbox", { defaultChecked: true }), field("availableForProduction", "Available for Production", "checkbox", { defaultChecked: true }), field("availableForDelivery", "Available for Delivery", "checkbox", { defaultChecked: true }), field("isActive", "Aktif", "checkbox"), field("capacity", "Kapasitas", "number", { step: "0.01" }), field("notes", "Catatan", "textarea")]
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
  "vendor-price-lists": entity({
    slug: "vendor-price-lists", label: "Price List Vendor", singular: "Price List Vendor", group: "Data Keuangan", icon: "file", endpoint: "/api/master-data/vendor-price-lists", multipart: true,
    columns: [column("vendor.vendorName", "Vendor"), column("part.partCode", "Part"), column("category", "Kategori"), column("currencyCode", "Mata Uang"), column("pricingYear", "Tahun")],
    fields: [lookup("vendorId", "Vendor", "vendors", "id", "vendorName"), lookup("partId", "Part", "parts", "id", "partCode"), lookup("customerId", "Customer", "customers", "id", "customerName"), field("category", "Kategori", "text", { required: true }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName", { required: true }), field("pricingYear", "Tahun Harga", "number"), field("quotationFiles", "File Quotation", "file", { multiple: true }), field("details", "Detail Proses dan Harga", "json", { help: "Array JSON detail vendor price list." }), field("notes", "Catatan", "textarea")]
  }),
  "part-price-lists": monthlyPriceEntity("part-price-lists", "Harga Part per Bulan", "/api/master-data/part-price-lists", lookup("partId", "Part", "parts", "id", "partCode"), [lookup("supplierId", "Supplier", "suppliers", "id", "supplierName", { required: true })]),
  "material-price-lists": monthlyPriceEntity("material-price-lists", "Harga Material per Bulan", "/api/master-data/material-price-lists", lookup("materialId", "Material", "materials", "id", "materialCode"), [lookup("supplierId", "Supplier", "suppliers", "id", "supplierName", { required: true }), field("CSP", "C/S/P"), field("thickness", "Thickness", "number", { step: "0.001" }), field("partNumberCP", "Part Number CP"), field("partNameCP", "Part Name CP")]),
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
      field("ruleKey", "Rule Key", "text", { required: true, help: "ID unik, contoh PART_RAW atau PURCHASE_ORDER." }), field("ruleName", "Nama Aturan", "text", { required: true }), field("prefix", "Prefix"),
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
    slug: "vendor-processes", label: "Proses Vendor", singular: "Proses Vendor", group: "Data Operasional", icon: "briefcase", endpoint: "/api/master-data/vendor-processes", detailKey: "vendorProcessCode",
    columns: [column("vendorProcessCode", "Kode"), column("vendorProcessName", "Nama Proses"), column("category", "Kategori"), column("notes", "Catatan")],
    fields: [field("vendorProcessCode", "Kode Proses Vendor", "text", { required: true }), field("vendorProcessName", "Nama Proses Vendor", "text", { required: true }), field("category", "Kategori"), field("notes", "Catatan", "textarea")]
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
    fields: [lookup("partId", "Part", "parts", "id", "partCode", { required: true }), field("title", "Judul", "text", { required: true }), field("files", "File", "file", { multiple: true, requiredOnCreate: true }), field("description", "Deskripsi", "textarea"), field("uploadedBy", "Diupload Oleh")]
  }),
  "roles-permissions": entity({
    slug: "roles-permissions", label: "Role & Permission", singular: "Role", group: "Data Sistem", icon: "users",
    endpoint: "/api/system/roles", customView: "master-data/roles-permissions", pageScript: "/js/roles-permissions.js",
    columns: [], fields: []
  }),
  "approval-rules": entity({
    slug: "approval-rules", label: "Approval Rules", singular: "Approval Rule", group: "Data Sistem", icon: "file",
    endpoint: "/api/system/approval-rules", customView: "master-data/approval-rules", pageScript: "/js/approval-rules.js",
    columns: [], fields: []
  })
};

function partyFields(codeName, nameName, noun) {
  return [field(codeName, `Kode ${noun}`, "text", { required: true, generated: true }), field(nameName, `Nama ${noun}`, "text", { required: true }), field("contact", "Contact Person"), field("phone", "Telepon", "tel"), field("email", "Email", "email"), field("billingAddress", "Alamat Penagihan", "textarea"), field("shippingAddress", "Alamat Pengiriman", "textarea"), field("leadTimeDays", "Lead Time (hari)", "number"), field("taxId", "NPWP/Tax ID"), lookup("mainBusiness", "Bidang Usaha", "main-businesses", "id", "mainBusinessName", { multiple: true, sourceValueKey: "id" }), field("users", "Pengguna/Kategori", "select", { options: option("operational", "engineer", "other"), multiple: true }), field("status", "Status", "select", { options: option("Active", "Inactive") }), field("notes", "Catatan", "textarea")];
}

function priceListEntity(slug, label, endpoint, icon) {
  return entity({ slug, label, singular: label, group: "Data Keuangan", icon, endpoint,
    columns: [column("priceListCode", "Kode"), column("itemType", "Tipe Item"), column("partCode", "Part"), column("materialCode", "Material"), column("supplierName", "Supplier"), column("unitPrice", "Harga", { type: "currency" }), column("currencyCode", "Mata Uang")],
    fields: [field("priceListCode", "Kode Price List", "text", { help: "Dibuat otomatis bila kosong." }), field("itemType", "Tipe Item", "select", { options: option("PART", "MATERIAL", "PRODUCT") }), field("partCode", "Kode Part"), field("partName", "Nama Part"), field("partDiameter", "Diameter Part", "number", { step: "0.001" }), field("materialCode", "Kode Material"), field("materialType", "Tipe Material"), field("materialThickness", "Thickness Material", "number", { step: "0.001" }), field("supplierCode", "Kode Supplier"), field("supplierName", "Nama Supplier"), field("unitPrice", "Harga Satuan", "number", { required: true, step: "0.01" }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName"), field("notes", "Catatan", "textarea")]
  });
}

function monthlyPriceEntity(slug, label, endpoint, ownerField, extraFields = []) {
  const supplierField = extraFields.find((item) => item.name === "supplierId");
  return entity({ slug, label, singular: label, group: "Data Keuangan", icon: "file", endpoint,
    columns: [column(ownerField.name.replace("Id", "." + (ownerField.lookup?.labelKey || "name")), ownerField.label), ...(supplierField ? [column("supplier.supplierName", "Supplier")] : []), column("currencyCode", "Mata Uang"), column("pricingYear", "Tahun"), column("january", "Januari", { type: "currency" }), column("december", "Desember", { type: "currency" })],
    fields: [{ ...ownerField, required: true }, ...extraFields, lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName", { required: true }), field("pricingYear", "Tahun Harga", "number", { required: true }), ...monthlyFields, field("statusService", "Status Service", "select", { options: option("Service", "Non-Service") }), field("notes", "Catatan", "textarea")]
  });
}

function machineEntity() {
  return entity({ slug: "machines", label: "Data Mesin", singular: "Mesin", group: "Data Operasional", icon: "briefcase", endpoint: "/api/master-data/machines", detailKey: "machineCode", generateCode: "machineCode", multipart: true,
    columns: [column("machineCode", "Kode"), column("machineName", "Nama Mesin"), column("machineType", "Tipe"), column("brand", "Merek"), column("location", "Lokasi"), column("status", "Status", { type: "statusText" })],
    fields: [field("machineCode", "Kode Mesin", "text", { required: true, generated: true }), field("machineName", "Nama Mesin", "text", { required: true }), field("machineType", "Tipe Mesin"), field("brand", "Merek"), field("modelNumber", "Model Number"), field("serialNumber", "Serial Number"), field("capacity", "Kapasitas", "number", { step: "0.01" }), field("capacityUnit", "Satuan Kapasitas"), field("tonnage", "Tonnage", "number", { step: "0.01" }), field("powerKw", "Daya (kW)", "number", { step: "0.01" }), field("voltage", "Voltage", "number", { step: "0.01" }), field("cycleTime", "Cycle Time (detik)", "number", { step: "0.01" }), field("location", "Lokasi"), field("warehouseCode", "Kode Gudang"), field("lineCode", "Kode Line"), field("status", "Status", "select", { options: option("Active", "Inactive", "Maintenance", "Retired") }), field("purchaseDate", "Tanggal Pembelian", "date"), field("purchaseCost", "Harga Pembelian", "number", { step: "0.01" }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName"), field("depreciationRate", "Depresiasi (%)", "number", { step: "0.01" }), field("costingRate", "Costing Rate", "number", { step: "0.01" }), field("costingRateType", "Tipe Costing", "select", { options: option("PER_SECOND", "PER_MINUTE", "PER_HOUR", "PER_CYCLE") }), field("lastMaintenanceDate", "Maintenance Terakhir", "date"), field("nextMaintenanceDate", "Maintenance Berikutnya", "date"), field("maintenanceInterval", "Interval Maintenance (hari)", "number"), field("photos", "Foto", "file", { multiple: true, accept: "image/*" }), field("drawings", "Drawing", "file", { multiple: true }), field("notes", "Catatan", "textarea")]
  });
}

function diesEntity() {
  return entity({ slug: "dies", label: "Data Dies", singular: "Dies", group: "Data Engineering", icon: "box", endpoint: "/api/master-data/dies", detailKey: "diesCode", generateCode: "diesCode", multipart: true,
    columns: [column("diesCode", "Kode"), column("diesNumber", "Nomor Dies"), column("diesName", "Nama Dies"), column("ownerType", "Pemilik"), column("shotCounter", "Shot Counter", { type: "number" }), column("status", "Status", { type: "statusText" })],
    fields: [field("diesCode", "Kode Dies", "text", { required: true, generated: true }), field("diesNumber", "Nomor Dies"), field("diesName", "Nama Dies", "text", { required: true }), field("ownerType", "Pemilik", "select", { options: option("Mitsutoyo", "Customer") }), field("customerCode", "Kode Customer"), field("category", "Kategori", "select", { options: option("Dies Only", "Dies & Part") }), field("status", "Status", "select", { options: option("Active", "Maintenance", "Retired", "Scrapped", "Reserved") }), field("location", "Lokasi"), field("warehouseCode", "Kode Gudang"), field("shotCounter", "Shot Counter", "number"), field("maxShotLifetime", "Maksimum Shot", "number"), field("purchaseDate", "Tanggal Pembelian", "date"), field("purchaseCost", "Harga Pembelian", "number", { step: "0.01" }), lookup("currencyCode", "Mata Uang", "currencies", "currencyCode", "currencyName"), field("depreciationRate", "Depresiasi (%)", "number", { step: "0.01" }), field("lastMaintenanceDate", "Maintenance Terakhir", "date"), field("nextMaintenanceDate", "Maintenance Berikutnya", "date"), field("maintenanceInterval", "Interval Maintenance", "number"), field("cavity", "Cavity", "number"), field("tonnage", "Tonnage", "number", { step: "0.01" }), field("cycleTime", "Cycle Time", "number", { step: "0.01" }), field("photos", "Foto", "file", { multiple: true, accept: "image/*" }), field("drawings", "Drawing", "file", { multiple: true }), field("specs", "Spesifikasi", "file", { multiple: true }), field("diesParts", "Relasi Part", "json", { help: "Array JSON relasi dies-part." }), field("notes", "Catatan", "textarea")]
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
  "purchasing/purchase-requisitions": "purchaseRequisitions",
  "purchasing/purchase-order": "purchaseOrder",
  "purchasing/purchase-invoices": "purchaseInvoices",
  "inventory/stock-balances": "stockBalances",
  "incoming/goods-receipts": "goodsReceipts",
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
