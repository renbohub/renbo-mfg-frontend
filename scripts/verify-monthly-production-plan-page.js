const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(path.join(root, "src/routes/modules.js"), "utf8");
const view = fs.readFileSync(path.join(root, "views/ppic/monthly-production-plan.ejs"), "utf8");
const script = fs.readFileSync(path.join(root, "public/js/ppic-monthly-production-plan.js"), "utf8");
assert.match(view, /id="mpp-recommendation-generate"[^>]*>✦ Auto Allocation</,
  "Auto Allocation harus selalu terlihat meskipun scenario belum dibuat");
assert.match(script, /Qwen menganalisis…/);
const style = fs.readFileSync(path.join(root, "public/css/ppic-monthly-production-plan.css"), "utf8");

assert.match(route, /req\.query\.tab === "mpp"[^\n]+monthly-production-plans/, "tab MPP lama harus redirect ke halaman terpisah");
assert.match(route, /res\.render\("ppic\/monthly-production-plan"/, "Monthly Production Plan harus memakai view khusus");
assert.match(route, /ppic-monthly-production-plan\.js\?v=20260826-allocation-health-1/,
  "asset page harus memakai versi baru agar browser tidak menjalankan handler lama dari cache");
assert.match(view, /Capacity Overload/, "KPI capacity tidak boleh mencampur proposed allocation");
assert.match(view, /mpp-health-proposed-value/, "status proposed harus terpisah dari capacity overload");
assert.match(view, /mpp-health-material-value/, "status material hold harus terlihat terpisah");
assert.match(view, /mpp-health-cross-month-value/, "status allocation lintas bulan harus terlihat terpisah");
assert.match(route, /monthly-production-plans\/:key[^\n]+monthly-production-plans\?planNumber=/,
  "URL detail legacy harus diarahkan ke workspace Monthly Plan yang sama");
assert.match(script, /initializeMonthlyPlan[\s\S]*entryPlanNumber[\s\S]*planMonth/,
  "workspace harus mencari owner month ketika dibuka dari link planNumber");
assert.match(route, /monthly-plan\/matrix/, "frontend harus menyediakan proxy matrix bulanan");
assert.match(route, /monthly-plan\/matrix\/:month/, "matrix harus membawa bulan eksplisit pada path agar tidak jatuh ke bulan berjalan");
assert.match(route, /monthly-plan\/:key\/recommendations/, "frontend harus mem-proxy generate recommendation per Monthly Plan");
assert.match(route, /monthly-plan\/:key"/, "frontend harus menyediakan detail plan untuk command rail tanpa refresh halaman");
assert.match(route, /monthly-plan\/:key\/recommendations[^\n]+120000/,
  "generate recommendation harus memberi waktu cukup untuk fallback/runtime tanpa memutus backend pada 30 detik");
assert.match(route, /function isTimeout\(error\)/,
  "proxy harus membedakan timeout perhitungan dari backend yang benar-benar offline");
assert.match(route, /Perhitungan backend melewati batas waktu\. Backend tetap aktif/,
  "timeout tidak boleh lagi dilaporkan sebagai backend tidak aktif");
assert.match(route, /monthly-plan\/recommendations\/:scenarioId\/apply/, "frontend harus mem-proxy apply scenario ke Capacity Editor");
assert.match(view, /Monthly Production Plan/);
assert.match(view, /mpp-month-thead/);
assert.match(script, /data-toggle-row/, "Work Center harus collapsible");
assert.match(script, /BLOCKER/, "blocker capacity harus terlihat pada matrix");
assert.match(script, /maximumFractionDigits: 2/, "quantity harus maksimal dua digit desimal");
assert.match(script, /matrix\/\$\{encodeURIComponent\(month\)\}/, "request matrix harus mengirim bulan terpilih pada path");
assert.match(script, /Kalender Monthly Plan tidak sinkron/, "UI harus menolak response bulan yang berbeda");
assert.match(script, /child\.partNumber \|\| child\.partCode/, "baris child harus menampilkan Part Number");
assert.match(script, /Process \$\{esc\(processLabel\)\}/, "baris WIP harus menampilkan proses");
assert.match(script, /data-toggle-fg="FG_REQUIRED"/, "FG Required harus mempunyai collapse mandiri");
assert.match(script, /state\.data\.fgRequirements/, "FG Required harus memakai kebutuhan FG parent yang authoritative");
assert.match(script, /part\.days\[requirement\.fgRequiredDate\]/, "qty FG harus ditempatkan pada tanggal required");
assert.doesNotMatch(script, /data-process-parent/, "FG Required tidak boleh menjadi child Vendor atau proses");
assert.doesNotMatch(script, /FG Required \$\{esc\(fgRequiredLabel\)\}/, "FG Required tidak boleh ditempel pada identitas child WIP");
assert.match(style, /mpp-fg-group-row/, "FG Required harus memiliki tampilan induk sendiri");
assert.match(style, /position:sticky/, "header dan kolom Work Center harus sticky");
assert.match(style, /@media\(max-width:680px\)/, "halaman harus memiliki layout layar sempit");
assert.doesNotMatch(script, /\$\{capacityBadge\(row\)\}\$\{resourceChip\(row\)\}/,
  "Status capacity tidak boleh ditempel pada identitas Work Center");
assert.match(script, /mpp-cell-capacity/,
  "Status capacity harus dirender pada cell tanggal yang memiliki load");
assert.match(style, /\.mpp-cell-capacity\.safe/,
  "Cell capacity aman harus mempunyai indikator hijau yang eksplisit");
assert.match(style, /\.mpp-wc-row td\.mpp-load-safe/,
  "Warna capacity harian harus lebih spesifik daripada background baris Work Center");
for (const id of [
  "mpp-recommendation-generate",
  "mpp-recommendation-bar",
  "mpp-recommendation-apply-all",
  "mpp-recommendation-apply-selected",
  "mpp-recommendation-discard",
  "mpp-material-queue-dialog",
  "mpp-auto-allocation-dialog",
  "mpp-auto-allocation-form",
  "mpp-release-rail",
  "mpp-workflow-action",
  "mpp-workflow-dialog",
]) {
  assert.match(view, new RegExp(`id="${id}"`), `Monthly Plan harus menyediakan control ${id}`);
}
assert.match(view, /ppic-monthly-recommendation\.js/, "scenario model harus dimuat sebelum page orchestration");
assert.match(script, /generateRecommendation/, "page harus menyediakan generate scenario action");
assert.match(script, /runWorkflowAction/, "command rail harus menjalankan handoff resmi dengan AJAX");
assert.match(script, /PUBLISH_DPP/, "command rail harus menyediakan handoff Monthly Plan ke Daily Plan");
assert.match(script, /function startAutoAllocation\(\)\s*\{\s*openAutoAllocationDialog\(\)/,
  "tombol utama harus membuka popup sebelum menjalankan engine");
assert.match(script, /async function applyAutoAllocationMode[\s\S]*if \(!state\.recommendation\) await generateRecommendation\(\)/,
  "engine baru dijalankan setelah pengguna memilih cakupan Auto Allocation");
assert.match(script, /loadActiveRecommendation/, "scenario aktif harus dipulihkan saat plan dibuka ulang");
assert.match(script, /capacity-editor\/\$\{encodeURIComponent\(opened\.id\)\}/,
  "Mode Editor harus memuat kembali detail session OPEN setelah dibuka ulang");
assert.match(script, /hydrateStagedChanges\(persisted\.changes \|\| \[\]\)/,
  "draft allocation session OPEN harus kembali masuk canvas dan dropdown");
assert.match(script, /applyRecommendation/, "proposal terpilih harus dapat diterapkan ke Capacity Editor");
assert.match(script, /getAutoAllocationOptions/, "popup harus membandingkan cakupan semua vs task yang sudah ada");
assert.match(script, /projectedReadiness/, "hasil apply harus menampilkan gate FG covered dan remain allocation");
assert.match(script, /showModal\(\)/, "Auto Allocation harus meminta pilihan cakupan sebelum apply");
assert.match(style, /\.mpp-recommendation-overload/, "preview overload harus terlihat merah pada tanggal yang terdampak");
assert.match(style, /\.mpp-auto-option/, "pilihan Auto Allocation harus tampil sebagai option card yang mudah dibandingkan");
assert.match(script, /getPreviousStockRows/, "modal remaining allocation harus memakai kalkulasi tabel sumber stock");
assert.match(script, /mpp-stock-level-table/, "modal remaining allocation harus menampilkan tabel stock level sebelumnya");
assert.doesNotMatch(script, /<label>Stock level sebelumnya<input/,
  "field ringkasan stock lama tidak boleh tampil ganda setelah diganti tabel");
assert.match(style, /\.mpp-stock-level-scroll/, "tabel sumber stock harus dapat discroll pada layar sempit");
assert.match(style, /\.mpp-editor-dialog\.mpp-remaining-dialog/,
  "modal remaining allocation harus lebih lebar agar tabel tetap terbaca");
assert.match(script, /mpp-stock-previous-wip/,
  "WIP satu level sebelum FG harus ditandai sebagai child row pada tabel stock");
assert.match(script, /1 level sebelum FG/,
  "user harus dapat membedakan WIP predecessor dari direct input");
assert.match(style, /\.mpp-stock-level-table tr\.mpp-stock-previous-wip/,
  "child WIP harus mempunyai hierarchy treatment yang jelas");
assert.match(script, /function stockLevelTable\(/,
  "tabel stock harus menjadi renderer bersama untuk semua jalur editor");
assert.match(script, /data-allocation-stock=/,
  "modal Move\/Split harus menyediakan tabel stock per allocation yang dipilih");
assert.match(script, /syncAllocationStockTable/,
  "tabel stock Move\/Split harus mengikuti perubahan dropdown allocation");
assert.match(script, /Alokasi s\/d Target/,
  "header stock harus menjelaskan bahwa allocation pada hari target ikut dihitung");
assert.doesNotMatch(script, /<th>Alokasi Sebelum Target<\/th>/,
  "label lama tidak boleh menyembunyikan allocation pada hari yang sama");

console.log("Monthly Production Plan page contract passed.");
