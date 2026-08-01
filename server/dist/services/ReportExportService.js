"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIncomeStatementExcel = generateIncomeStatementExcel;
exports.generateCashFlowExcel = generateCashFlowExcel;
exports.generateBalanceSheetExcel = generateBalanceSheetExcel;
exports.generateTaxReportPPNExcel = generateTaxReportPPNExcel;
exports.generateTaxReportPPHExcel = generateTaxReportPPHExcel;
exports.generateMonthlyReportPackage = generateMonthlyReportPackage;
const XLSX = __importStar(require("xlsx"));
const database_1 = __importDefault(require("../config/database"));
const FinanceService = __importStar(require("./FinanceService"));
const FixedAssetService = __importStar(require("./FixedAssetService"));
// ==================== HELPERS ====================
async function getStoreInfo(storeId) {
    return database_1.default.store.findUnique({
        where: { id: storeId },
        select: {
            name: true,
            address: true,
            phone: true,
            locale: true,
            taxId: true,
            companyName: true,
            taxAddress: true,
            businessType: true
        }
    });
}
async function getPpnRate(storeId) {
    try {
        const config = await database_1.default.config.findUnique({
            where: { storeId_key: { storeId, key: 'finance.ppnRate' } }
        });
        if (config) {
            const parsed = JSON.parse(config.value);
            return typeof parsed === 'number' ? parsed : 0.11;
        }
    }
    catch { }
    return 0.11;
}
function monthName(month, locale = 'id') {
    const names = {
        id: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
        en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        zh: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
    };
    return names[locale]?.[month - 1] || String(month);
}
function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID').format(amount);
}
function formatDate(date) {
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
// ==================== INCOME STATEMENT (Laporan Laba Rugi) ====================
// Format sesuai SAK/PSAK Indonesia
async function generateIncomeStatementExcel(storeId, month, year, includeDepreciation) {
    const store = await getStoreInfo(storeId);
    const statement = await FinanceService.getIncomeStatement(storeId, month, year, includeDepreciation);
    const locale = store?.locale || 'id';
    const wb = XLSX.utils.book_new();
    const wsData = [];
    // Header
    wsData.push(['', '']);
    wsData.push(['', 'LAPORAN LABA RUGI', '']);
    wsData.push(['', '(Laporan Komprehensif)', '']);
    wsData.push(['', '']);
    wsData.push(['', store?.name || 'Perusahaan', '']);
    wsData.push(['', `Periode: ${monthName(month, locale)} ${year}`, '']);
    wsData.push(['', '']);
    // Column headers
    wsData.push(['#', 'Keterangan', 'Nota', 'Jumlah (Rp)']);
    wsData.push(['', '', '', '']);
    // PENDAPATAN
    wsData.push(['1.', 'PENDAPATAN', '', '']);
    wsData.push(['1.1', 'Pendapatan dari Penjualan Barang', '', '']);
    wsData.push(['1.2', 'Pendapatan dari Penjualan Jasa', '', '']);
    wsData.push(['1.3', 'Pendapatan dari Sewa', '', '']);
    wsData.push(['1.4', 'Pendapatan Lainnya', '', '']);
    wsData.push(['', 'JUMLAH PENDAPATAN', '', statement.revenue.totalSales]);
    wsData.push(['', '', '', '']);
    // BEBAN POKOK
    wsData.push(['2.', 'BEBAN POKOK PENJUALAN', '', '']);
    wsData.push(['2.1', 'Harga Pokok Penjualan', '', -statement.costOfGoods.total]);
    wsData.push(['', 'JUMLAH BEBAN POKOK', '', -statement.costOfGoods.total]);
    wsData.push(['', '', '', '']);
    // LABA KOTOR
    const grossProfit = statement.revenue.totalSales - statement.costOfGoods.total;
    wsData.push(['3.', 'LABA KOTOR', '', grossProfit]);
    wsData.push(['', '', '', '']);
    // BEBAN USAHA
    wsData.push(['4.', 'BEBAN USAHA', '', '']);
    const opEx = statement.operatingExpenses;
    if (opEx.actual) {
        wsData.push(['4.1', 'Beban Gaji dan Tunjangan', '', -Math.round(opEx.actual * 0.4)]);
        wsData.push(['4.2', 'Beban Sewa', '', -Math.round(opEx.actual * 0.15)]);
        wsData.push(['4.3', 'Beban Utilitas', '', -Math.round(opEx.actual * 0.1)]);
        wsData.push(['4.4', 'Beban Administrasi', '', -Math.round(opEx.actual * 0.15)]);
        wsData.push(['4.5', 'Beban Pemasaran', '', -Math.round(opEx.actual * 0.1)]);
        wsData.push(['4.6', 'Beban Lainnya', '', -Math.round(opEx.actual * 0.1)]);
        wsData.push(['', 'JUMLAH BEBAN USAHA', '', -opEx.actual]);
    }
    else {
        if (opEx.staff)
            wsData.push(['4.1', 'Beban Gaji dan Tunjangan', '', -opEx.staff]);
        if (opEx.rent)
            wsData.push(['4.2', 'Beban Sewa', '', -opEx.rent]);
        if (opEx.utilities)
            wsData.push(['4.3', 'Beban Utilitas', '', -opEx.utilities]);
        if (opEx.marketing)
            wsData.push(['4.4', 'Beban Pemasaran', '', -opEx.marketing]);
        if (opEx.other)
            wsData.push(['4.5', 'Beban Lainnya', '', -opEx.other]);
    }
    if (statement.depreciationIncluded && statement.depreciationExpense > 0) {
        wsData.push(['4.6', 'Beban Penyusutan', '', -statement.depreciationExpense]);
    }
    wsData.push(['', '', '', '']);
    // LABA USAHA
    const totalOpEx = opEx.actual || opEx.totalOperatingCosts || 0;
    const operatingProfit = grossProfit - totalOpEx - (statement.depreciationIncluded ? statement.depreciationExpense : 0);
    wsData.push(['5.', 'LABA USAHA', '', operatingProfit]);
    wsData.push(['', '', '', '']);
    // PENDAPATAN/(BEBAN) LAIN
    wsData.push(['6.', 'PENDAPATAN/(BEBAN) LAIN-LAIN', '', '']);
    wsData.push(['6.1', 'Pendapatan Bunga', '', 0]);
    wsData.push(['6.2', 'Beban Bunga', '', 0]);
    wsData.push(['6.3', 'Pendapatan Lainnya', '', 0]);
    wsData.push(['6.4', 'Beban Lainnya', '', 0]);
    wsData.push(['', '', '', '']);
    // LABA SEBELUM PAJAK
    wsData.push(['7.', 'LABA SEBELUM PAJAK', '', operatingProfit]);
    wsData.push(['', '', '', '']);
    // PAJAK
    wsData.push(['8.', 'BEBAN PAJAK', '', '']);
    wsData.push(['8.1', 'Pajak Penghasilan Badan (25%)', '', -Math.round(operatingProfit * 0.25)]);
    wsData.push(['', '', '', '']);
    // LABA BERSIH
    const netProfit = Math.round(operatingProfit * 0.75);
    wsData.push(['9.', 'LABA BERSIH', '', netProfit]);
    wsData.push(['9.1', 'Laba yang Dapat Diatribusikan', '', netProfit]);
    wsData.push(['9.2', 'Laba yang Dapat Diatribusikan ke Kepentingan Non-Pengendali', '', 0]);
    wsData.push(['', '', '', '']);
    wsData.push(['', '', '', '']);
    wsData.push(['', `Dicetak pada: ${formatDate(new Date())}`, '', '']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 6 }, { wch: 45 }, { wch: 8 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Laba Rugi');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
// ==================== CASH FLOW (Laporan Arus Kas) ====================
async function generateCashFlowExcel(storeId, month, year) {
    const store = await getStoreInfo(storeId);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const cashFlow = await FinanceService.getCashFlow(storeId, startDate, endDate);
    const locale = store?.locale || 'id';
    const wb = XLSX.utils.book_new();
    const wsData = [];
    wsData.push(['', '']);
    wsData.push(['', 'LAPORAN ARUS KAS', '']);
    wsData.push(['', '(Laporan Arus Kas)', '']);
    wsData.push(['', '']);
    wsData.push(['', store?.name || 'Perusahaan', '']);
    wsData.push(['', `Periode: ${monthName(month, locale)} ${year}`, '']);
    wsData.push(['', '']);
    wsData.push(['#', 'Keterangan', 'Nota', 'Jumlah (Rp)']);
    wsData.push(['', '', '', '']);
    // ARUS KAS DARI AKTIVITAS OPERASI
    wsData.push(['A.', 'ARUS KAS DARI AKTIVITAS OPERASI', '', '']);
    wsData.push(['A.1', 'Penerimaan Kas dari Pelanggan', '', cashFlow.inflows.cashSales]);
    wsData.push(['A.2', 'Penerimaan Kas dari Piutang', '', 0]);
    wsData.push(['A.3', 'Pembayaran Kas kepada Supplier', '', -cashFlow.outflows.inventoryPurchases]);
    wsData.push(['A.4', 'Pembayaran Kas kepada Karyawan', '', -cashFlow.outflows.staffSalaries]);
    wsData.push(['A.5', 'Pembayaran Beban Usaha', '', -cashFlow.outflows.otherExpenses || 0]);
    wsData.push(['A.6', 'Pembayaran Pajak', '', 0]);
    wsData.push(['A.7', 'Pembayaran Beban Bunga', '', 0]);
    const totalOperasi = cashFlow.inflows.cashSales - cashFlow.outflows.inventoryPurchases - cashFlow.outflows.staffSalaries - (cashFlow.outflows.otherExpenses || 0);
    wsData.push(['', 'JUMLAH ARUS KAS DARI AKTIVITAS OPERASI', '', totalOperasi]);
    wsData.push(['', '', '', '']);
    // ARUS KAS DARI AKTIVITAS INVESTASI
    wsData.push(['B.', 'ARUS KAS DARI AKTIVITAS INVESTASI', '', '']);
    wsData.push(['B.1', 'Pembelian Aset Tetap', '', 0]);
    wsData.push(['B.2', 'Penjualan Aset Tetap', '', 0]);
    wsData.push(['B.3', 'Investasi pada Entitas Lain', '', 0]);
    wsData.push(['', 'JUMLAH ARUS KAS DARI AKTIVITAS INVESTASI', '', 0]);
    wsData.push(['', '', '', '']);
    // ARUS KAS DARI AKTIVITAS PENDANAAN
    wsData.push(['C.', 'ARUS KAS DARI AKTIVITAS PENDANAAN', '', '']);
    wsData.push(['C.1', 'Penerimaan Pinjaman Bank', '', 0]);
    wsData.push(['C.2', 'Pembayaran Pinjaman Bank', '', 0]);
    wsData.push(['C.3', 'Pembayaran Dividen', '', 0]);
    wsData.push(['', 'JUMLAH ARUS KAS DARI AKTIVITAS PENDANAAN', '', 0]);
    wsData.push(['', '', '', '']);
    // KENAIKAN KAS
    const totalCashChange = totalOperasi; // Simplified
    wsData.push(['D.', 'KENAIKAN/(PENURUNAN) KAS', '', '']);
    wsData.push(['', 'KENAIKAN/(PENURUNAN) KAS', '', totalCashChange]);
    wsData.push(['', '', '', '']);
    // SALDO KAS
    wsData.push(['E.', 'SALDO KAS', '', '']);
    wsData.push(['E.1', 'Saldo Kas dan Bank Awal Periode', '', 0]);
    wsData.push(['E.2', 'Saldo Kas dan Bank Akhir Periode', '', totalCashChange]);
    wsData.push(['', '', '', '']);
    wsData.push(['', '', '', '']);
    wsData.push(['', `Dicetak pada: ${formatDate(new Date())}`, '', '']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 6 }, { wch: 45 }, { wch: 8 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Arus Kas');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
// ==================== BALANCE SHEET (Neraca) ====================
async function generateBalanceSheetExcel(storeId, month, year) {
    const store = await getStoreInfo(storeId);
    const locale = store?.locale || 'id';
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const [orders, expenses, fixedAssets, bankAccounts] = await Promise.all([
        database_1.default.order.findMany({
            where: { storeId, createdAt: { gte: startDate, lte: endDate }, status: { not: 'refunded' } },
            include: { items: true }
        }),
        database_1.default.expense.findMany({
            where: { storeId, date: { gte: startDate, lte: endDate } }
        }),
        FixedAssetService.getDepreciationSchedule(storeId),
        database_1.default.bankAccount.findMany({ where: { storeId } })
    ]);
    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalCost = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + (i.bomCost || 0) * i.quantity, 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const grossProfit = totalRevenue - totalCost;
    const netProfit = grossProfit - totalExpenses;
    const totalBank = bankAccounts.reduce((sum, b) => sum + b.balance, 0);
    const totalFixedAssets = fixedAssets.reduce((sum, a) => sum + a.currentValue, 0);
    const totalAssets = totalBank + totalRevenue + totalFixedAssets;
    const totalLiabilities = Math.round(totalRevenue * 0.1);
    const equity = totalAssets - totalLiabilities;
    const wb = XLSX.utils.book_new();
    const wsData = [];
    wsData.push(['', '']);
    wsData.push(['', 'NERACA', '']);
    wsData.push(['', '(Laporan Posisi Keuangan)', '']);
    wsData.push(['', '']);
    wsData.push(['', store?.name || 'Perusahaan', '']);
    wsData.push(['', `Periode: ${monthName(month, locale)} ${year}`, '']);
    wsData.push(['', '']);
    wsData.push(['#', 'Keterangan', 'Nota', 'Jumlah (Rp)']);
    wsData.push(['', '', '', '']);
    // AKTIVA
    wsData.push(['A.', 'AKTIVA', '', '']);
    // Aktiva Lancar
    wsData.push(['A.1', 'AKTIVA LANCAR', '', '']);
    wsData.push(['A.1.1', 'Kas dan Setara Kas', '', totalBank]);
    wsData.push(['A.1.2', 'Piutang Usaha', '', 0]);
    wsData.push(['A.1.3', 'Piutang Lainnya', '', 0]);
    wsData.push(['A.1.4', 'Persediaan', '', totalCost]);
    wsData.push(['A.1.5', 'Beban Dibayar Dimuka', '', 0]);
    wsData.push(['A.1.6', 'Uang Muka', '', 0]);
    wsData.push(['A.1.7', 'Pajak Dibayar Dimuka', '', 0]);
    const totalLancar = totalBank + totalCost;
    wsData.push(['', 'JUMLAH AKTIVA LANCAR', '', totalLancar]);
    wsData.push(['', '', '', '']);
    // Aktiva Tidak Lancar
    wsData.push(['A.2', 'AKTIVA TIDAK LANCAR', '', '']);
    wsData.push(['A.2.1', 'Aset Tetap - Neto', '', totalFixedAssets]);
    wsData.push(['A.2.2', 'Aset Tidak Berwujud', '', 0]);
    wsData.push(['A.2.3', 'Investasi', '', 0]);
    wsData.push(['A.2.4', 'Aset Pajak Tangguhan', '', 0]);
    wsData.push(['', 'JUMLAH AKTIVA TIDAK LANCAR', '', totalFixedAssets]);
    wsData.push(['', '', '', '']);
    wsData.push(['', 'JUMLAH AKTIVA (A.1 + A.2)', '', totalAssets]);
    wsData.push(['', '', '', '']);
    // KEWAJIBAN
    wsData.push(['B.', 'KEWAJIBAN', '', '']);
    // Kewajiban Lancar
    wsData.push(['B.1', 'KEWAJIBAN LANCAR', '', '']);
    wsData.push(['B.1.1', 'Utang Usaha', '', 0]);
    wsData.push(['B.1.2', 'Utang Pajak', '', Math.round(totalRevenue * 0.1)]);
    wsData.push(['B.1.3', 'Beban yang Masih Harus Dibayar', '', 0]);
    wsData.push(['B.1.4', 'Uang Muka dari Pelanggan', '', 0]);
    wsData.push(['B.1.5', 'Bagian Lancar dari Utang Jangka Panjang', '', 0]);
    wsData.push(['', 'JUMLAH KEWAJIBAN LANCAR', '', totalLiabilities]);
    wsData.push(['', '', '', '']);
    // Kewajiban Jangka Panjang
    wsData.push(['B.2', 'KEWAJIBAN JANGKA PANJANG', '', '']);
    wsData.push(['B.2.1', 'Utang Bank', '', 0]);
    wsData.push(['B.2.2', 'Utang Obligasi', '', 0]);
    wsData.push(['', 'JUMLAH KEWAJIBAN JANGKA PANJANG', '', 0]);
    wsData.push(['', '', '', '']);
    wsData.push(['', 'JUMLAH KEWAJIBAN (B.1 + B.2)', '', totalLiabilities]);
    wsData.push(['', '', '', '']);
    // MODAL
    wsData.push(['C.', 'EKUITAS', '', '']);
    wsData.push(['C.1', 'Modal Saham', '', 0]);
    wsData.push(['C.2', 'Tambahan Modal Disetor', '', 0]);
    wsData.push(['C.3', 'Saldo Laba', '', netProfit]);
    wsData.push(['C.4', 'Penghasilan Komprehensif Lain', '', 0]);
    wsData.push(['', 'JUMLAH EKUITAS', '', equity]);
    wsData.push(['', '', '', '']);
    wsData.push(['', 'JUMLAH KEWAJIBAN DAN EKUITAS', '', totalLiabilities + equity]);
    wsData.push(['', '', '', '']);
    wsData.push(['', '', '', '']);
    wsData.push(['', `Dicetak pada: ${formatDate(new Date())}`, '', '']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 6 }, { wch: 45 }, { wch: 8 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Neraca');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
// ==================== TAX REPORT PPN (SPT PPN) ====================
async function generateTaxReportPPNExcel(storeId, month, year) {
    const store = await getStoreInfo(storeId);
    const ppnRate = await getPpnRate(storeId);
    const taxReport = await FinanceService.getTaxReport(storeId, month, year);
    const locale = store?.locale || 'id';
    const wb = XLSX.utils.book_new();
    const wsData = [];
    // Header SPT PPN
    wsData.push(['', '']);
    wsData.push(['', 'SURAT PEMBERITAHUAN PAJAK', '']);
    wsData.push(['', 'PAJAK PERTAMBAHAN NILAI (PPN)', '']);
    wsData.push(['', 'SPT TAHUNAN / SPT PERIODE', '']);
    wsData.push(['', '']);
    wsData.push(['', `Masa Pajak: ${monthName(month, locale)} ${year}`, '']);
    wsData.push(['', '']);
    // Identitas Wajib Pajak
    wsData.push(['', 'DATA WAJIB PAJAK', '']);
    wsData.push(['1.', 'NPWP', store?.taxId || '-']);
    wsData.push(['2.', 'Nama Wajib Pajak', store?.companyName || store?.name || '-']);
    wsData.push(['3.', 'Alamat', store?.taxAddress || store?.address || '-']);
    wsData.push(['', '']);
    // Penghasilan
    wsData.push(['', 'PENGHASILAN', '']);
    wsData.push(['4.', 'Penghasilan Bruto', '', taxReport.totalRevenue]);
    wsData.push(['5.', 'Penyerahan Dalam Negeri', '', taxReport.totalRevenue - taxReport.taxExemptRevenue]);
    wsData.push(['6.', 'Penyerahan Luar Negeri', '', taxReport.taxExemptRevenue]);
    wsData.push(['7.', 'Ekspor', '', 0]);
    wsData.push(['', '']);
    // Penghitungan PPN
    wsData.push(['', 'PENGHITUNGAN PPN', '']);
    wsData.push(['8.', 'Penyerahan yang Tidak Dipungut PPN', '', taxReport.taxExemptRevenue]);
    wsData.push(['9.', 'Penyerahan yang Dibebaskan PPN', '', 0]);
    wsData.push(['10.', 'Penyerahan yang Atasasinya Dipungut PPN', '', taxReport.taxableRevenue]);
    wsData.push(['11.', 'Penghasilan Kena Pajak', '', taxReport.taxableRevenue]);
    wsData.push(['', '']);
    // PPN Terutang
    wsData.push(['', 'PPN TERUTANG', '']);
    wsData.push(['12.', `Dasar Pengenaan Pajak ( DPP )`, '', taxReport.taxableRevenue]);
    wsData.push(['13.', `Tarif PPN ( ${(ppnRate * 100).toFixed(0)}% )`, '', taxReport.ppnCollected]);
    wsData.push(['14.', 'PPN dalam PIB', '', 0]);
    wsData.push(['15.', 'PPN yang Sudah Ditagih', '', 0]);
    wsData.push(['', '']);
    // Kredit Pajak
    wsData.push(['', 'KREDIT PAJAK', '']);
    wsData.push(['16.', 'PK PPN Masukan yang Dapat Dikreditkan', '', 0]);
    wsData.push(['17.', 'PK PPN yang Tidak Dapat Dikreditkan', '', 0]);
    wsData.push(['', '']);
    // Kurang/Lebih Bayar
    wsData.push(['', 'KURANG/(LEBIH) BAYAR', '']);
    wsData.push(['18.', 'Kurang Bayar', '', taxReport.ppnCollected]);
    wsData.push(['19.', 'Lebih Bayar', '', 0]);
    wsData.push(['', '']);
    // Tanda Tangan
    wsData.push(['', '']);
    wsData.push(['', `Dicetak pada: ${formatDate(new Date())}`, '']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 6 }, { wch: 50 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'SPT PPN');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
// ==================== TAX REPORT PPh BADAN (SPT PPh Badan Form 1771) ====================
async function generateTaxReportPPHExcel(storeId, month, year) {
    const store = await getStoreInfo(storeId);
    const statement = await FinanceService.getIncomeStatement(storeId, month, year, false);
    const locale = store?.locale || 'id';
    const netIncome = statement.netProfit.amount || 0;
    const pkp = Math.max(0, netIncome);
    const pphTerutang = Math.round(pkp * 0.25);
    const wb = XLSX.utils.book_new();
    const wsData = [];
    // Header SPT PPh Badan
    wsData.push(['', '']);
    wsData.push(['', 'SURAT PEMBERITAHUAN', '']);
    wsData.push(['', 'PAJAK PENGHASILAN BADAN', '']);
    wsData.push(['', '(Formulir 1771)', '']);
    wsData.push(['', '']);
    wsData.push(['', `Tahun Pajak: ${year}`, '']);
    wsData.push(['', `Masa Pajak: Januari - ${monthName(month, locale)} ${year}`, '']);
    wsData.push(['', '']);
    // Identitas Wajib Pajak
    wsData.push(['', 'DATA WAJIB PAJAK', '']);
    wsData.push(['1.', 'NPWP', store?.taxId || '-']);
    wsData.push(['2.', 'Nama Wajib Pajak', store?.companyName || store?.name || '-']);
    wsData.push(['3.', 'Alamat', store?.taxAddress || store?.address || '-']);
    wsData.push(['4.', 'Jenis Usaha', store?.businessType || '-']);
    wsData.push(['5.', 'Kode Status', '']);
    wsData.push(['6.', 'Kode Lap.', '']);
    wsData.push(['', '']);
    // Penghasilan
    wsData.push(['', 'LAPORAN PENGHASILAN', '']);
    wsData.push(['I.', 'PENGHASILAN', '']);
    wsData.push(['7.', 'Pendapatan dari Operasional', '', statement.revenue.totalSales]);
    wsData.push(['8.', 'Harga Pokok Penjualan', '', -statement.costOfGoods.total]);
    wsData.push(['9.', 'Laba/(Rugi) Kotor', '', statement.revenue.totalSales - statement.costOfGoods.total]);
    wsData.push(['', '']);
    wsData.push(['10.', 'Beban Usaha', '', -statement.operatingExpenses.actual || 0]);
    wsData.push(['11.', 'Laba/(Rugi) Usaha', '', statement.revenue.totalSales - statement.costOfGoods.total - (statement.operatingExpenses.actual || 0)]);
    wsData.push(['', '']);
    wsData.push(['12.', 'Pendapatan/(Beban) Lainnya', '', 0]);
    wsData.push(['13.', 'Laba/(Rugi) Sebelum Pajak', '', pkp]);
    wsData.push(['', '']);
    // Biaya yang Tidak Dapat Dikurangkan
    wsData.push(['', 'KOREKSI FISCAL', '']);
    wsData.push(['14.', 'Koreksi Fiscal Positif', '', 0]);
    wsData.push(['15.', 'Koreksi Fiscal Negatif', '', 0]);
    wsData.push(['', '']);
    // Penghasilan Kena Pajak
    wsData.push(['', 'PENGHASILAN KENA PAJAK', '']);
    wsData.push(['16.', 'Penghasilan Neto Fiskal', '', pkp]);
    wsData.push(['17.', 'Kompensasi Kerugian', '', 0]);
    wsData.push(['18.', 'Penghasilan Kena Pajak', '', pkp]);
    wsData.push(['', '']);
    // Penghitungan Pajak
    wsData.push(['', 'PENGHITUNGAN PAJAK', '']);
    wsData.push(['19.', 'Penghasilan Kena Pajak', '', pkp]);
    wsData.push(['20.', 'Pajak Terutang (25%)', '', pphTerutang]);
    wsData.push(['', '']);
    // Kredit Pajak
    wsData.push(['', 'KREDIT PAJAK', '']);
    wsData.push(['21.', 'Angsuran PPh Pasal 25', '', 0]);
    wsData.push(['22.', 'Kredit Pajak Penghasilan (PPh 22)', '', 0]);
    wsData.push(['23.', 'Kredit Pajak Penghasilan (PPh 23)', '', 0]);
    wsData.push(['24.', 'Kredit Pajak Penghasilan (PPh Final)', '', 0]);
    wsData.push(['', '']);
    // Kurang/Lebih Bayar
    wsData.push(['', 'KURANG/(LEBIH) BAYAR', '']);
    wsData.push(['25.', 'Kurang Bayar', '', pphTerutang]);
    wsData.push(['26.', 'Lebih Bayar', '', 0]);
    wsData.push(['', '']);
    // Tanda Tangan
    wsData.push(['', '']);
    wsData.push(['', 'Tanda Tangan Wajib Pajak:', '']);
    wsData.push(['', '']);
    wsData.push(['', `Dicetak pada: ${formatDate(new Date())}`, '']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 6 }, { wch: 45 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'SPT PPh Badan');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
// ==================== MONTHLY REPORT PACKAGE ====================
async function generateMonthlyReportPackage(storeId, month, year) {
    const store = await getStoreInfo(storeId);
    const ppnRate = await getPpnRate(storeId);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const locale = store?.locale || 'id';
    const [incomeStatement, cashFlow, taxReport] = await Promise.all([
        FinanceService.getIncomeStatement(storeId, month, year, false),
        FinanceService.getCashFlow(storeId, startDate, endDate),
        FinanceService.getTaxReport(storeId, month, year)
    ]);
    const wb = XLSX.utils.book_new();
    // Sheet 1: Cover
    const cover = [];
    cover.push(['', '']);
    cover.push(['', 'LAPORAN KEUANGAN BULANAN', '']);
    cover.push(['', store?.name || 'Perusahaan', '']);
    cover.push(['', `Periode: ${monthName(month, locale)} ${year}`, '']);
    cover.push(['', '']);
    cover.push(['RINGKASAN:', '', '']);
    cover.push(['1.', 'Pendapatan Kotor', '', incomeStatement.revenue.totalSales]);
    cover.push(['2.', 'Harga Pokok Penjualan', '', -incomeStatement.costOfGoods.total]);
    cover.push(['3.', 'Laba Kotor', '', incomeStatement.grossProfit.amount]);
    cover.push(['4.', 'Total Beban Usaha', '', -incomeStatement.operatingExpenses.actual || 0]);
    cover.push(['5.', 'Laba Usaha', '', incomeStatement.netProfit.amount]);
    cover.push(['6.', 'Laba Bersih', '', incomeStatement.netProfit.amount]);
    cover.push(['7.', 'Arus Kas Bersih', '', cashFlow.netCashFlow]);
    cover.push(['8.', 'PPN Terutang', '', taxReport.ppnCollected]);
    cover.push(['', '']);
    cover.push(['', `Dicetak pada: ${formatDate(new Date())}`, '', '']);
    const coverWs = XLSX.utils.aoa_to_sheet(cover);
    coverWs['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, coverWs, 'Cover');
    // Sheet 2: Income Statement
    const isData = [];
    isData.push(['', 'LAPORAN LABA RUGI', '']);
    isData.push(['', '']);
    isData.push(['', `Periode: ${monthName(month, locale)} ${year}`, '']);
    isData.push(['', '']);
    isData.push(['#', 'Keterangan', '', 'Jumlah (Rp)']);
    isData.push(['1.', 'PENDAPATAN', '', '']);
    isData.push(['1.1', 'Pendapatan Kotor', '', incomeStatement.revenue.totalSales]);
    isData.push(['', 'JUMLAH PENDAPATAN', '', incomeStatement.revenue.totalSales]);
    isData.push(['', '']);
    isData.push(['2.', 'BEBAN POKOK', '', '']);
    isData.push(['2.1', 'Harga Pokok Penjualan', '', -incomeStatement.costOfGoods.total]);
    isData.push(['', 'JUMLAH BEBAN POKOK', '', -incomeStatement.costOfGoods.total]);
    isData.push(['', '']);
    isData.push(['3.', 'LABA KOTOR', '', incomeStatement.grossProfit.amount]);
    isData.push(['', '']);
    isData.push(['4.', 'BEBAN USAHA', '', '']);
    isData.push(['4.1', 'Total Beban Usaha', '', -incomeStatement.operatingExpenses.actual || 0]);
    isData.push(['', '']);
    isData.push(['5.', 'LABA USAHA', '', incomeStatement.netProfit.amount]);
    isData.push(['', '']);
    isData.push(['', `Dicetak pada: ${formatDate(new Date())}`, '', '']);
    const isWs = XLSX.utils.aoa_to_sheet(isData);
    isWs['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, isWs, 'Laba Rugi');
    // Sheet 3: Cash Flow
    const cfData = [];
    cfData.push(['', 'LAPORAN ARUS KAS', '']);
    cfData.push(['', '']);
    cfData.push(['', `Periode: ${monthName(month, locale)} ${year}`, '']);
    cfData.push(['', '']);
    cfData.push(['#', 'Keterangan', '', 'Jumlah (Rp)']);
    cfData.push(['A.', 'ARUS KAS DARI OPERASI', '', '']);
    cfData.push(['A.1', 'Penerimaan dari Pelanggan', '', cashFlow.inflows.cashSales]);
    cfData.push(['A.2', 'Pembayaran ke Supplier & Karyawan', '', -(cashFlow.outflows.inventoryPurchases + cashFlow.outflows.staffSalaries)]);
    cfData.push(['', 'ARUS KAS BERSIH', '', cashFlow.netCashFlow]);
    cfData.push(['', '']);
    cfData.push(['', `Dicetak pada: ${formatDate(new Date())}`, '', '']);
    const cfWs = XLSX.utils.aoa_to_sheet(cfData);
    cfWs['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, cfWs, 'Arus Kas');
    // Sheet 4: Tax Summary
    const taxData = [];
    taxData.push(['', 'RINGKASAN PAJAK', '']);
    taxData.push(['', '']);
    taxData.push(['', `Periode: ${monthName(month, locale)} ${year}`, '']);
    taxData.push(['', '']);
    taxData.push(['#', 'Keterangan', '', 'Jumlah (Rp)']);
    taxData.push(['1.', 'Penghasilan Kena Pajak', '', taxReport.taxableRevenue]);
    taxData.push([`2.`, `PPN Terutang (${(ppnRate * 100).toFixed(0)}%)`, '', taxReport.ppnCollected]);
    taxData.push([`3.`, `PPh Badan Terutang (25%)`, '', Math.round(taxReport.taxableRevenue * 0.25)]);
    taxData.push(['', '']);
    taxData.push(['', `Dicetak pada: ${formatDate(new Date())}`, '', '']);
    const taxWs = XLSX.utils.aoa_to_sheet(taxData);
    taxWs['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, taxWs, 'Pajak');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
//# sourceMappingURL=ReportExportService.js.map