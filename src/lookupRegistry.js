function source(endpoint, valueKey, codeKeys, nameKeys, options = {}) {
  return Object.freeze({
    endpoint,
    valueKey,
    codeKeys,
    nameKeys,
    joinCodeKeys: Boolean(options.joinCodeKeys),
    metaKeys: options.metaKeys || [],
    dataKeys: options.dataKeys || [],
    activeKey: options.activeKey || "status",
    queryMap: Object.freeze({ q: "search", page: "page", pageSize: "pageSize", currentId: "currentId", ...(options.queryMap || {}) }),
    resultPaths: Object.freeze(options.resultPaths || ["data", "items", "rows", "results"]),
    allowedParents: Object.freeze(options.allowedParents || {})
  });
}

const registry = Object.freeze({
  'purchase-item-prices': source('/api/purchasing/purchase-requisitions/item-prices', 'id', ['itemCode'], ['itemName'], { queryMap: { q: 'q', pageSize: 'limit' }, metaKeys: ['partnerName'], dataKeys: ['kind', 'itemCode', 'itemName', 'productId', 'productCode', 'partId', 'partCode', 'partNumber', 'partName', 'materialId', 'materialCode', 'materialName', 'materialType', 'spec', 'thickness', 'width', 'CSP', 'supplierCode', 'vendorCode', 'partnerName', 'unitPrice', 'currencyCode', 'uomCode', 'processCode', 'processName', 'vendorProcessId', 'vendorPriceListId', 'vendorPriceListDetailId', 'category', 'purchasePackageUomCode', 'conversionFactor', 'conversionUomCode', 'minimumOrderQty', 'minimumCharge'], allowedParents: { kind: 'kind', at: 'at', supplierCode: 'supplierCode', vendorCode: 'vendorCode', currencyCode: 'currencyCode', materialCode: 'materialCode', partCode: 'partCode' } }),
  "finished-good-prices": source('/api/master-data/parts', 'id', ['partCode', 'partNumber'], ['partName'], { joinCodeKeys: true, queryMap: { q: 'q', pageSize: 'limit' }, allowedParents: { itemType: 'itemType', customerCode: 'customerCode' }, dataKeys: ['partCode', 'partNumber', 'partName'] }),
  "vendor-bom-fgs": source('/api/master-data/vendor-price-lists/bom-fgs','id',['partNumber'],['partName'],{queryMap:{q:'q',pageSize:'limit'},metaKeys:['partCode','bomNumber'],dataKeys:['partCode','partNumber','partName','bomNumber','revision','customerId']}),
  "pr-parts": source("/api/master-data/parts", "partCode", ["partCode"], ["partName"], {
    queryMap: { q: "q", pageSize: "limit" }, metaKeys: ["partNumber"],
    dataKeys: ["id", "partCode", "partNumber", "partName", "rawType", "hasDrawing", "purchaseUomCode", "baseUomCode", "uomCode", "material.spec", "material.thickness", "material.width", "material.materialName"],
    allowedParents: { rawType: "rawType", hasDrawing: "hasDrawing", prCategory: "prCategory" },
  }),
  "pr-materials": source("/api/master-data/materials", "materialCode", ["materialCode"], ["materialName"], {
    queryMap: { q: "q", pageSize: "limit" }, metaKeys: ["materialType"],
    dataKeys: ["id", "materialCode", "materialName", "materialType", "materialGrade", "materialForm", "CSP", "spec", "thickness", "width", "defaultPurchaseUomCode", "defaultConversionUomCode", "defaultConversionFactor"],
  }),
  "pr-raw-material-parts": source("/api/master-data/parts", "partCode", ["partCode"], ["partName"], {
    queryMap: { q: "q", pageSize: "limit" }, metaKeys: ["partNumber"],
    dataKeys: ["id", "partCode", "partNumber", "partName", "itemType", "rawType", "materialId", "material"],
    allowedParents: { itemType: "itemType", rawType: "rawType" },
  }),
  customers: source("/api/master-data/customers", "id", ["customerCode", "code"], ["customerName", "name"], { queryMap: { q: "q", pageSize: "limit" } }),
  "customer-codes": source("/api/master-data/customers", "customerCode", ["customerCode", "code"], ["customerName", "name"], { queryMap: { q: "q", pageSize: "limit" }, dataKeys: ["id", "customerCode", "customerName", "contact", "phone", "email", "shippingAddress", "paymentTerms", "currencyCode"] }),
  suppliers: source("/api/master-data/suppliers", "id", ["supplierCode", "code"], ["supplierName", "name"], { queryMap: { q: "q", pageSize: "limit" } }),
  "supplier-codes": source("/api/master-data/suppliers", "supplierCode", ["supplierCode", "code"], ["supplierName", "name"], { queryMap: { q: "q", pageSize: "limit" } }),
  vendors: source("/api/master-data/vendors", "id", ["vendorCode", "code"], ["vendorName", "name"], { queryMap: { q: "q", pageSize: "limit" } }),
  "vendor-codes": source("/api/master-data/vendors", "vendorCode", ["vendorCode", "code"], ["vendorName", "name"], { queryMap: { q: "q", pageSize: "limit" } }),
  parts: source("/api/master-data/parts", "id", ["partCode", "partNumber", "code"], ["partName", "name"], { queryMap: { q: "q", pageSize: "limit" }, metaKeys: ["uomCode"], dataKeys: ["purchaseUomCode", "baseUomCode", "stockUomCode", "productionUomCode", "salesUomCode", "customerCode", "customerCodes", "partCode", "partNumber", "partName", "supplierId", "itemType", "rawType"], allowedParents: { customerCode: "customerCode", itemType: "itemType", rawType: "rawType", pricingScope: "pricingScope", status: "status" } }),
  "part-codes": source("/api/master-data/parts", "partCode", ["partCode", "partNumber", "code"], ["partName", "name"], { queryMap: { q: "q", pageSize: "limit" }, metaKeys: ["uomCode"], dataKeys: ["id", "partCode", "partNumber", "partName", "uomCode", "purchaseUomCode", "baseUomCode", "stockUomCode"], allowedParents: { customerCode: "customerCode", pricingScope: "pricingScope" } }),
  products: source("/api/master-data/products", "id", ["productCode", "partNumber", "code"], ["productName", "name"], { metaKeys: ["uomCode"], dataKeys: ["uomCode", "uom.uomCode"] }),
  materials: source("/api/master-data/materials", "id", ["materialCode", "code"], ["materialName", "name"], { queryMap: { q: "q", pageSize: "limit" }, metaKeys: ["uomCode", "materialType"], dataKeys: ["materialForm", "materialFormRef.symbol", "materialFormRef.defaultPurchaseUomCode", "defaultPurchaseUomCode"] }),
  "material-codes": source("/api/master-data/materials", "materialCode", ["materialCode", "code"], ["materialName", "name"], { queryMap: { q: "q", pageSize: "limit" }, metaKeys: ["uomCode", "materialType"], dataKeys: ["materialCode", "materialName", "materialType", "materialForm", "defaultPurchaseUomCode"] }),
  "material-substances": source("/api/master-data/material-substances", "id", ["substanceCode", "code"], ["substanceName", "name"], { queryMap: { q: "q", pageSize: "limit" } }),
  "material-densities": source("/api/master-data/material-densities", "id", ["densityCode", "code"], ["densityName", "name"], { metaKeys: ["densityKgMm3"], allowedParents: { substanceId: "substanceId" } }),
  "material-grades": source("/api/master-data/material-grades", "id", ["gradeCode", "code"], ["displayName", "gradeName", "name"], { queryMap: { q: "q", pageSize: "limit" }, metaKeys: ["thickness"], dataKeys: ['thickness', 'substanceId', 'substance', 'densityId', 'density', 'spec'], allowedParents: { substanceId: "substanceId" } }),
  uom: source("/api/master-data/uom", "uomCode", ["uomCode", "code"], ["uomName", "name"], { queryMap: { q: "q", pageSize: "limit" } }),
  currencies: source("/api/master-data/currencies", "currencyCode", ["currencyCode", "code"], ["currencyName", "name"], { queryMap: { q: "q", pageSize: "limit" } }),
  "payment-terms": source("/api/master-data/payment-terms", "termCode", ["termCode"], ["description"], { dataKeys: ["termCode", "description", "days"] }),
  warehouses: source("/api/inventory/warehouses", "id", ["warehouseCode", "code"], ["warehouseName", "name"]),
  "warehouse-codes": source("/api/inventory/warehouses", "warehouseCode", ["warehouseCode", "code"], ["warehouseName", "name"]),
  racks: source("/api/inventory/racks", "id", ["rackCode", "code"], ["rackName", "name"], { allowedParents: { warehouseCode: "warehouseCode", warehouseId: "warehouseId" } }),
  lots: source("/api/inventory/lots", "id", ["lotNumber", "lotCode", "code"], ["batchNumber", "name"], { allowedParents: { warehouseCode: "warehouseCode", warehouseId: "warehouseId", rackCode: "rackCode", rackId: "rackId", partId: "partId", materialId: "materialId" } }),
  employees: source("/api/master-data/employees", "id", ["employeeId", "employeeCode", "code"], ["fullName", "employeeName", "name"], { metaKeys: ["department.departmentName", "departmentName"] }),
  "employee-names": source("/api/master-data/employees", "fullName", ["employeeId", "employeeCode", "code"], ["fullName", "employeeName", "name"], { metaKeys: ["department.departmentName", "departmentName"] }),
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
  "qd-types": source("/api/master-data/qd-types", "id", ["typeCode"], ["displayName", "typeName"], { queryMap: { q: "q", pageSize: "limit" }, activeKey: "isActive" }),
  "qd-units": source("/api/master-data/qd-units", "id", ["qdCode", "qdNumber"], ["qdName"], { queryMap: { q: "q", pageSize: "limit" }, allowedParents: { qdTypeId: "qdTypeId" } }),
  "working-hour-profiles": source("/api/master-data/working-hour-profiles", "id", ["profileCode", "code"], ["profileName", "name"]),
  shifts: source("/api/master-data/shifts", "shiftCode", ["shiftCode", "code"], ["shiftName", "name"]),
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
