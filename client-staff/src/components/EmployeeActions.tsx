import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Clock, ShieldCheck, Package, BookOpen, User } from "lucide-react";
export function EmployeeActions() {
  const navigate = useNavigate(),
    { t } = useTranslation();
  const actions = [
    ["/inventory", "inventory.title", Package],
    ["/hygiene", "hygiene.title", ShieldCheck],
    ["/attendance", "nav.attendance", Clock],
    ["/training", "home.training", BookOpen],
    ["/profile", "workspace.navProfile", User],
  ] as const;
  return (
    <section
      aria-label={t("home.quickActions")}
      className="grid grid-cols-3 gap-2"
    >
      {actions.map(([path, key, Icon]) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          className="bg-white p-3 rounded-xl border flex flex-col items-center gap-2"
        >
          <Icon className="text-primary" size={22} />
          <span className="text-xs font-semibold">{t(key)}</span>
        </button>
      ))}
    </section>
  );
}
