function source(endpoint, valueKey, codeKeys, nameKeys, options = {}) {
  return Object.freeze({
    endpoint,
    valueKey,
    codeKeys,
    nameKeys,
    metaKeys: options.metaKeys || [],
    dataKeys: options.dataKeys || [],
    activeKey: options.activeKey || "status",
    queryMap: Object.freeze({ q: "search", page: "page", pageSize: "pageSize", currentId: "currentId", ...(options.queryMap || {}) }),
    resultPaths: Object.freeze(options.resultPaths || ["data", "items", "rows", "results"]),
    allowedParents: Object.freeze(options.allowedParents || {})
  });
}

const registry = Object.freeze({
  customers: source("/api/master-data/customers", "id", ["customerCode", "code"], ["customerName", "name"]),
  "customer-codes": source("/api/master-data/customers", "customerCode", ["customerCode", "code"], ["customerName", "name"], { dataKeys: ["id", "customerCode", "customerName", "contact", "phone", "email", "shippingAddress", "paymentTerms", "currencyCode"] }),
  suppliers: source("/api/master-data/suppliers", "id", ["supplierCode", "code"], ["supplierName", "name"]),
  "supplier-codes": source("/api/master-data/suppliers", "supplierCode", ["supplierCode", "code"], ["supplierName", "name"]),
  vendors: source("/api/master-data/vendors", "id", ["vendorCode", "code"], ["vendorName", "name"]),
  "vendor-codes": source("/api/master-data/vendors", "vendorCode", ["vendorCode", "code"], ["vendorName", "name"]),
  parts: source("/api/master-data/parts", "id", ["partCode", "partNumber", "code"], ["partName", "name"], { metaKeys: ["uomCode"], dataKeys: ["purchaseUomCode", "baseUomCode", "stockUomCode", "productionUomCode", "salesUomCode"] }),
  "part-codes": source("/api/master-data/parts", "partCode", ["partCode", "partNumber", "code"], ["partName", "name"], { metaKeys: ["uomCode"], dataKeys: ["id", "partCode", "partNumber", "partName", "uomCode", "purchaseUomCode", "baseUomCode", "stockUomCode"], allowedParents: { customerCode: "customerCode" } }),
  products: source("/api/master-data/products", "id", ["productCode", "partNumber", "code"], ["productName", "name"], { metaKeys: ["uomCode"], dataKeys: ["uomCode", "uom.uomCode"] }),
  materials: source("/api/master-data/materials", "id", ["materialCode", "code"], ["materialName", "name"], { metaKeys: ["uomCode", "materialType"], dataKeys: ["materialForm", "materialFormRef.symbol", "materialFormRef.defaultPurchaseUomCode", "defaultPurchaseUomCode"] }),
  "material-codes": source("/api/master-data/materials", "materialCode", ["materialCode", "code"], ["materialName", "name"], { metaKeys: ["uomCode", "materialType"], dataKeys: ["materialCode", "materialName", "materialType", "materialForm", "defaultPurchaseUomCode"] }),
  "material-substances": source("/api/master-data/material-substances", "id", ["substanceCode", "code"], ["substanceName", "name"]),
  "material-densities": source("/api/master-data/material-densities", "id", ["densityCode", "code"], ["densityName", "name"], { metaKeys: ["densityKgMm3"], allowedParents: { substanceId: "substanceId" } }),
  "material-grades": source("/api/master-data/material-grades", "id", ["gradeCode", "code"], ["displayName", "gradeName", "name"], { metaKeys: ["thickness"], allowedParents: { substanceId: "substanceId" } }),
  uom: source("/api/master-data/uom", "uomCode", ["uomCode", "code"], ["uomName", "name"]),
  currencies: source("/api/master-data/currencies", "currencyCode", ["currencyCode", "code"], ["currencyName", "name"]),
  "payment-terms": source("/api/master-data/payment-terms", "id", ["paymentTermCode", "code"], ["paymentTermName", "name"]),
  warehouses: source("/api/inventory/warehouses", "id", ["warehouseCode", "code"], ["warehouseName", "name"]),
  "warehouse-codes": source("/api/inventory/warehouses", "warehouseCode", ["warehouseCode", "code"], ["warehouseName", "name"]),
  racks: source("/api/inventory/racks", "id", ["rackCode", "code"], ["rackName", "name"], { allowedParents: { warehouseCode: "warehouseCode", warehouseId: "warehouseId" } }),
  lots: source("/api/inventory/lots", "id", ["lotNumber", "lotCode", "code"], ["batchNumber", "name"], { allowedParents: { warehouseCode: "warehouseCode", warehouseId: "warehouseId", rackCode: "rackCode", rackId: "rackId", partId: "partId", materialId: "materialId" } }),
  employees: source("/api/master-data/employees", "id", ["employeeCode", "code"], ["employeeName", "fullName", "name"], { metaKeys: ["departmentName"] }),
  divisions: source("/api/master-data/divisions", "id", ["divisionCode", "code"], ["divisionName", "name"]),
  departments: source("/api/master-data/departments", "id", ["departmentCode", "code"], ["departmentName", "name"]),
  "main-businesses": source("/api/master-data/main-businesses", "id", ["mainBusinessCode", "code"], ["mainBusinessName", "name"]),
  machines: source("/api/master-data/machines", "id", ["machineCode", "code"], ["machineName", "name"], { allowedParents: { workCenterId: "workCenterId", warehouseCode: "warehouseCode" } }),
  "machine-codes": source("/api/master-data/machines", "machineCode", ["machineCode", "code"], ["machineName", "name"], { allowedParents: { workCenterId: "workCenterId", warehouseCode: "warehouseCode" } }),
  "work-centers": source("/api/master-data/work-centers", "id", ["workCenterCode", "code"], ["workCenterName", "name"]),
  processes: source("/api/master-data/processes", "id", ["processCode", "code"], ["processName", "name"]),
  "process-codes": source("/api/master-data/processes", "processCode", ["processCode", "code"], ["processName", "name"]),
  "sub-processes": source("/api/master-data/sub-processes", "id", ["subProcessCode", "code"], ["subProcessName", "name"], { allowedParents: { processId: "processId", processCode: "processCode" } }),
  dies: source("/api/master-data/dies", "id", ["diesCode", "diesNumber", "code"], ["diesName", "name"], { allowedParents: { partId: "partId" } }),
  "working-hour-profiles": source("/api/master-data/working-hour-profiles", "id", ["profileCode", "code"], ["profileName", "name"]),
  "sales-orders": source("/api/sales/sales-orders", "id", ["salesOrderNumber", "orderNumber", "code"], ["customerName", "name"], { allowedParents: { customerId: "customerId" } }),
  "purchase-orders": source("/api/purchasing/purchase-orders", "id", ["purchaseOrderNumber", "poNumber", "code"], ["supplierName", "name"], { allowedParents: { supplierId: "supplierId" } }),
  "manufacturing-orders": source("/api/production/manufacturing-orders", "id", ["manufacturingOrderNumber", "moNumber", "code"], ["partName", "name"], { allowedParents: { partId: "partId" } }),
  "work-orders": source("/api/production/work-orders", "id", ["workOrderNumber", "woNumber", "code"], ["processName", "name"], { allowedParents: { manufacturingOrderId: "manufacturingOrderId", partId: "partId" } })
});

function getLookupSource(name) {
  return registry[String(name || "").trim()] || null;
}

function listLookupSources() {
  return Object.keys(registry);
}

module.exports = { getLookupSource, listLookupSources };
