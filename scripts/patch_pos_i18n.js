const fs = require('fs');
const ts = require('typescript');

const posI18nCode = fs.readFileSync('client-pos/src/i18n/index.ts', 'utf-8');
const result = ts.transpileModule(posI18nCode, { compilerOptions: { module: ts.ModuleKind.CommonJS } });

const mockI18n = {
  default: {
    use: () => mockI18n.default,
    init: (opts) => { mockI18n.options = opts; }
  },
  use: () => mockI18n.default,
  init: (opts) => { mockI18n.options = opts; }
};

const mockModule = { exports: {} };
new Function('module', 'exports', 'require', result.outputText)(mockModule, mockModule.exports, () => mockI18n);

const resources = mockI18n.options.resources;

function setDeep(obj, path, value) {
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!curr[parts[i]] || typeof curr[parts[i]] !== 'object') {
      curr[parts[i]] = {};
    }
    curr = curr[parts[i]];
  }
  curr[parts[parts.length - 1]] = value;
}

const posTranslations = {
  id: {
    "pos.paymentMethod": "Pilih Metode Pembayaran",
    "pos.noOrdersFound": "Tidak ada pesanan ditemukan",
    "pos.pleaseSelectPrinter": "Silakan pilih printer",
    "pos.printerSetupSuccess": "Printer berhasil disetel ke",
    "pos.labelPrinterSetupSuccess": "Berhasil disetel sebagai printer label",
    "pos.cashDrawerOpened": "Laci kasir berhasil dibuka",
    "pos.cashDrawerFailed": "Gagal membuka laci kasir",
    "pos.testPrintSuccess": "Uji cetak berhasil dikirim",
    "pos.printFailed": "Gagal mencetak struk",
    "pos.testLabelSuccess": "Uji cetak label cup berhasil dikirim",
    "pos.labelPrintFailed": "Gagal mencetak label cup",
    "pos.expenseFailed": "Gagal mencatat pengeluaran",
    "pos.categories": "Kategori",
    "pos.products": "Produk",
    "pos.specs": "Varian/Ukuran",
    "pos.channel": "Saluran",
    "pos.setting": "Pengaturan",
    "diag_title": "🔧 Pusat Diagnostik",
    "diag_tab_overview": "Ringkasan",
    "diag_tab_logs": "Log Sistem",
    "diag_tab_network": "Jaringan & API",
    "diag_cloud_api": "API Cloud",
    "diag_local_network": "Jaringan Lokal",
    "diag_local_db": "Database Lokal",
    "diag_api_latency": "Latensi API",
    "diag_api_url": "Alamat API",
    "diag_sys_info": "Informasi Sistem",
    "diag_version": "Versi",
    "diag_error_count": "Jumlah Kesalahan",
    "diag_latest_error": "⚠️ Kesalahan Terakhir",
    "diag_recent_logs": "Log Terbaru",
    "diag_no_logs": "Tidak ada log",
    "diag_api_test": "🌐 Uji Koneksi API",
    "diag_reachable": "✅ Terhubung",
    "diag_unreachable": "❌ Tidak Terhubung",
    "diag_indexeddb_status": "💾 Status IndexedDB",
    "diag_db_ok": "✅ Normal",
    "diag_db_error": "❌ Kesalahan",
    "diag_db_unknown": "❓ Tidak Diketahui",
    "pos_no_printers": "Tidak ada printer yang terdeteksi",
    "setup.firstSetup": "Pengaturan Pertama",
    "setup.syncCloudHint": "Sinkronisasi produk, kategori, dan pengaturan dari cloud",
    "auth.attendanceQrAlt": "QR Code Absensi",
    "auth.connectionFailed": "Koneksi gagal. Periksa jaringan Anda.",
    "auth.connectCloudTitle": "Hubungkan ke Cloud",
    "auth.connectCloudHint": "Masukkan nomor telepon dan kata sandi akun toko Anda",
    "auth.phoneExample": "Contoh: 08123456789",
    "common.password": "Kata Sandi",
    "auth.connecting": "Menghubungkan...",
    "auth.connectAndSync": "Hubungkan & Sinkronisasi",
    "auth.offlineModeNote": "Setelah sinkronisasi awal, POS dapat beroperasi secara offline",
    "auth.syncingData": "Menyinkronkan Data Toko",
    "auth.pullingFromCloud": "Mengambil produk, kategori, dan konfigurasi dari server cloud...",
    "auth.keepNetwork": "Harap pertahankan koneksi internet stabil",
    "auth.syncComplete": "Sinkronisasi Selesai!",
    "auth.store": "Toko",
    "auth.syncedData": "Data Berhasil Disinkronkan",
    "auth.startUsing": "Mulai Menggunakan POS",
    "customer_welcome": "Selamat Datang",
    "customerDisplay.payAtCounter": "Silakan bayar di kasir",
    "settings.selectChannel": "Pilih Saluran Penjualan",
    "settings.selectChannelHint": "Pilih saluran saat ini untuk pesanan",
    "settings.confirmChannel": "Konfirmasi Saluran"
  },
  en: {
    "pos.paymentMethod": "Select Payment Method",
    "pos.noOrdersFound": "No orders found",
    "pos.pleaseSelectPrinter": "Please select a printer",
    "pos.printerSetupSuccess": "Printer set successfully to",
    "pos.labelPrinterSetupSuccess": "Successfully set as label printer",
    "pos.cashDrawerOpened": "Cash drawer opened successfully",
    "pos.cashDrawerFailed": "Failed to open cash drawer",
    "pos.testPrintSuccess": "Test print sent successfully",
    "pos.printFailed": "Failed to print receipt",
    "pos.testLabelSuccess": "Test label print sent successfully",
    "pos.labelPrintFailed": "Failed to print cup label",
    "pos.expenseFailed": "Failed to record expense",
    "pos.categories": "Categories",
    "pos.products": "Products",
    "pos.specs": "Specs/Sizes",
    "pos.channel": "Channel",
    "pos.setting": "Settings",
    "diag_title": "🔧 Diagnostic Center",
    "diag_tab_overview": "Overview",
    "diag_tab_logs": "System Logs",
    "diag_tab_network": "Network & API",
    "diag_cloud_api": "Cloud API",
    "diag_local_network": "Local Network",
    "diag_local_db": "Local Database",
    "diag_api_latency": "API Latency",
    "diag_api_url": "API URL",
    "diag_sys_info": "System Info",
    "diag_version": "Version",
    "diag_error_count": "Error Count",
    "diag_latest_error": "⚠️ Latest Error",
    "diag_recent_logs": "Recent Logs",
    "diag_no_logs": "No logs",
    "diag_api_test": "🌐 API Connection Test",
    "diag_reachable": "✅ Reachable",
    "diag_unreachable": "❌ Unreachable",
    "diag_indexeddb_status": "💾 IndexedDB Status",
    "diag_db_ok": "✅ OK",
    "diag_db_error": "❌ Error",
    "diag_db_unknown": "❓ Unknown",
    "pos_no_printers": "No available printers detected",
    "setup.firstSetup": "First Setup",
    "setup.syncCloudHint": "Sync products, categories and settings from cloud",
    "auth.attendanceQrAlt": "Attendance QR Code",
    "auth.connectionFailed": "Connection failed. Please check your network.",
    "auth.connectCloudTitle": "Connect to Cloud",
    "auth.connectCloudHint": "Enter your store phone number and password",
    "auth.phoneExample": "e.g. 08123456789",
    "common.password": "Password",
    "auth.connecting": "Connecting...",
    "auth.connectAndSync": "Connect & Sync",
    "auth.offlineModeNote": "After initial sync, POS can operate fully offline",
    "auth.syncingData": "Syncing Store Data",
    "auth.pullingFromCloud": "Pulling products, categories and configuration from cloud...",
    "auth.keepNetwork": "Please keep internet connection stable",
    "auth.syncComplete": "Sync Complete!",
    "auth.store": "Store",
    "auth.syncedData": "Data Successfully Synced",
    "auth.startUsing": "Start Using POS",
    "customer_welcome": "Welcome",
    "customerDisplay.payAtCounter": "Please pay at counter",
    "settings.selectChannel": "Select Sales Channel",
    "settings.selectChannelHint": "Select current channel for orders",
    "settings.confirmChannel": "Confirm Channel"
  },
  zh: {
    "pos.paymentMethod": "选择收款渠道",
    "pos.noOrdersFound": "未找到相关订单",
    "pos.pleaseSelectPrinter": "请选择或输入打印机名称",
    "pos.printerSetupSuccess": "打印机已成功设置为",
    "pos.labelPrinterSetupSuccess": "已成功设为标签打印机",
    "pos.cashDrawerOpened": "钱箱已弹开",
    "pos.cashDrawerFailed": "钱箱打开失败",
    "pos.testPrintSuccess": "测试打印已发送",
    "pos.printFailed": "打印失败",
    "pos.testLabelSuccess": "杯贴测试打印已发送",
    "pos.labelPrintFailed": "杯贴打印失败",
    "pos.expenseFailed": "记录支出失败",
    "pos.categories": "分类",
    "pos.products": "产品",
    "pos.specs": "规格",
    "pos.channel": "渠道",
    "pos.setting": "设置",
    "diag_title": "🔧 诊断中心",
    "diag_tab_overview": "概览",
    "diag_tab_logs": "系统日志",
    "diag_tab_network": "网络与API",
    "diag_cloud_api": "云端 API",
    "diag_local_network": "局域网",
    "diag_local_db": "本地数据库",
    "diag_api_latency": "API 延迟",
    "diag_api_url": "API 地址",
    "diag_sys_info": "系统信息",
    "diag_version": "版本",
    "diag_error_count": "错误计数",
    "diag_latest_error": "⚠️ 最新错误",
    "diag_recent_logs": "最近日志",
    "diag_no_logs": "暂无日志",
    "diag_api_test": "🌐 API 连接测试",
    "diag_reachable": "✅ 正常连通",
    "diag_unreachable": "❌ 无法连通",
    "diag_indexeddb_status": "💾 IndexedDB 状态",
    "diag_db_ok": "✅ 正常",
    "diag_db_error": "❌ 错误",
    "diag_db_unknown": "❓ 未知",
    "pos_no_printers": "未检测到可用打印机",
    "setup.firstSetup": "首次设置",
    "setup.syncCloudHint": "从云端同步产品、分类和配置",
    "auth.attendanceQrAlt": "考勤二维码",
    "auth.connectionFailed": "连接失败，请检查网络。",
    "auth.connectCloudTitle": "连接到云端",
    "auth.connectCloudHint": "输入店铺手机号及密码",
    "auth.phoneExample": "例如：08123456789",
    "common.password": "密码",
    "auth.connecting": "连接中...",
    "auth.connectAndSync": "连接并同步",
    "auth.offlineModeNote": "完成首次同步后，POS 即可支持离线运行",
    "auth.syncingData": "正在同步门店数据",
    "auth.pullingFromCloud": "正在从云端拉取商品、分类与配置...",
    "auth.keepNetwork": "请保持网络连接稳定",
    "auth.syncComplete": "同步完成！",
    "auth.store": "门店",
    "auth.syncedData": "已同步数据",
    "auth.startUsing": "开始使用 POS",
    "customer_welcome": "欢迎光临",
    "customerDisplay.payAtCounter": "请在柜台付款",
    "settings.selectChannel": "选择销售渠道",
    "settings.selectChannelHint": "为当前订单选择渠道",
    "settings.confirmChannel": "确认渠道"
  }
};

for (const lang of ['id', 'en', 'zh']) {
  for (const [k, v] of Object.entries(posTranslations[lang])) {
    setDeep(resources[lang].translation, k, v);
  }
}

const newFileContent = `import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = ${JSON.stringify(resources, null, 2)}

const getInitialLanguage = () => {
  try {
    const stored = localStorage.getItem('pos_language')
    if (stored && ['id', 'en', 'zh'].includes(stored)) {
      return stored
    }
  } catch (e) {
    // ignore
  }
  return 'id'
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
`;

fs.writeFileSync('client-pos/src/i18n/index.ts', newFileContent, 'utf-8');
console.log("Successfully patched client-pos/src/i18n/index.ts!");
