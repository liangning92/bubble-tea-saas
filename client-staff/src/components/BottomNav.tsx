import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Home,
  Package,
  ShieldCheck,
  Clock,
  BookOpen,
  User,
} from "lucide-react";
export function modulePath(path: string) {
  if (path.startsWith("/inventory")) return "/inventory";
  if (path.startsWith("/hygiene")) return "/hygiene";
  if (path.startsWith("/training")) return "/training";
  if (
    ["/attendance", "/schedule", "/leave", "/overtime", "/shift-swap"].some(
      (p) => path.startsWith(p),
    )
  )
    return "/attendance";
  if (
    ["/profile", "/salary", "/reimbursement", "/deposit", "/points"].some((p) =>
      path.startsWith(p),
    )
  )
    return "/profile";
  return "/";
}
export function BottomNav() {
  const { t } = useTranslation(),
    navigate = useNavigate(),
    location = useLocation(),
    active = modulePath(location.pathname);
  const tabs = [
    ["/", "nav.home", Home],
    ["/inventory", "workspace.navInventory", Package],
    ["/hygiene", "workspace.navHygiene", ShieldCheck],
    ["/attendance", "nav.attendance", Clock],
    ["/training", "workspace.navTraining", BookOpen],
    ["/profile", "workspace.navProfile", User],
  ] as const;
  return (
    <nav
      aria-label={t("nav.home")}
      className="fixed bottom-0 inset-x-0 bg-white border-t grid grid-cols-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-[60]"
    >
      {tabs.map(([path, key, Icon]) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          aria-current={active === path ? "page" : undefined}
          className={`min-h-12 min-w-0 px-0.5 flex flex-col items-center gap-1 ${active === path ? "text-primary font-bold" : "text-gray-500"}`}
        >
          <Icon size={21} />
          <span className="text-[10px] leading-3 text-center break-words">
            {t(key)}
          </span>
        </button>
      ))}
    </nav>
  );
}
