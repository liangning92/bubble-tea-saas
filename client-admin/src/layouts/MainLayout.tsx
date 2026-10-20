import { AwarenessEntry } from '../../../shared/NotificationAwarenessInbox';
import {staffAccessLabels,staffRoleLabel} from '../../../shared/staffAccessLabels';
import {useMarketingCopy} from "../components/marketing/MarketingLayout";
import { permissionForPage } from "../../../shared/StaffAccess";
import { StaffApprovalDialog } from "../../../shared/StaffApprovalDialog";
import { useStoreDateSettings } from "../hooks/useStoreDateSettings";
import { EmployeeAccessContext } from "../contexts/EmployeeAccess";
import api from "../services/api";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/auth";
import { YOUME_LOGO_RED } from "../assets/logo";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
  Megaphone,
  Sprout,
  Wallet,
  Link2,
} from "lucide-react";
import { Suspense, useState, useEffect, useRef } from "react";
import { RouteLoading } from "../components/RouteLoading";

// 一级导航模块
const adminPagePermission = (path: string) =>
  ["/tv-screens", "/media-library", "/settings/tv-screen"].some(
    (p) => path === p || path.startsWith(p + "/"),
  )
    ? "marketing.read"
    : permissionForPage(path);
const navItems = [
  {
    path: "/dashboard",
    label: "nav.dashboard",
    defaultLabel: "仪表盘",
    icon: LayoutDashboard,
  },
  {
    path: "/products",
    label: "nav.products",
    defaultLabel: "商品管理",
    icon: Package,
  },
  {
    path: "/inventory",
    label: "nav.inventory",
    defaultLabel: "库存管理",
    icon: Warehouse,
  },
  {
    path: "/finance",
    label: "nav.finance",
    defaultLabel: "财务中心",
    icon: Wallet,
  },
  {
    path: "/channels",
    label: "nav.channels",
    defaultLabel: "销售渠道",
    icon: Link2,
  },
  { path: "/staff", label: "nav.staff", defaultLabel: "员工管理", icon: Users },
  {
    path: "/hygiene",
    label: "nav.hygiene",
    defaultLabel: "卫生检查",
    icon: Sprout,
  },
  {
    path: "/marketing",
    label: "nav.marketing",
    defaultLabel: "营销活动",
    icon: Megaphone,
  },
  {
    path: "/settings",
    label: "nav.settings",
    defaultLabel: "系统设置",
    icon: Settings,
  },
];

