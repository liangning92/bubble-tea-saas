import { useEffect, useRef } from "react";
import { useEmployeeNavigation } from "../../contexts/EmployeeAccess";
import { permissionForPage } from "../../../../shared/StaffAccess";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useMarketingCopy } from "../../components/marketing/MarketingLayout";

export function InventoryIndexPage() {
  const allowed = useEmployeeNavigation(),
    { pathname } = useLocation(),
    l = useMarketingCopy();
  const groupNav = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = groupNav.current,
      item = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && item)
      nav.scrollLeft +=
        item.getBoundingClientRect().left -
        nav.getBoundingClientRect().left -
        (nav.clientWidth - item.clientWidth) / 2;
  }, [pathname]);
  const groups = [
    {
      id: "stock",
      name: l("库存与物料", "Stock & materials", "Stok & bahan"),
      hint: l(
        "维护物料档案、查看现存量和出入库记录。",
        "Maintain materials, review stock and movements.",
        "Kelola bahan, lihat stok dan pergerakan.",
      ),
      items: [
        {
          path: "/inventory",
          name: l("库存清单", "Stock list", "Daftar stok"),
        },
        {
          path: "/inventory/logs",
          name: l("出入库记录", "Stock movements", "Pergerakan stok"),
        },
      ],
    },
    {
      id: "purchasing",
      name: l("采购与补货", "Purchasing", "Pembelian"),
      hint: l(
        "查看补货建议，创建采购单，再登记到货；供应商在此维护。",
        "Review restock needs, create purchase orders and receive deliveries.",
        "Tinjau kebutuhan, buat pesanan pembelian dan terima barang.",
      ),
      items: [
        {
          path: "/inventory/restock",
          name: l("补货建议", "Restock suggestions", "Saran restok"),
        },
        {
          path: "/inventory/purchase-orders",
          name: l("采购与收货", "Purchase & receive", "Beli & terima"),
        },
        {
          path: "/inventory/suppliers",
          name: l("供应商", "Suppliers", "Pemasok"),
        },
      ],
    },
    {
      id: "operations",
      name: l("库存作业", "Stock operations", "Operasi stok"),
      hint: l(
        "登记加工与员工领用，库存变化在出入库记录中追溯。",
        "Record processing and staff consumption; trace changes in movements.",
        "Catat pengolahan dan konsumsi staf; telusuri pergerakan stok.",
      ),
      items: [
        {
          path: "/inventory/process",
          name: l("加工记录", "Processing", "Pengolahan"),
        },
        {
          path: "/inventory/consumption",
          name: l("员工领用", "Staff consumption", "Konsumsi staf"),
        },
      ],
    },
    {
      id: "counts",
      name: l("盘点与审核", "Count & review", "Hitung & tinjau"),
      hint: l(
        "创建盘点、记录实存、填写差异原因，再提交审核。",
        "Create a count, record actual stock and reasons, then submit for review.",
        "Buat hitungan, catat stok aktual dan alasan, lalu ajukan tinjauan.",
      ),
      items: [
        {
          path: "/inventory/count",
          name: l("盘点工作台", "Count workspace", "Ruang hitung stok"),
        },
      ],
    },
    {
      id: "alerts",
      name: l("库存预警", "Stock alerts", "Peringatan stok"),
      hint: l(
        "处理库存不足、效期及差异提醒；预警规则在本组设置。",
        "Review shortages, expiry and variance alerts; configure rules here.",
        "Tinjau kekurangan, kedaluwarsa dan selisih; atur aturan di sini.",
      ),
      items: [
        {
          path: "/inventory/alerts",
          name: l("预警中心", "Alert center", "Pusat peringatan"),
        },
        {
          path: "/inventory/alert-config",
          name: l("预警设置", "Alert settings", "Pengaturan peringatan"),
        },
      ],
    },
    {
      id: "analysis",
      name: l("用量与预测", "Usage & forecast", "Pemakaian & prediksi"),
      hint: l(
        "分析实际用量与库存消耗，按营业数据查看原料需求预测。",
        "Analyze usage and consumption, and forecast material needs.",
        "Analisis pemakaian dan konsumsi, prediksi kebutuhan bahan.",
      ),
      items: [
        {
          path: "/inventory/physical-analysis",
          name: l("消耗分析", "Consumption analysis", "Analisis konsumsi"),
        },
        {
          path: "/inventory/forecast",
          name: l("原料预测", "Material forecast", "Prediksi bahan"),
        },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        allowed(permissionForPage(item.path) || ""),
      ),
    }))
    .filter((group) => group.items.length);
  const matches = (path: string) =>
    path === "/inventory"
      ? pathname === path
      : pathname === path || pathname.startsWith(path + "/");
  const active =
    groups.find((group) => group.items.some((item) => matches(item.path))) ||
    groups[0];
  return (
    <div className="min-w-0 space-y-4">
      <nav
        ref={groupNav}
        aria-label={l("库存分组", "Inventory groups", "Grup persediaan")}
        className="flex overflow-x-auto gap-1 bg-white border border-border rounded-lg p-1"
      >
        {groups.map((group) => (
          <Link
            key={group.id}
            to={group.items[0].path}
            aria-current={active?.id === group.id ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium ${active?.id === group.id ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            {group.name}
          </Link>
        ))}
      </nav>
      {active && (
        <>
          <nav
            aria-label={l("库存页面", "Inventory pages", "Halaman persediaan")}
            className="flex gap-4 overflow-x-auto border-b border-border"
          >
            {active.items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                aria-current={matches(item.path) ? "page" : undefined}
                className={`whitespace-nowrap shrink-0 py-2 border-b-2 text-sm ${matches(item.path) ? "text-primary border-primary font-medium" : "text-gray-600 border-transparent"}`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
          <p className="text-sm text-gray-500">{active.hint}</p>
        </>
      )}
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
