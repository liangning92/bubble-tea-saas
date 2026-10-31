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
{ id:"stock", name:l("库存总览", "Stock overview", "Ringkasan stok"), items:[{path:"/inventory",name:l("库存清单", "Stock list", "Daftar stok")}]},
{ id:"operations", name:l("库存作业", "Stock operations", "Operasi stok"), items:[{path:"/inventory/logs",name:l("出入库记录", "Stock movements", "Pergerakan stok")},{path:"/inventory/process",name:l("加工记录", "Processing", "Pengolahan")},{path:"/inventory/count",name:l("盘点与审核", "Count & review", "Hitung & tinjau")}]},
{ id:"purchasing", name:l("采购补货", "Purchasing", "Pembelian"), items:[{path:"/inventory/restock",name:l("补货建议", "Restock suggestions", "Saran restok")},{path:"/inventory/forecast",name:l("补货测算", "Restock planning", "Perencanaan restok")},{path:"/inventory/purchase-orders",name:l("采购与收货", "Purchase & receive", "Beli & terima")},{path:"/inventory/suppliers",name:l("供应商", "Suppliers", "Pemasok")}]},
{ id:"analysis", name:l("分析报表", "Usage reports", "Laporan pemakaian"), items:[{path:"/inventory/consumption",name:l("出库与理论消耗", "Stock-out vs theoretical use", "Stok keluar vs teori")},{path:"/inventory/physical-analysis",name:l("盘点库存核对", "Count reconciliation", "Rekonsiliasi opname")},{path:"/inventory/recipe-usage",name:l("原料应扣减查询", "Recipe usage query", "Kueri pemakaian bahan")}]},
{ id:"alerts", name:l("预警中心", "Alert center", "Pusat peringatan"), items:[{path:"/inventory/alerts",name:l("预警列表", "Alerts", "Peringatan")},{path:"/inventory/alert-config",name:l("规则设置", "Rules", "Aturan")}]}
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
        </>
      )}
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