export function MainLayout() {
  useStoreDateSettings();
  const l=useMarketingCopy();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const elements = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          "button,a[href],select",
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
    elements()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileOpen(false);
      }
      if (e.key === "Tab") {
        const els = elements(),
          first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const media = window.matchMedia("(min-width: 1024px)"),
      resize = () => {
        if (media.matches) setMobileOpen(false);
      };
    document.addEventListener("keydown", key);
    media.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      media.removeEventListener("change", resize);
      previous?.focus();
    };
  }, [mobileOpen]);
  const [lang, setLang] = useState(i18n.language);
  const [access, setAccess] = useState<{
    actor: string;
    role: {
      id?: string;
      name: string;
      permissions: string[];
      version?: number;
      modes?: Record<string, string>;
    } | null;
    failed: boolean;
  } | null>(null);
  const actorKey =
    (user?.id || "") + ":" + (user?.storeId || "") + ":" + (user?.role || "");
  useEffect(() => {
    if (user?.role === "admin") {
      setAccess({ actor: actorKey, role: null, failed: false });
      return;
    }
    if (!user?.id) return;
    let current = true;
    const refresh = () =>
      api
        .get("/staff-permissions/me")
        .then((response) => {
          if (current && response.data.data.managementAccess === false) { useAuthStore.getState().logout(); return; }
          if (current)
            setAccess({
              actor: actorKey,
              role: response.data.data.role,
              failed: false,
            });
        })
        .catch(() => {
          if (current) setAccess({ actor: actorKey, role: null, failed: true });
        });
    void refresh();
    const timer=window.setInterval(refresh,30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("staff-access-changed", refresh);
    return () => {
      current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("staff-access-changed", refresh);
    };
  }, [actorKey, user?.role, location.pathname]);
  const ready =
    user?.role === "admin" || (access?.actor === actorKey && !access.failed);
  const customRole = access?.actor === actorKey ? access.role : null;
  const visibleNavItems = navItems.filter((item) => {
    if (user?.role === "admin") return true;
    if (!ready) return false;
    if (item.path === "/products" && user?.role !== "admin") return false;
    if (!customRole) return true;
    const groups: Record<string, string[]> = {
      "/dashboard": ["dashboard.read"],
      "/products": ["products.manage"],
      "/inventory": ["inventory.read"],
      "/finance": ["finance.read", "dashboard.read"],
      "/channels": ["channels.read"],
      "/staff": [
        "staff.read",
        "attendance.read",
        "schedules.read",
        "salary.read",
        "deposits.read",
        "rewards.read",
        "training.read",
      ],
      "/hygiene": ["hygiene.read"],
      "/marketing": ["marketing.read", "members.read"],
      "/settings": [],
    };
    return (groups[item.path] || []).some((permission) =>
      customRole.permissions.includes(permission),
    );
  });

  const navigationTarget = (path: string) => {
    if (!customRole) return path;
    const permissions = customRole.permissions;
    if (path === "/finance" && !permissions.includes("dashboard.read"))
      return "/finance/expenses";
    if (path === "/marketing" && !permissions.includes("marketing.read"))
      return "/marketing/members";
    if (path === "/staff" && !permissions.includes("staff.read")) {
      const pages = [
        ["attendance.read", "/staff/attendance"],
        ["schedules.read", "/staff/schedule"],
        ["salary.read", "/staff/salary"],
        ["deposits.read", "/staff/salary/deposit"],
        ["rewards.read", "/staff/points"],
        ["training.read", "/staff/training"],
      ];
      return (
        pages.find(([permission]) => permissions.includes(permission))?.[1] ||
        path
      );
    }
    return path;
  };

  const landingPage = visibleNavItems[0] ? navigationTarget(visibleNavItems[0].path) : null;
  useEffect(() => {
    if (ready && customRole && user?.role !== "admin" && location.pathname === "/dashboard" && !customRole.permissions.includes("dashboard.read") && landingPage) navigate(landingPage, { replace: true });
  }, [ready, customRole, user?.role, location.pathname, landingPage, navigate]);

  // 监听 i18n 语言变化，强制 React 重新渲染
  useEffect(() => {
    const handler = () => setLang(i18n.language);
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);

  const handleLanguageChange = (newLang: string) => {
    i18n.changeLanguage(newLang).then(() => {
      localStorage.setItem("bubble-tea-language", newLang);
      setLang(newLang);
      // react-i18next updates subscribed pages in place. Reloading here would
      // discard unsaved page drafts and reset filters during a language switch.
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <EmployeeAccessContext.Provider value={{ role: customRole, ready }}>
      <div className="flex h-dvh bg-surface">
        {mobileOpen && (
          <button
            aria-label={t("common.close")}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
        {/* Sidebar */}
        <aside
          ref={sidebarRef}
          className={`${
            sidebarOpen ? "lg:w-64" : "lg:w-20"
          } w-64 fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0 shrink-0 bg-white border-r border-border transition-all duration-300 flex flex-col ${mobileOpen ? "translate-x-0 visible" : "-translate-x-full invisible lg:visible"}`}
        >
          {/* Logo */}
          <div
            className={`h-20 flex items-center justify-between gap-3 ${sidebarOpen ? "px-6" : "px-4"} border-b border-border`}
          >
            {sidebarOpen && (
              <div className="flex items-center gap-2">
                <img
                  src={YOUME_LOGO_RED}
                  alt="YOUME"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.onerror = null;
                    target.src = YOUME_LOGO_RED;
                  }}
                  className="h-6 w-28 object-contain"
                />
              </div>
            )}
            <button
              aria-label={t("common.close")}
              onClick={() => {
                if (window.matchMedia("(min-width: 1024px)").matches)
                  setSidebarOpen(!sidebarOpen);
                else setMobileOpen(false);
              }}
              className="shrink-0 p-2 rounded-lg hover:bg-gray-100"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 overflow-y-auto">
            {visibleNavItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={navigationTarget(item.path)}
                  className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary-light text-primary"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <item.icon size={22} />
                  {sidebarOpen && (
                    <span className="font-medium">
                      {String(
                        t(item.label, (item as any).defaultLabel || item.label),
                      )}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-border space-y-3">
            {/* Language Selector */}
            {sidebarOpen ? (
              <div className="relative">
                <select
                  value={lang}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none cursor-pointer"
                >
                  <option value="id">🇮🇩 Bahasa Indonesia</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="zh">🇨🇳 {t("common.chinese")}</option>
                </select>
                <Globe
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>
            ) : (
              <select
                value={lang}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="w-10 h-10 border border-gray-200 rounded-lg text-sm bg-white flex items-center justify-center cursor-pointer"
              >
                <option value="id">🇮🇩</option>
                <option value="en">🇬🇧</option>
                <option value="zh">🇨🇳</option>
              </select>
            )}
            {sidebarOpen ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center">
                  <span className="text-primary font-semibold">
                    {user?.staff?.name?.charAt(0) ||
                      user?.phone?.charAt(0) ||
                      "U"}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">
                    {user?.staff?.name || "User"}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {customRole ? staffRoleLabel(customRole.id||'',customRole.name,staffAccessLabels(i18n.language)) : user?.role}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                  title={t("auth.logout")}
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogout}
                className="w-full p-2 rounded-lg hover:bg-gray-100 text-gray-500 flex justify-center"
                title={t("auth.logout")}
              >
                <LogOut size={20} />
              </button>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="admin-workspace flex-1 min-w-0 overflow-auto">
          <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-border px-4 py-2 flex items-center gap-3">
            <button
              aria-label={l("菜单", "Menu", "Menu")}
              aria-expanded={mobileOpen}
              className="btn"
              onClick={() => {
                setSidebarOpen(true);
                setMobileOpen(true);
              }}
            >
              <Menu size={20} />
            </button>
            <img
              src={YOUME_LOGO_RED}
              alt="YOUME"
              className="h-5 w-24 object-contain"
            />
          </header>
          <div className="p-4 sm:p-6">
            <div className="mb-4 flex justify-end"><AwarenessEntry /></div>
            {!ready ? (
              access?.failed ? (
                <div role="alert" className="card text-red-600">
                  {t("common.error")}
                  <button
                    className="btn-primary ml-4"
                    onClick={() => window.location.reload()}
                  >
                    {t("common.refresh")}
                  </button>
                </div>
              ) : (
                <RouteLoading />
              )
            ) : (
              <Suspense fallback={<RouteLoading />}>
                {(user?.role !== "admin" && location.pathname.startsWith("/products")) || customRole?.version === 2 &&
                user?.role !== "admin" &&
                adminPagePermission(location.pathname) &&
                !customRole.permissions.includes(
                  adminPagePermission(location.pathname)!,
                ) ? (
                  <div role="alert" className="card">
                    {t("staffAccessV2.denied")}
                  </div>
                ) : (
                  <Outlet />
                )}
              </Suspense>
            )}
          </div>
        </main>
      </div>
      <StaffApprovalDialog />
    </EmployeeAccessContext.Provider>
  );
}
