(function () {
  const LANGUAGE_KEY = "nexgen-ui-language";
  const THEME_KEY = "nexgen-ui-theme";
  const supportedLanguages = new Set(["id", "en", "ja"]);

  const messages = {
    "Pilih Modul": { en: "Select Module", ja: "モジュール選択" },
    "Semua Modul": { en: "All Modules", ja: "全モジュール" },
    "Master Data": { en: "Master Data", ja: "マスターデータ" },
    "Dashboard": { en: "Dashboard", ja: "ダッシュボード" },
    "Ringkasan": { en: "Overview", ja: "概要" },
    "Ringkasan Sistem": { en: "System Overview", ja: "システム概要" },
    "Ringkasan Status": { en: "Status Summary", ja: "ステータス概要" },
    "Status": { en: "Status", ja: "ステータス" },
    "Perbandingan": { en: "Comparison", ja: "比較" },
    "PERBANDINGAN": { en: "COMPARISON", ja: "比較" },
    "Rencana dan Aktual": { en: "Plan and Actual", ja: "計画と実績" },
    "Tahun": { en: "Year", ja: "年" },
    "12 bulan": { en: "12 months", ja: "12か月" },
    "Memuat": { en: "Loading", ja: "読込中" },
    "Memuat data...": { en: "Loading data...", ja: "データ読込中..." },
    "Memuat detail dokumen...": { en: "Loading document details...", ja: "伝票詳細を読込中..." },
    "Data grafik belum tersedia.": { en: "Chart data is not available.", ja: "グラフデータがありません。" },
    "Belum ada data": { en: "No data yet", ja: "データがありません" },
    "Data tidak ditemukan": { en: "No matching data", ja: "該当データがありません" },
    "Belum ada status.": { en: "No status information yet.", ja: "ステータス情報がありません。" },
    "Bahasa": { en: "Language", ja: "言語" },
    "Ganti tema": { en: "Change theme", ja: "テーマ切替" },
    "Tema terang": { en: "Light theme", ja: "ライトテーマ" },
    "Tema gelap": { en: "Dark theme", ja: "ダークテーマ" },
    "Keluar": { en: "Sign out", ja: "ログアウト" },
    "Pengguna": { en: "User", ja: "ユーザー" },
    "Cari": { en: "Search", ja: "検索" },
    "Cari data...": { en: "Search data...", ja: "データ検索..." },
    "Cari nomor, customer, atau status...": { en: "Search number, customer, or status...", ja: "番号・顧客・ステータスを検索..." },
    "Tambah Baru": { en: "Add New", ja: "新規追加" },
    "Simpan": { en: "Save", ja: "保存" },
    "Batal": { en: "Cancel", ja: "キャンセル" },
    "Hapus": { en: "Delete", ja: "削除" },
    "Edit": { en: "Edit", ja: "編集" },
    "Detail": { en: "Details", ja: "詳細" },
    "Lihat detail": { en: "View details", ja: "詳細を見る" },
    "Kembali": { en: "Back", ja: "戻る" },
    "Refresh": { en: "Refresh", ja: "更新" },
    "Export CSV": { en: "Export CSV", ja: "CSV出力" },
    "Sebelumnya": { en: "Previous", ja: "前へ" },
    "Berikutnya": { en: "Next", ja: "次へ" },
    "Aktif": { en: "Active", ja: "有効" },
    "Tidak Aktif": { en: "Inactive", ja: "無効" },
    "Tanggal": { en: "Date", ja: "日付" },
    "Nama": { en: "Name", ja: "名称" },
    "Deskripsi": { en: "Description", ja: "説明" },
    "Catatan": { en: "Notes", ja: "備考" },
    "Aksi": { en: "Action", ja: "操作" },
    "Jumlah": { en: "Quantity", ja: "数量" },
    "Harga": { en: "Price", ja: "価格" },
    "Total": { en: "Total", ja: "合計" },
    "Rencana": { en: "Plan", ja: "計画" },
    "Aktual": { en: "Actual", ja: "実績" },
    "Penjualan, produksi, pembelian, dan persediaan.": { en: "Sales, production, purchasing, and inventory.", ja: "販売・生産・購買・在庫。" },
    "Sales": { en: "Sales", ja: "販売" },
    "Production": { en: "Production", ja: "生産" },
    "Purchasing": { en: "Purchasing", ja: "購買" },
    "Inventory": { en: "Inventory", ja: "在庫" },
    "Incoming": { en: "Incoming", ja: "入荷" },
    "Outgoing": { en: "Outgoing", ja: "出荷" },
    "Planning PPIC": { en: "PPIC Planning", ja: "PPIC計画" },
    "Production Dashboard": { en: "Production Dashboard", ja: "生産ダッシュボード" },
    "Purchasing Dashboard": { en: "Purchasing Dashboard", ja: "購買ダッシュボード" },
    "Inventory Dashboard": { en: "Inventory Dashboard", ja: "在庫ダッシュボード" },
    "Incoming Dashboard": { en: "Incoming Dashboard", ja: "入荷ダッシュボード" },
    "Outgoing Dashboard": { en: "Outgoing Dashboard", ja: "出荷ダッシュボード" },
    "Production Report": { en: "Production Report", ja: "生産レポート" },
    "Purchasing Report": { en: "Purchasing Report", ja: "購買レポート" },
    "Inventory Report": { en: "Inventory Report", ja: "在庫レポート" },
    "Incoming Report": { en: "Incoming Report", ja: "入荷レポート" },
    "Outgoing Report": { en: "Outgoing Report", ja: "出荷レポート" },
    "Purchase Requisition": { en: "Purchase Requisition", ja: "購買依頼" },
    "Purchase Order": { en: "Purchase Order", ja: "発注書" },
    "Goods Receipt": { en: "Goods Receipt", ja: "入荷伝票" },
    "Stock Balances": { en: "Stock Balances", ja: "在庫残高" },
    "Stock Movements": { en: "Stock Movements", ja: "在庫移動" },
    "Stock Opname": { en: "Stock Count", ja: "棚卸" },
    "Delivery Orders": { en: "Delivery Orders", ja: "出荷指示" },
    "Delivery Schedules": { en: "Delivery Schedules", ja: "納入予定" },
    "Manufacturing Orders": { en: "Manufacturing Orders", ja: "製造指図" },
    "Production Entries": { en: "Production Entries", ja: "生産実績" },
    "Quality Inspections": { en: "Quality Inspections", ja: "品質検査" },
    "Logs": { en: "Logs", ja: "ログ" },
    "Maintenance": { en: "Maintenance", ja: "保全" },
    "Buka log aktivitas halaman": { en: "Open page activity log", ja: "ページ操作ログを開く" },
    "Buka alarm dan error halaman": { en: "Open page alarms and errors", ja: "ページの警告・エラーを開く" },
    "Buka komentar halaman": { en: "Open page comments", ja: "ページコメントを開く" }
  };

  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  const reverse = new Map();
  Object.entries(messages).forEach(([source, variants]) => {
    reverse.set(source, source);
    Object.values(variants).forEach((translated) => reverse.set(translated, source));
  });

  const currentLanguage = () => {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return supportedLanguages.has(stored) ? stored : "id";
  };

  function translate(value, language = currentLanguage()) {
    const source = reverse.get(String(value).trim()) || String(value).trim();
    if (language === "id") return source;
    return messages[source]?.[language] || source;
  }

  function translateTextNode(node, language) {
    const value = node.nodeValue;
    const trimmed = value.trim();
    if (!trimmed) return;
    const knownSource = textSources.get(node);
    const source = knownSource || reverse.get(trimmed);
    if (!source) return;
    textSources.set(node, source);
    const next = translate(source, language);
    const leading = value.match(/^\s*/)?.[0] || "";
    const trailing = value.match(/\s*$/)?.[0] || "";
    const translated = `${leading}${next}${trailing}`;
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }

  function translateAttributes(element, language) {
    const attributes = ["title", "aria-label", "placeholder"];
    let sources = attributeSources.get(element);
    if (!sources) {
      sources = {};
      attributeSources.set(element, sources);
    }
    attributes.forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const source = sources[attribute] || reverse.get(value.trim());
      if (!source) return;
      sources[attribute] = source;
      element.setAttribute(attribute, translate(source, language));
    });
  }

  function translateTree(root, language) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root, language);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE && ["SCRIPT", "STYLE", "CODE"].includes(root.tagName)) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root, language);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, language);
      else if (!["SCRIPT", "STYLE", "CODE"].includes(node.tagName)) translateAttributes(node, language);
      node = walker.nextNode();
    }
  }

  function applyLanguage(language, announce = true) {
    const selected = supportedLanguages.has(language) ? language : "id";
    localStorage.setItem(LANGUAGE_KEY, selected);
    document.documentElement.lang = selected;
    document.querySelectorAll("[data-ui-language]").forEach((select) => { select.value = selected; });
    translateTree(document.body, selected);
    if (announce) window.dispatchEvent(new CustomEvent("ui:languagechange", { detail: { language: selected } }));
  }

  function applyTheme(theme, announce = true) {
    const selected = theme === "dark" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, selected);
    document.documentElement.dataset.theme = selected;
    document.querySelectorAll("[data-ui-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-pressed", String(selected === "dark"));
      const label = selected === "dark" ? "Tema terang" : "Tema gelap";
      attributeSources.delete(button);
      button.setAttribute("title", translate(label));
      button.setAttribute("aria-label", translate(label));
    });
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", selected === "dark" ? "#111827" : "#4f46e5");
    if (announce) window.dispatchEvent(new CustomEvent("ui:themechange", { detail: { theme: selected } }));
  }

  window.UIPreferences = { translate, getLanguage: currentLanguage, applyLanguage, applyTheme };

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(localStorage.getItem(THEME_KEY), false);
    applyLanguage(currentLanguage(), false);

    document.addEventListener("change", (event) => {
      if (event.target.matches("[data-ui-language]")) applyLanguage(event.target.value);
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-ui-theme-toggle]")) {
        applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
      }
    });

    const observer = new MutationObserver((mutations) => {
      const language = currentLanguage();
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => translateTree(node, language)));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
