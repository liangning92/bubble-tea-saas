import {useStaffAccess,permissionForPage} from '../../../shared/StaffAccess'
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Clock, ShieldCheck, Package, BookOpen, User } from "lucide-react";
export function EmployeeActions() {
  const access=useStaffAccess()
  const navigate = useNavigate(),
    { t } = useTranslation();
  const actions = [
    ["/inventory", "inventory.title", "ui.inventoryHint", Package, "amber"],
    ["/hygiene", "hygiene.title", "ui.hygieneHint", ShieldCheck, "mint"],
    ["/attendance", "nav.attendance", "ui.attendanceHint", Clock, "rose"],
    ["/training", "home.training", "ui.trainingHint", BookOpen, "lavender"],
    ["/profile", "workspace.navProfile", "ui.profileHint", User, "blue"],
  ] as const;
  return (
    <section aria-label={t("home.quickActions")} className="home-actions">
      {actions.filter(([path])=>access.can(permissionForPage(path,true)!)).map(([path, key, subtitle, Icon, tone]) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          className="home-action"
        >
          <span className={`workspace-row-icon ${tone}`}>
            <Icon size={22} />
          </span>
          <strong>{t(key)}</strong>
          <small>{t(subtitle)}</small>
        </button>
      ))}
    </section>
  );
}
