import { useAwareness } from '../../../shared/NotificationAwareness';
import { notificationAwarenessCopy } from '../../../shared/notificationAwarenessCopy';
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
  const {data}=useAwareness();
  const { t, i18n } = useTranslation(),
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
    <nav aria-label={t("nav.home")} className="employee-bottom-nav">
      {tabs.map(([path, key, Icon]) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          aria-current={active === path ? "page" : undefined}
          className={`employee-nav-item ${active === path ? "active" : ""}`}
        >
          <span className="employee-nav-icon">
            <Icon size={21} strokeWidth={active === path ? 2.2 : 1.8} />
          </span>
          <span className="employee-nav-label">{t(key)}{path === "/training" && data.counts.trainingUnread > 0 && <span className="ml-1 text-red-600" aria-label={notificationAwarenessCopy(i18n.language).training}>•</span>}</span>
        </button>
      ))}
    </nav>
  );
}
