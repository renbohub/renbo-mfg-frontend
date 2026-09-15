(function () {
  'use strict';
  const config = JSON.parse(document.getElementById('po-form-config').textContent);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const materialModel = window.PurchasingMaterial;
  const date = value => value ? String(value).slice(0, 10) : '';
  const token = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  let recordId = null, linkedToPr = false, partner = null, partnerSequence = 0, numberSequence = 0, initializing = true;
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...options.headers } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Permintaan gagal diproses.');
    return result.data || result.item || result;
  }
  function show(message, kind = 'danger') { $('po-form-alert').textContent = message; $('po-form-alert').className = `alert alert-${kind}`; }
  function showPartner(value = {}) {
    $('po-partner-name').value = value.supplierName || value.vendorName || '';
    $('po-contact').value = value.contact || '';
    $('po-phone').value = value.phone || '';
    $('po-email').value = value.email || '';
    $('po-address').value = value.address ?? value.billingAddress ?? value.shippingAddress ?? '';
  }
  async function previewNumber() {
    if (config.mode === 'edit') return;
    const ticket = ++numberSequence;
    if (!$('po-supplier').value) { $('po-number').value = 'Pilih supplier / vendor'; return; }
    try {
      const params = new URLSearchParams({ partnerCode: $('po-supplier').value, poType: $('po-type').value, poNumberPrefix: $('po-number-prefix').value });
      const value = await api(`/modules/api/purchasing-po/generate-number?${params}`);
      if (ticket === numberSequence) { $('po-number').value = value.poNumber; $('po-number-hint').textContent = 'Perkiraan nomor; nomor final dialokasikan saat simpan.'; }
    } catch (error) { if (ticket === numberSequence) { $('po-number').value = 'Otomatis saat disimpan'; $('po-number-hint').textContent = error.message; } }
  }
  function setPartnerKind(kind) {
    $('po-partner-kind').value = kind;
    const select = $('po-supplier');
    window.EnterpriseLookup?.clear(select);
    if (window.jQuery?.fn?.select2 && select.classList.contains('select2-hidden-accessible')) window.jQuery(select).select2('destroy');
    delete select.dataset.enterpriseLookupReady;
    select.dataset.enterpriseLookup = kind === 'vendor' ? 'vendor-codes' : 'supplier-codes';
    window.EnterpriseLookup?.enhance?.(select);
    partner = null; showPartner();
  }
  async function loadPartner() {
    const ticket = ++partnerSequence, code = $('po-supplier').value;
    partner = null;
    if (!code) { showPartner(); previewNumber(); return; }
    const value = await api(`/master-data/api/${$('po-partner-kind').value === 'vendor' ? 'vendors' : 'suppliers'}/${encodeURIComponent(code)}`);
    if (ticket !== partnerSequence) return;
    partner = value; showPartner(value); previewNumber();
  }
  const defaultType = () => $('po-type').value === 'Material' ? 'RAW_MATERIAL' : $('po-type').value === 'Out Process' ? 'VENDOR_PROCESS' : 'PRODUCT';
  function addLine(data = {}) {
    const type = data.materialCode ? 'RAW_MATERIAL' : data.vendorPriceListId ? 'VENDOR_PROCESS' : data.productId ? 'PRODUCT' : data.partCode ? 'PURCHASE_PART' : defaultType();
    const values = type === 'RAW_MATERIAL' ? materialModel.storedKgValues(data) : {qty:data.qty??1,unitPrice:data.unitPrice??0,valid:true};
    const row = document.createElement('tr'); row.dataset.poLine = 'true'; row._record = { ...data };
    row._legacyMaterialInvalid = !values.valid;
    row.innerHTML = `<td><select class="form-select form-select-sm" data-line-type aria-label="Jenis item">${[['PRODUCT','Barang / Consumable'],['RAW_MATERIAL','Material'],['PURCHASE_PART','Purchase Part'],['VENDOR_PROCESS','Out Process'],['OTHER','Lainnya']].map(([id,name]) => `<option value="${id}" ${id===type?'selected':''}>${name}</option>`).join('')}</select></td>
      <td style="min-width:210px"><input class="form-control form-control-sm" data-line-code aria-label="Kode item" readonly value="${esc(data.partCode || data.materialCode || data.product?.productCode || '')}"><small class="d-block text-muted" data-material-code>${esc(data.materialCode || '')}</small><button type="button" class="btn btn-sm btn-outline-primary mt-1" data-lookup-item>Cari Item</button> <button type="button" class="btn btn-sm btn-outline-secondary mt-1" data-lookup-price>Harga Supplier</button><small class="d-block text-muted" data-price-source></small></td>
      <td><input class="form-control form-control-sm" data-line-number aria-label="Part No" readonly value="${esc(data.partNumber || '')}"></td>
      <td style="min-width:200px"><input class="form-control form-control-sm" data-line-description aria-label="Deskripsi" required value="${esc(data.description || data.partName || data.materialName || '')}"></td>
      <td><input class="form-control form-control-sm" data-line-qty aria-label="Qty" type="number" min="0.000001" step="any" required value="${esc(values.qty)}"></td>
      <td><input class="form-control form-control-sm" data-line-uom aria-label="UOM" value="${esc(type === 'RAW_MATERIAL' ? 'KG' : data.uomCode || 'PCS')}"></td>
      <td><select class="form-select form-select-sm" data-line-form aria-label="Bentuk pembelian"><option value="">Pilih bentuk</option><option value="COIL">Coil</option><option value="SHEET">Sheet</option></select></td>
      <td><input class="form-control form-control-sm" data-line-price aria-label="Harga per UOM pembelian" type="number" min="0" step="any" value="${esc(values.unitPrice)}"></td>
      <td data-line-total></td><td><button class="btn btn-sm btn-outline-danger" type="button" data-remove-line aria-label="Hapus item">×</button></td>`;
    $('po-lines').appendChild(row);
    row.querySelector('[data-line-form]').value = materialModel.form(data.purchasePackageUomCode || data.CSP);
    if (!values.valid) show('Material pada PO lama belum memiliki konversi KG yang valid. Pilih ulang material dan isi qty/harga dalam KG.', 'warning');
    syncLine(row);
  }
  function syncLine(row) {
    const raw = row.querySelector('[data-line-type]').value === 'RAW_MATERIAL';
    row.querySelector('[data-line-form]').classList.toggle('d-none', !raw);
    row.querySelector('[data-line-form]').required = raw;
    row.querySelector('[data-line-uom]').readOnly = raw;
    if (raw) row.querySelector('[data-line-uom]').value = 'KG';
    const price = row._price;
    if (price) {
      const form = row.querySelector('[data-line-form]').value;
      const uom = row.querySelector('[data-line-uom]').value.toUpperCase();
      const priceUom = String(price.uomCode || '').toUpperCase();
      const kgPrice = raw ? materialModel.pricePerKg(price, form) : null;
      row._priceInvalid = raw ? kgPrice === null : priceUom !== uom;
      row.querySelector('[data-line-price]').value = row._priceInvalid ? '' : raw ? kgPrice : price.unitPrice;
      row.querySelector('[data-price-source]').textContent = `${price.partnerName} · ${price.currencyCode} ${price.unitPrice} / ${price.uomCode}${row._priceInvalid ? ' · Pilih harga sesuai bentuk/UOM atau isi harga per KG' : raw ? ' · Harga transaksi per KG' : ''}`;
    }
    const qty = number(row.querySelector('[data-line-qty]').value), unitPrice = number(row.querySelector('[data-line-price]').value);
    const discount = row._record.discountType === 'nominal' ? number(row._record.discount) : qty * unitPrice * number(row._record.discount) / 100;
    row._total = Math.max(0, qty * unitPrice - discount) * (1 + number(row._record.tax) / 100);
    if (price?.minimumCharge) row._total = Math.max(row._total, number(price.minimumCharge));
    row.querySelector('[data-line-total]').textContent = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(row._total);
    updateSummary();
  }
  function updateSummary() {
    const rows=[...$('po-lines').querySelectorAll('[data-po-line]')],total=rows.reduce((sum,row)=>sum+number(row._total),0);
    if($('po-total'))$('po-total').textContent=($('po-currency').value||'IDR').toUpperCase()+' '+new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(total);
    if($('po-item-count'))$('po-item-count').textContent=rows.length+' item';
  }
  function lookupItem(row, prices = false) {
    const type = row.querySelector('[data-line-type]').value;
    if (prices || ['PRODUCT','VENDOR_PROCESS','OTHER'].includes(type)) return lookupPrice(row);
    const material = type === 'RAW_MATERIAL';
    window.PRFormTools.lookup({ api, source: material ? 'pr-raw-material-parts' : 'pr-parts', title: material ? 'Raw Material' : 'Purchase Part', query: material ? {itemType:'RAW',rawType:'MATERIAL'} : { rawType: 'PURCHASE_PART' }, onSelect(item) {
      if (!row.isConnected) return;
      const value = item.data || {};
      const selection = material ? materialModel.rawPartSelection(item) : null;
      if (material && !selection) return show('Raw material harus terhubung ke Material Master.');
      row._record = material ? { ...selection.material, ...selection, materialId: selection.material.id } : { ...value, partCode: item.id };
      row._legacyMaterialInvalid = false;
      row._price = null;
      row.querySelector('[data-line-code]').value = item.id;
      row.querySelector('[data-line-number]').value = value.partNumber || '';
      row.querySelector('[data-material-code]').textContent = selection?.material.materialCode || '';
      row.querySelector('[data-line-description]').value = value.materialName || value.partName || item.name;
      row.querySelector('[data-line-price]').value = '';
      if (material) {
        const form = materialModel.form(selection.material.defaultPurchaseUomCode || selection.material.CSP);
        row.querySelector('[data-line-form]').value = form;
      } else row.querySelector('[data-line-uom]').value = value.purchaseUomCode || value.baseUomCode || 'PCS';
      syncLine(row); lookupPrice(row);
    } });
  }
  function lookupPrice(row) {
    const type = row.querySelector('[data-line-type]').value;
    const kind = ({ RAW_MATERIAL: 'MATERIAL', VENDOR_PROCESS: 'VENDOR', PURCHASE_PART: 'PART' })[type] || 'PRODUCT';
    const code = kind === 'MATERIAL' ? row._record.materialCode || '' : row.querySelector('[data-line-code]').value;
    const partnerCode = $('po-supplier').value;
    if (partnerCode && (kind === 'VENDOR') !== ($('po-partner-kind').value === 'vendor')) return show('Sesuaikan jenis partner dengan item: Out Process memakai vendor, barang/material memakai supplier.');
    window.PRFormTools.lookup({ api, source: 'purchase-item-prices', title: 'Item & Harga Supplier / Vendor', query: {
      kind, at: $('po-date').value, currencyCode: $('po-currency').value || 'IDR',
      ...(partnerCode ? { [kind === 'VENDOR' ? 'vendorCode' : 'supplierCode']: partnerCode } : {}),
      ...(kind === 'MATERIAL' && code ? { materialCode: code } : {}), ...(kind === 'PART' && code ? { partCode: code } : {}),
    }, onSelect(item) {
      if (!row.isConnected) return;
      const value = item.data;
      row._price = value;
      if (kind === 'MATERIAL' && row._record.materialCode !== value.materialCode) row._record = {};
      row._record = { ...row._record, ...value };
      row._legacyMaterialInvalid = false;
      row.querySelector('[data-line-type]').value = kind === 'PRODUCT' ? 'PRODUCT' : type;
      row.querySelector('[data-line-code]').value = row._record.partCode || value.itemCode;
      row.querySelector('[data-line-number]').value = row._record.partNumber || '';
      row.querySelector('[data-material-code]').textContent = value.materialCode || '';
      row.querySelector('[data-line-description]').value = [value.itemName, value.processName].filter(Boolean).join(' · ');
      row.querySelector('[data-line-uom]').value = value.uomCode;
      if (!row.querySelector('[data-line-form]').value) row.querySelector('[data-line-form]').value = materialModel.form(value.purchasePackageUomCode || value.CSP);
      if (!partnerCode) {
        setPartnerKind(kind === 'VENDOR' ? 'vendor' : 'supplier');
        window.EnterpriseLookup.setSelected($('po-supplier'), { id: value.vendorCode || value.supplierCode, text: value.partnerName });
        loadPartner().catch(error => show(error.message));
      }
      syncLine(row);
    } });
  }
  function linePayload(row, index) {
    const source = row._record, type = row.querySelector('[data-line-type]').value;
    const raw = type === 'RAW_MATERIAL', qty = number(row.querySelector('[data-line-qty]').value);
    const form = row.querySelector('[data-line-form]').value;
    const result = {
      lineNumber: index + 1, productId: type === 'PRODUCT' ? source.productId || null : null,
      partCode: raw || ['PURCHASE_PART','VENDOR_PROCESS'].includes(type) ? source.partCode || null : null,
      partNumber: raw || ['PURCHASE_PART','VENDOR_PROCESS'].includes(type) ? source.partNumber || null : null,
      partName: raw || ['PURCHASE_PART','VENDOR_PROCESS'].includes(type) ? source.partName || null : null,
      materialId: raw ? source.materialId || source.id || null : null, materialCode: raw ? source.materialCode || null : null,
      materialName: raw ? source.materialName || null : null, materialType: raw ? source.materialType || null : null,
      spec: raw ? source.spec || null : null, thickness: raw ? source.thickness ?? null : null, width: raw ? source.width ?? null : null,
      description: row.querySelector('[data-line-description]').value.trim(), qty,
      uomCode: raw ? 'KG' : row.querySelector('[data-line-uom]').value.trim(),
      CSP: raw ? ({COIL:'C',SHEET:'S'})[form] || null : source.CSP || null,
      purchasePackageQty: null, purchasePackageUomCode: raw ? form : null,
      conversionUomCode: null, conversionFactor: null, convertedPurchaseQty: null,
      unitPrice: number(row.querySelector('[data-line-price]').value), totalAmount: row._total,
      category: $('po-subcategory').value.trim().toUpperCase() || source.category || null,
      discount: source.discount || 0, discountType: source.discountType || 'percent', tax: source.tax || 0, notes: source.notes || null,
      vendorPriceListId: type === 'VENDOR_PROCESS' ? source.vendorPriceListId || null : null,
      vendorPriceBreakdown: type === 'VENDOR_PROCESS' ? source.vendorPriceBreakdown || (source.vendorProcessId ? [{ vendorProcessId: source.vendorProcessId, vendorPriceListDetailId: source.vendorPriceListDetailId, processName: source.processName, unitPrice: source.unitPrice, uomCode: source.uomCode }] : []) : [],
    };
    return result;
  }
  async function init() {
    const today = (globalThis.erpBusinessNow?.() || new Date()).toISOString().slice(0, 10);
    $('po-date').value = today; $('po-delivery-date').value = today;
    if (config.mode === 'edit') {
      const po = await api(`/modules/api/purchasing/purchase-order/${encodeURIComponent(config.recordKey)}`);
      recordId = po.id; linkedToPr = Boolean(po.purchaseRequisitions?.length);
      if($('po-status'))$('po-status').textContent=po.status||'Draft';
      setPartnerKind(po.vendorCode ? 'vendor' : 'supplier');
      window.EnterpriseLookup.setSelected($('po-supplier'), { id: po.supplierCode || po.vendorCode, text: po.supplierName || po.vendorName || po.supplier?.supplierName || po.vendor?.vendorName || po.supplierCode || po.vendorCode });
      partner = po.supplier || po.vendor || po; showPartner({ ...partner, ...Object.fromEntries(['supplierName','vendorName','contact','phone','email','billingAddress'].filter(k => po[k] != null).map(k => [k,po[k]])) });
      $('po-number').value = po.poNumber; $('po-number-hint').textContent = 'Nomor dokumen tersimpan.';
      $('po-number-prefix').value = po.poNumber.startsWith('E-PO') ? 'Engineering' : 'Production'; $('po-number-prefix').disabled = true;
      $('po-date').value = date(po.poDate); $('po-delivery-date').value = date(po.deliveryDate);
      if (![...$('po-type').options].some(o => o.value === po.poType)) $('po-type').add(new Option(po.poType, po.poType));
      $('po-type').value = po.poType || 'Other'; $('po-currency').value = po.currencyCode || 'IDR';
      $('po-subcategory').value = po.subCategory || ''; $('po-payment-terms').value = po.paymentTerms || ''; $('po-notes').value = po.notes || '';
      (po.details || []).forEach(addLine);
      if (linkedToPr) {
        $('po-lines-title').textContent = 'Detail PO · Dari PR';
        $('po-add-line').hidden = true; $('po-line-help').textContent = 'PO dari PR. Detail item mengikuti konsolidasi PR.';
        $('po-lines').querySelectorAll('input,select,button').forEach(el => { el.disabled = true; });
        ['po-type','po-partner-kind','po-supplier','po-currency','po-subcategory'].forEach(id => { $(id).disabled = true; });
      }
    } else addLine();
    initializing = false;
  }
  $('po-add-line').addEventListener('click', () => addLine());
  $('po-lines').addEventListener('click', event => {
    const row = event.target.closest('[data-po-line]'); if (!row || linkedToPr) return;
    if (event.target.closest('[data-remove-line]')) { row.remove(); updateSummary(); }
    if (event.target.closest('[data-lookup-item]')) lookupItem(row);
    if (event.target.closest('[data-lookup-price]')) lookupItem(row, true);
  });
  $('po-lines').addEventListener('input', event => {
    const row = event.target.closest('[data-po-line]'); if (!row) return;
    if (event.target.matches('[data-line-price]')) { row._price = null; row._priceInvalid = false; row.querySelector('[data-price-source]').textContent = 'Harga diisi manual'; }
    syncLine(row);
  });
  $('po-lines').addEventListener('change', event => {
    const row = event.target.closest('[data-po-line]'); if (!row) return;
    if (event.target.matches('[data-line-type]')) {
      row._record = {}; row._price = null; row._priceInvalid = false; row._legacyMaterialInvalid = false;
      row.querySelectorAll('[data-line-code],[data-line-number],[data-line-description],[data-line-price],[data-line-form]').forEach(el => { el.value = ''; });
      row.querySelector('[data-material-code]').textContent = '';
      row.querySelector('[data-line-uom]').value = event.target.value === 'RAW_MATERIAL' ? 'KG' : 'PCS';
      row.querySelector('[data-price-source]').textContent = '';
    }
    syncLine(row);
  });
  function invalidatePrices() {
    if (initializing || linkedToPr) return;
    $('po-lines').querySelectorAll('[data-po-line]').forEach(row => { row._price = null; row._priceInvalid = true; row.querySelector('[data-line-price]').value = ''; row.querySelector('[data-price-source]').textContent = 'Pilih ulang harga sesuai partner/tanggal/mata uang'; syncLine(row); });
  }
  $('po-partner-kind').addEventListener('change', () => { setPartnerKind($('po-partner-kind').value); invalidatePrices(); previewNumber(); });
  $('po-type').addEventListener('change', () => {
    if (initializing) return;
    if (!linkedToPr) { setPartnerKind($('po-type').value === 'Out Process' ? 'vendor' : 'supplier'); $('po-lines').innerHTML = ''; addLine(); }
    previewNumber();
  });
  $('po-supplier').addEventListener('change', () => { if (!initializing) { invalidatePrices(); loadPartner().catch(error => show(error.message)); } });
  window.jQuery?.($('po-form')).on('select2:select.po select2:clear.po', '#po-supplier', () => $('po-supplier').dispatchEvent(new Event('change', { bubbles: true })));
  $('po-number-prefix').addEventListener('change', previewNumber);
  $('po-date').addEventListener('change', invalidatePrices); $('po-currency').addEventListener('change', () => { invalidatePrices(); updateSummary(); });
  $('po-form').addEventListener('submit', async event => {
    event.preventDefault();
    const rows = [...$('po-lines').querySelectorAll('[data-po-line]')];
    if (!linkedToPr && (!rows.length || rows.some(row => row._priceInvalid))) return show('Lengkapi item, harga, dan konversi UOM sebelum menyimpan.');
    const details = rows.map(linePayload);
    if (!linkedToPr && rows.some(row => row._legacyMaterialInvalid)) return show('Pilih ulang material dengan konversi KG yang valid.');
    if (!linkedToPr && details.some(d => d.materialCode && (d.uomCode !== 'KG' || !['COIL','SHEET'].includes(d.purchasePackageUomCode)))) return show('Material memakai UOM KG. Pilih bentuk Coil atau Sheet.');
    if (!linkedToPr && rows.some((row,i) => row.querySelector('[data-line-type]').value !== 'OTHER' && !details[i].productId && !details[i].materialCode && !details[i].partCode)) return show('Pilih item dari master terlebih dahulu.');
    const header = { poDate: $('po-date').value, deliveryDate: $('po-delivery-date').value, paymentTerms: $('po-payment-terms').value.trim() || null, notes: $('po-notes').value.trim() || null };
    if (!linkedToPr) Object.assign(header, { supplierCode: $('po-partner-kind').value === 'supplier' ? $('po-supplier').value : null, vendorCode: $('po-partner-kind').value === 'vendor' ? $('po-supplier').value : null, poType: $('po-type').value, poNumberPrefix: $('po-number-prefix').value, currencyCode: $('po-currency').value.trim(), subCategory: $('po-subcategory').value.trim().toUpperCase() || null });
    const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true;
    try {
      const po = await api(config.mode === 'edit' ? `/modules/api/purchasing-po/${encodeURIComponent(recordId)}` : '/modules/api/purchasing-po', { method: config.mode === 'edit' ? 'PATCH' : 'POST', body: JSON.stringify(linkedToPr ? { header } : { header, details }) });
      location.assign(`/modules/purchasing/purchase-order/${encodeURIComponent(po.poNumber)}`);
    } catch (error) { show(error.message); button.disabled = false; }
  });
  init().catch(error => show(error.message));
})();
