(function (root) {
  "use strict";
  const messages = {
    planningCalendar: ["KALENDER PERENCANAAN", "PLANNING CALENDAR", "計画カレンダー"],
    calendarHint: ["Buka baris untuk melihat sumber kebutuhan. Klik jumlah pada tanggal untuk meninjau rincian rencana.", "Expand a row to see demand sources. Select a dated quantity to review the plan.", "行を展開して需要元を確認します。日付ごとの数量を選択すると計画の詳細を表示します。"],
    deliveryCalendar: ["KALENDER DELIVERY", "DELIVERY CALENDAR", "納入カレンダー"],
    deliveryTable: ["Jadwal per customer & part", "Schedule by customer & part", "顧客・品目別の納入計画"],
    pageSize: ["Baris induk per halaman", "Parent rows per page", "ページあたりの親行数"],
    estimatedReady: ["Perkiraan FG siap dari slot proses","Estimated FG Ready from Process Slots","工程枠に基づくFG準備見込"],
    spareCalendar: ["Spare (hari kalender)","Spare (calendar days)","余裕（暦日）"],
    spareHelp: ["Selisih terhadap batas FG siap, dalam hari kalender. Ambang risiko hari kerja mengikuti kebijakan yang masih perlu ditetapkan.","Difference from the FG-ready deadline, in calendar days. The working-day risk threshold requires a planning policy.","FG準備期限との差を暦日で表示します。稼働日リスク基準は計画方針の設定が必要です。"],
    availableHours: ["Kapasitas tersedia (jam)","Available Capacity (hours)","利用可能能力（時間）"],
    requiredHours: ["Beban kerja (jam)","Workload (hours)","負荷（時間）"],
    materialImpact: ["Dampak tanggal dan jumlah material","Material Date and Quantity Impact","資材日付・数量への影響"],
    deliveryPeriod: ["Periode delivery","Delivery Period","納入期間"],
    deliveryFeasibility: ["Rincian kelayakan delivery","Delivery Feasibility Details","納入実現性の詳細"],
    pageGroups: ["Halaman {page}/{pages} · {count} kelompok","Page {page}/{pages} · {count} groups","{page}/{pages}ページ · {count}グループ"],
    proposalCurrent: ["Usulan mengikuti demand terbaru","Proposal reflects current demand","最新需要に基づく提案"],
    proposalLocked: ["Usulan dari baseline terkunci; perubahan tambahan mengikuti alur Delta MPS","Proposal from locked baseline; additional demand follows Delta MPS","固定基準計画の提案。追加需要はDelta MPSで処理します"],
    revision: ["Revisi","Revision","改訂"],
    incompleteSlots: ["Alokasi belum lengkap. Klik jumlah FG untuk meninjau kendala proses.","Allocations are incomplete. Click an FG quantity to review process constraints.","割当は未完了です。FG数量を選択して工程制約を確認してください。"],
    missingDates: ["Belum ada estimasi tanggal: {count} kebutuhan.","Estimated dates missing for {count} requirements.","{count}件の所要量の見積日が未設定です。"],
    sourcesCount: ["{count} sumber","{count} sources","{count}件の需要元"],
    stockAllocated: ["Stok dialokasikan","Allocated Stock","在庫割当"],
    timelySupply: ["Penerimaan tepat waktu","On-time Receipts","期限内入荷"],
    orderDeadline: ["Batas pemesanan","Order Deadline","発注期限"],
    procurement: ["Usulan pengadaan untuk material dan tanggal ini","Procurement Proposals for this Material and Date","この資材・必要日の調達提案"],
    processPart: ["Part / Proses","Part / Process","品目 / 工程"],
    minutes: ["menit","minutes","分"],
    proposalFailed: ["Usulan gagal dimuat","Proposal could not be loaded","提案を読み込めません"],
    capacity: ["Beban kapasitas","Capacity Load","能力負荷"],
    hours: ["Jam","Hours","時間"],
    delivered: ["Terkirim","Delivered","納入済"],
    remaining: ["Sisa delivery","Remaining Delivery","残納入数量"],
    fgReadyBy: ["Batas FG siap","FG Ready Deadline","FG準備期限"],
    shipment: ["Pengiriman","Shipment","出荷"],
    receivedAt: ["Tanggal diterima","Received Date","受領日"],
    source: ["Sumber","Source","需要元"],
    document: ["Dokumen","Document","伝票"],
    deliveryDate: ["Tanggal delivery","Delivery Date","納入日"],
    deliveryAllocationNote: ["Jumlah terkirim dialokasikan dari realisasi baris SO menurut urutan tanggal kebutuhan. Rincian pengiriman merupakan catatan baris SO dan tidak dijumlahkan ulang per tahap.","Delivered quantities are allocated from the SO line in due-date order. Shipment details are SO-line records and must not be summed again per phase.","納入済数量はSO明細から納期順に割り当てます。出荷詳細はSO明細の記録であり、段階ごとに再集計しません。"],
    materialProposal: ["Usulan kebutuhan material", "Material Requirements Proposal", "資材所要量提案"],
    proposal: ["Usulan produksi", "Production Proposal", "生産提案"], defaultMachine: ["Ikuti master routing", "Follow routing master", "工程マスタに従う"], comparison: ["Perbandingan simulasi", "Simulation Comparison", "シミュレーション比較"], before: ["Sebelumnya", "Before", "変更前"], after: ["Sesudahnya", "After", "変更後"], slots: ["Slot proses", "Process Slots", "工程枠"], comparisonHint: ["Rincian tanggal, mesin, dan material pada tabel menunjukkan hasil simulasi terbaru.", "Date, machine and material tables show the latest simulation.", "日付・設備・資材表は最新の結果です。"],
    dayView: ["Harian", "Daily", "日次"], weekView: ["Mingguan", "Weekly", "週次"], period: ["Periode", "Period", "期間"], timeSummary: ["Ringkasan waktu", "Time Summary", "時間集計"], unit: ["Satuan", "Unit", "単位"], groups: ["Kelompok", "Groups", "グループ"], refreshProposal: ["Muat Ulang Usulan", "Refresh Proposal", "提案を再読込"], materialOwner: ["Material / kepemilikan", "Material / Ownership", "資材 / 所有者"], auditDetail: ["Rincian MPS dan pemeriksaan lanjutan", "MPS Details and Further Checks", "MPS詳細と追加確認"], vendorPosition: ["Posisi proses vendor", "Vendor Process Position", "外注工程の状況"], sent: ["Dikirim", "Sent", "出荷済"], received: ["Diterima", "Received", "受入済"], accepted: ["Posisi lolos QC", "QC Accepted Position", "QC合格数量"], supplierPurchase: ["Pembelian supplier", "Supplier Purchase", "仕入先調達"],
    proposalSearch: ["Cari FG, material, mesin, atau sumber demand", "Search FG, material, machine or demand source", "FG・資材・設備・需要元を検索"], actualSearch: ["Cari mesin, part, atau proses", "Search machine, part or process", "設備・品目・工程を検索"], deliverySearch: ["Cari customer, part, atau nomor sumber", "Search customer, part or source number", "顧客・品目・元伝票番号を検索"],
    vendorExplanation: ["Jumlah diterima dan lolos QC merupakan posisi kumulatif per order; tidak dijumlahkan sebagai aktual harian.", "Received and QC accepted quantities are cumulative per order, separate from daily actuals.", "受入・QC合格数量は伝票ごとの累計で、日次実績とは分けて表示します。"],
    actualExplanation: ["Hasil baik dan NG berasal dari laporan produksi Approved. Kekurangan = target − hasil baik; NG tidak ditambahkan lagi. Posisi penerimaan vendor ditampilkan terpisah.", "Good output and NG come from approved production reports. Shortfall equals target minus good output. Vendor receipts are shown separately.", "良品とNGは承認済生産報告に基づきます。不足は目標から良品を引いて算出します。外注受入は別表示です。"],
    deliveryExplanation: ["Target delivery dari PO firm dan sisa Forecast. Buka customer untuk meninjau part, tanggal, dan sumber kebutuhan.", "Delivery targets come from firm orders and remaining Forecast. Expand a customer to review parts, dates and sources.", "納入目標は確定注文と残余予測に基づきます。顧客を展開すると品目・日付・需要元を確認できます。"],
    annual: ["Demand Tahunan", "Annual Demand", "年間需要"], actual: ["Pemantauan Aktual Produksi", "Production Actuals", "生産実績"], delivery: ["Jadwal Delivery Bulanan", "Monthly Delivery Schedule", "月間納入計画"], fg: ["Jadwal Produksi FG Bulanan", "Monthly FG Production Schedule", "月間FG生産計画"], material: ["Rencana Kebutuhan Material (MRP)", "Material Requirements Plan (MRP)", "資材所要量計画 (MRP)"], monthly: ["Rencana Produksi Bulanan", "Monthly Production Plan", "月間生産計画"], daily: ["Jadwal Produksi Harian", "Daily Production Schedule", "日次生産計画"],
    review: ["Peninjauan Rencana FG", "FG Plan Review", "FG計画確認"], quantity: ["Jumlah", "Quantity", "数量"], simulate: ["Simulasikan Penyesuaian", "Simulate Adjustment", "調整をシミュレーション"], confirm: ["Konfirmasi Rencana", "Confirm Plan", "計画確定"], cancel: ["Batal", "Cancel", "キャンセル"], close: ["Tutup", "Close", "閉じる"], loading: ["Sedang menghitung rencana…", "Calculating plan…", "計画を計算中…"], saving: ["Sedang menyimpan revisi…", "Saving revision…", "改訂を保存中…"], saved: ["Rencana bulanan dan MRP berhasil diperbarui pada revisi yang sama.", "Monthly plan and MRP updated in one revision.", "月間計画とMRPを同じ改訂で更新しました。"],
    process: ["Proses", "Process", "工程"], machine: ["Mesin / vendor", "Machine / vendor", "設備 / 外注先"], date: ["Tanggal", "Date", "日付"], required: ["Tanggal kebutuhan", "Required Date", "必要日"], gross: ["Kebutuhan kotor", "Gross Requirement", "総所要量"], net: ["Kebutuhan bersih", "Net Requirement", "正味所要量"], lots: ["Rencana lot", "Planned Lots", "計画ロット"], allocations: ["Alokasi sumber", "Source Allocations", "需要割当"], empty: ["Belum ada data", "No data yet", "データがありません"], unknown: ["Belum dapat dinilai", "Not Yet Assessed", "未評価"], risk: ["Berisiko", "At Risk", "リスクあり"], onTime: ["Sesuai Jadwal", "On Schedule", "予定通り"], late: ["Terlambat", "Late", "遅延"],
    safety: ["Jeda aman penjadwalan (hari)", "Scheduling Safety Gap (days)", "計画余裕日数"], safetyHelp: ["Nilai awal mengikuti mesin penjadwalan yang ada; bukan batas status risiko final.", "Default follows the existing scheduler; it is not the final risk threshold.", "初期値は既存スケジューラに従います。最終リスク基準ではありません。"], scope: ["Konfirmasi mencakup seluruh FG dalam MPS periode ini. Periksa dampak material dan jadwal sebelum menyimpan.", "Confirmation covers all FG in this period's MPS. Review materials and schedules before saving.", "確定は当月MPSの全FGを対象にします。資材と日程を確認してください。"], preview: ["Pratinjau — rencana aktif belum berubah", "Preview — active plan unchanged", "プレビュー — 確定計画は未変更"], reasons: ["Kendala dan alasan status", "Constraints and Status Reasons", "制約と状態の理由"], stock: ["Stok FG dialokasikan", "Allocated FG Stock", "FG在庫割当"], demand: ["Kebutuhan delivery", "Delivery Demand", "納入需要"], production: ["Tambahan produksi", "Additional Production", "追加生産"], noSlots: ["Slot produksi belum tersedia. Periksa kendala proses dan master kalender.", "Production slots unavailable. Review process and calendar constraints.", "生産枠がありません。工程とカレンダー制約を確認してください。"], detail: ["Rincian", "Details", "詳細"], refresh: ["Muat Ulang", "Refresh", "再読込"], search: ["Cari", "Search", "検索"], all: ["Semua", "All", "すべて"], summary: ["Ringkasan", "Summary", "概要"], export: ["Ekspor seluruh hasil filter", "Export all filtered results", "絞込結果を全件出力"], target: ["Target hasil baik", "Good Output Target", "良品目標"], good: ["Aktual hasil baik", "Actual Good Output", "良品実績"], shortfall: ["Kekurangan", "Shortfall", "不足"], page: ["Halaman", "Page", "ページ"], previous: ["Sebelumnya", "Previous", "前へ"], next: ["Berikutnya", "Next", "次へ"]
  };
  const language = () => root.localStorage?.getItem("nexgen-ui-language") || "id";
  const locale = () => ({ id: "id-ID", en: "en-US", ja: "ja-JP" })[language()] || "id-ID";
  const t = (key, params = {}) => (messages[key]?.[({ id: 0, en: 1, ja: 2 })[language()] ?? 0] || key).replace(/\{(\w+)\}/g, (match, name) => params[name] == null ? match : String(params[name]));
  function apply() { document.querySelectorAll("[data-ppic-i18n]").forEach(node => { node.textContent = t(node.dataset.ppicI18n); }); }
  root.PpicI18n = { t, locale, messages, apply };
  document.addEventListener("DOMContentLoaded", apply);
  root.addEventListener("ui:languagechange", apply);
}(window));
