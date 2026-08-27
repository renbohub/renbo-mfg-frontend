const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const failures = [];
let contracts = 0;

function requireText(relativePath, patterns) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${relativePath}: file belum tersedia`);
    contracts += patterns.length;
    return;
  }
  const source = fs.readFileSync(fullPath, "utf8");
  patterns.forEach(({ pattern, label }) => {
    contracts += 1;
    if (!pattern.test(source)) failures.push(`${relativePath}: ${label}`);
  });
}

requireText("views/partials/document-shell.ejs", [
  { pattern: /data-document-shell/, label: "landmark document shell belum tersedia" },
  { pattern: /transaction|master|planning/, label: "variant document belum didukung" },
  { pattern: /document-shell__actions/, label: "slot aksi belum tersedia" },
  { pattern: /document-shell__posting/, label: "posting rule belum tersedia" },
  { pattern: /aria-labelledby/, label: "header belum mempunyai accessible name" }
]);
requireText("views/partials/document-metadata.ejs", [
  { pattern: /document-metadata/, label: "metadata grid belum tersedia" },
  { pattern: /document-metadata__field--editable/, label: "state editable belum dibedakan" },
  { pattern: /aria-required|required/, label: "required metadata belum diekspos" }
]);
requireText("views/partials/document-lines.ejs", [
  { pattern: /document-lines/, label: "worksheet wrapper belum tersedia" },
  { pattern: /<caption/, label: "table caption belum tersedia" },
  { pattern: /data-document-lines-state/, label: "loading empty error state belum tersedia" }
]);
requireText("views/partials/document-notes.ejs", [
  { pattern: /document-notes/, label: "notes surface belum tersedia" }
]);
requireText("views/partials/document-comments.ejs", [
  { pattern: /recordKey/, label: "comments belum digating record key" },
  { pattern: /data-context-inline-comment-form/, label: "inline comment form belum terhubung" },
  { pattern: /showPending/, label: "pending discussion untuk halaman create belum tersedia" },
  { pattern: /Simpan dokumen untuk membuka diskusi/, label: "petunjuk komentar sebelum nomor dokumen terbentuk belum tersedia" }
]);
requireText("public/js/document-form-state.js", [
  { pattern: /beforeunload/, label: "dirty navigation warning belum tersedia" },
  { pattern: /aria-live/, label: "save state live region belum tersedia" },
  { pattern: /data-document-submit-lock/, label: "submit lock belum tersedia" },
  { pattern: /document-form:error/, label: "error unlock event belum tersedia" }
]);
requireText("public/js/shared-form-ux.js", [
  { pattern: /disableSectionNav/, label: "shared form belum menghormati halaman dengan alur dokumen khusus" }
]);
requireText("public/css/document-shell.css", [
  { pattern: /--document-ink/, label: "document design token belum tersedia" },
  { pattern: /document-shell--transaction/, label: "transaction variant belum distyle" },
  { pattern: /document-shell--master/, label: "master variant belum distyle" },
  { pattern: /document-shell--planning/, label: "planning variant belum distyle" },
  { pattern: /@media \(max-width: 640px\)/, label: "mobile breakpoint belum tersedia" },
  { pattern: /@media print/, label: "print rule belum tersedia" },
  { pattern: /document-shell__actions[\s\S]*vendor-receipt-post-button/, label: "legacy Vendor Receipt button belum dinormalkan di action slot" }
  ,{ pattern: /\.document-shell--planning\s*\{[^}]*grid-template-columns:\s*1fr/, label: "planning toolbar belum diberi baris penuh" }
]);
requireText("views/partials/head.ejs", [
  { pattern: /\/css\/document-shell\.css/, label: "document shell CSS belum dimuat" },
  { pattern: /\/css\/transaction-workspace\.css/, label: "transaction workspace CSS belum dimuat" }
]);
requireText("views/partials/footer.ejs", [
  { pattern: /\/js\/document-form-state\.js/, label: "document form state JS belum dimuat" }
]);
requireText("package.json", [
  { pattern: /"test:enterprise-lookup"/, label: "script lookup belum terdaftar" },
  { pattern: /"test:document-shell"/, label: "script document shell belum terdaftar" }
]);

requireText("views/incoming/vendor-receipt.ejs", [
  { pattern: /data-vendor-receipt-header/, label: "Vendor Receipt belum memakai header transaksi khusus" },
  { pattern: /vendor-receipt-unified-grid/, label: "metadata Vendor Receipt belum menyatu" },
  { pattern: /class="vendor-receipt-line-card vendor-receipt-data-workspace"/, label: "worksheet khusus Vendor Receipt belum tersedia" },
  { pattern: /class="vendor-receipt-receipt-notes"/, label: "notes khusus Vendor Receipt belum tersedia" },
  { pattern: /partials\/document-comments/, label: "Vendor Receipt belum memakai comments shared" },
  { pattern: /id="vendor-receipt-table" class="vendor-receipt-tabulator"/, label: "mount Tabulator Vendor Receipt berubah" }
]);
requireText("views/operations/detail.ejs", [
  { pattern: /goods-receipt-detail\.css/, label: "stylesheet detail Goods Receipt belum dimuat" },
  { pattern: /vendor\/tabulator\/css\/tabulator\.min\.css/, label: "stylesheet Tabulator Goods Receipt belum dimuat" },
  { pattern: /vendor\/tabulator\/js\/tabulator\.min\.js/, label: "script Tabulator Goods Receipt belum dimuat" },
  { pattern: /goods-receipt-detail-page/, label: "scope layout khusus Goods Receipt belum tersedia" },
  { pattern: /gr-detail-command-actions[\s\S]*id="ops-detail-status"[\s\S]*id="ops-workflow-actions"/, label: "status dan workflow Goods Receipt belum berada di command header" },
  { pattern: /gr-detail-metadata[\s\S]*id="ops-detail-fields"[\s\S]*id="ops-document-meta"/, label: "metadata dan audit Goods Receipt belum menyatu" },
  { pattern: /partials\/document-comments[\s\S]*Komentar \$\{page\.label\}/, label: "komentar transaksi belum berada di bawah workspace" }
]);
requireText("public/js/operations-detail.js", [
  { pattern: /isGoodsReceiptPage/, label: "renderer khusus Goods Receipt belum tersedia" },
  { pattern: /data-gr-tab-title="Receipt Items"/, label: "Receipt Items belum menjadi tab utama Goods Receipt" },
  { pattern: /new TabulatorClass/, label: "Receipt Items Goods Receipt belum memakai Tabulator" },
  { pattern: /initializeGoodsReceiptWorkspace/, label: "kartu pendukung Goods Receipt belum diubah menjadi tab" },
  { pattern: /data-enterprise-table="off"/, label: "tabel Goods Receipt belum keluar dari toolbar laporan" },
  { pattern: /initializeTransactionWorkspace/, label: "tab sekunder detail transaksi belum tersedia" },
  { pattern: /companionPattern[\s\S]*rekonsiliasi[\s\S]*alokasi/, label: "card pendukung langsung belum dikelompokkan dengan tabel utama" }
]);
requireText("public/css/transaction-workspace.css", [
  { pattern: /\.transaction-command-header/, label: "header transaksi bersama belum distyle" },
  { pattern: /background:\s*transparent\s*!important/, label: "header transaksi belum transparan" },
  { pattern: /\.transaction-detail-tabs-workspace/, label: "workspace tab detail belum distyle" },
  { pattern: /\.planning-shared-header/, label: "header planning khusus belum distyle tanpa mengubah body" },
  { pattern: /@media \(max-width: 760px\)/, label: "responsive transaction workspace belum tersedia" }
]);
requireText("public/css/goods-receipt-detail.css", [
  { pattern: /\.gr-detail-metadata[\s\S]*background:\s*transparent/, label: "metadata Goods Receipt belum transparan" },
  { pattern: /\.gr-detail-row-grip/, label: "grip baris worksheet Goods Receipt belum tersedia" },
  { pattern: /\.gr-detail-tabs-workspace/, label: "workspace tab Goods Receipt belum distyle" },
  { pattern: /\.vendor-receipt-discussion/, label: "komentar Goods Receipt belum mengikuti layout penerimaan" },
  { pattern: /@media \(max-width: 700px\)/, label: "breakpoint mobile Goods Receipt belum tersedia" }
]);
requireText("views/operations/supply-chain-form.ejs", [
  { pattern: /gr-create-command-header/, label: "header create Goods Receipt belum memakai layout transaksi" },
  { pattern: /gr-create-panel-items[\s\S]*gr-reconciliation/, label: "Rekonsiliasi PO harus tetap menyatu dengan Receipt Items" },
  { pattern: /gr-reconciliation[\s\S]*gr-create-notes/, label: "Receipt Notes harus berada setelah item dan rekonsiliasi" },
  { pattern: /Simpan Goods Receipt/, label: "aksi simpan create Goods Receipt belum berada di header" },
  { pattern: /gr-create-progress-slot/, label: "slot progress create Goods Receipt belum tersedia" },
  { pattern: /showPending:\s*true/, label: "diskusi create Goods Receipt belum mempunyai pending state" }
]);
[
  "views/production/shared-form.ejs",
  "views/production/schedule-form.ejs",
  "views/production/log-form.ejs",
  "views/purchasing/pr-form.ejs",
  "views/purchasing/po-form.ejs",
  "views/purchasing/invoice-form.ejs",
  "views/inventory/form.ejs"
].forEach((file) => requireText(file, [
  { pattern: /transaction-form-page/, label: "belum memakai style form transaksi bersama" },
  { pattern: /partials\/document-comments/, label: "belum mempunyai komentar dokumen" },
  { pattern: /variant:\s*'receipt'/, label: "komentar belum mengikuti layout Vendor Process" }
]));
[
  "views/ppic/yearly-demand.ejs",
  "views/ppic/mps-workbench.ejs",
  "views/ppic/mrp-planning-runs.ejs",
  "views/ppic/mrp-detail-simple.ejs",
  "views/ppic/monthly-demand-review.ejs",
  "views/ppic/demand-exception-workbench.ejs",
  "views/ppic/daily-production-plan.ejs",
  "views/ppic/execution-cockpit.ejs"
].forEach((file) => requireText(file, [
  { pattern: /planning-shared-header/, label: "header planning belum disamakan" },
  { pattern: /partials\/document-comments/, label: "planning page belum mempunyai komentar" }
]));
requireText("views/bom/processes.ejs", [
  { pattern: /partials\/document-shell/, label: "BOM processes belum memakai header bersama" },
  { pattern: /id="bom-process-rows"/, label: "routing table BOM tidak boleh berubah" },
  { pattern: /partials\/document-comments/, label: "BOM processes belum mempunyai komentar" }
]);
requireText("views/master-data/entity-form.ejs", [
  { pattern: /partials\/document-shell/, label: "generic Master form belum memakai master shell" },
  { pattern: /data-document-form/, label: "generic Master form belum memakai form-state shared" },
  { pattern: /data-enterprise-lookup/, label: "generic Master lookup belum strict" },
  { pattern: /mode === 'create'[\s\S]*recordKey/, label: "Create comment gate belum eksplisit" }
]);
requireText("views/master-data/entity-detail.ejs", [
  { pattern: /partials\/document-shell/, label: "generic Master detail belum memakai master shell" },
  { pattern: /partials\/document-comments/, label: "generic Master detail belum memakai comments shared" }
]);
requireText("views/ppic/monthly-production-plan.ejs", [
  { pattern: /partials\/document-shell/, label: "MPP belum memakai planning shell" },
  { pattern: /id="mpp-month-tbody"/, label: "matrix MPP tidak boleh dipindahkan" },
  { pattern: /id="mpp-month-dialog"/, label: "dialog detail MPP harus dipertahankan" },
  { pattern: /id="mpp-editor-queue"/, label: "editor MPP harus dipertahankan" }
]);
requireText("views/sales/form.ejs", [
  { pattern: /partials\/document-shell/, label: "Sales form belum memakai transaction shell" },
  { pattern: /data-document-form/, label: "Sales form belum memakai shared form state" },
  { pattern: /partials\/document-comments/, label: "Sales Edit belum mempunyai komentar dokumen" },
  { pattern: /id="items-body"/, label: "mount item Sales berubah" },
  { pattern: /sales-form-unified-header/, label: "metadata Sales create\/edit belum memakai header datar terpadu" },
  { pattern: /sales-form-unified-grid/, label: "metadata Sales create\/edit belum memakai grid empat kolom Vendor Incoming" },
  { pattern: /sales-form-flow/, label: "Sales create\/edit belum mempunyai flow strip" },
  { pattern: /data-disable-section-nav="true"/, label: "Sales create\/edit masih berisiko menampilkan navigasi lompat" },
  { pattern: /sales-form-workspace/, label: "item Sales create\/edit belum memakai workspace transaksi" },
  { pattern: /sales-form-notes[\s\S]*id="notes"/, label: "Catatan Sales belum menyatu di bawah item" },
  { pattern: /data-enterprise-links="off"/, label: "nilai form Sales masih berisiko menjadi link otomatis" }
]);
requireText("public/js/sales-form.js", [
  { pattern: /data-enterprise-lookup="payment-terms"/, label: "Payment Terms Sales belum menjadi lookup strict" },
  { pattern: /data-enterprise-lookup="currencies"/, label: "Currency Sales belum menjadi lookup strict" },
  { pattern: /data-local-select2/, label: "dropdown lokal Sales belum memakai Select2 strict" },
  { pattern: /partLookup=`data-local-select2/, label: "Part Sales belum memakai Select2 strict berbasis data form" },
  { pattern: /function customerParts\(\)[\s\S]*partMatchesCustomer/, label: "Part Sales Order belum difilter berdasarkan customer" },
  { pattern: /Part No - Part Name[\s\S]*Part Code[\s\S]*Delivery Target[\s\S]*Price\/UoM[\s\S]*Amount/, label: "kolom compact Sales Order belum sesuai format order line" },
  { pattern: /phase-forecast-reference/, label: "referensi qty Forecast bulanan pada Sales Order belum tersedia" },
  { pattern: /function loadForecastMonthReference\(tr\)/, label: "Forecast bulanan belum dimuat otomatis setelah Delivery Target dipilih" },
  { pattern: /monthlyTargets\.reduce\(\(sum,target\)=>sum\+Number\(target\.qty\|\|0\),0\)/, label: "qty Forecast per bulan belum dijumlahkan sebagai referensi" },
  { pattern: /deliveryTargets=\[\.\.\.tr\.querySelectorAll\('\.delivery-phase'\)\][\s\S]*qty:Number[\s\S]*\}\)\);if\(type==='forecast'\)/, label: "payload Sales Order masih bergantung pada pilihan Forecast manual" },
  { pattern: /function disposeLine\(tr\)[\s\S]*select2\('destroy'\)/, label: "hapus item Sales belum membersihkan popup lookup yang aktif" },
  { pattern: /class="remove-line"[^>]*data-confirm-delete="off"/, label: "hapus baris draft Sales masih terkena popup konfirmasi global" },
  { pattern: /Baris terakhir dikosongkan/, label: "hapus baris terakhir Sales belum memberikan respons yang jelas" },
  { pattern: /if\(type==='forecast'\)return'<tr><th>Part No - Part Name<\/th><th>Part Code<\/th><th>UoM<\/th><th>Qty<\/th><th>Delivery Target<\/th><th>Status<\/th>/, label: "kolom compact Forecast belum sesuai format receipt items" },
  { pattern: /function editorRows\(details=\[\]\)[\s\S]*flatMap[\s\S]*deliveryTargets:\[target\]/, label: "split delivery Forecast belum dipecah menjadi baris terpisah" },
  { pattern: /forecast-compact-form/, label: "Forecast create\/edit belum memakai style tabel compact" },
  { pattern: /Tax \(Rp\)[\s\S]*Total Include Tax/, label: "ringkasan pajak Sales Order belum tersedia" },
  { pattern: /dispatchEvent\(new Event\('change'/, label: "progress form Sales belum disegarkan setelah field dinamis selesai" }
]);
requireText("public/js/interaction-guard.js", [
  { pattern: /trigger\.closest\("\.interaction-confirm-backdrop"\)/, label: "tombol konfirmasi hapus masih dapat memicu popup hapus kedua" },
  { pattern: /if \(activeConfirmation\)/, label: "popup konfirmasi global belum mencegah dialog bertumpuk" },
  { pattern: /let closed = false[\s\S]*if \(closed\) return/, label: "popup konfirmasi global belum aman dari close ganda" },
  { pattern: /trigger\.dataset\.confirmPending === "true" \|\| activeConfirmation[\s\S]*stopImmediatePropagation\(\)[\s\S]*trigger\.dataset\.confirmPending = "true"/, label: "klik hapus berulang masih dapat mengantrikan tindakan ganda" }
]);
requireText("views/sales/detail.ejs", [
  { pattern: /partials\/document-shell/, label: "Sales detail belum memakai transaction shell" },
  { pattern: /partials\/document-comments/, label: "Sales detail belum mempunyai komentar dokumen" },
  { pattern: /id="forecast-demand-summary"/, label: "ringkasan Forecast vs Actual harus dipertahankan" },
  { pattern: /sales-record-overview/, label: "metadata Sales belum memakai overview transparan" },
  { pattern: /sales-detail-workspace/, label: "detail Sales belum memakai workspace tab" },
  { pattern: /data-sales-tab="planning"/, label: "Planning Chain Forecast belum dipisahkan sebagai tab" },
  { pattern: /sales-workspace-section--related/, label: "Forecast vs Actual belum ditempatkan bersama item utama" },
  { pattern: /data-enterprise-links="off"/, label: "nilai tanggal dan angka Forecast masih berisiko menjadi link otomatis" }
]);
[
  ["views/bom/editor.ejs", /id="bom-canvas-viewport"/, "canvas BOM"],
  ["views/bom/table-editor.ejs", /id="bom-detail-edit-table"/, "table editor BOM"],
  ["views/bom/detail.ejs", /id="bom-detail-rows"/, "tree BOM"]
].forEach(([file, bodyRoot, label]) => requireText(file, [
  { pattern: /partials\/document-shell/, label: `${label} belum memakai planning shell` },
  { pattern: bodyRoot, label: `${label} specialized body berubah` },
  { pattern: /partials\/document-comments/, label: `${label} belum mempunyai komentar dokumen` }
]));

if (failures.length) {
  console.error(`Document shell contract failed (${failures.length}/${contracts}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Document shell contracts passed: ${contracts}/${contracts}`);
