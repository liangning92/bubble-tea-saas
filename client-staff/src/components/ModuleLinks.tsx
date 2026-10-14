import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  CalendarClock,
  Repeat2,
  Clock3,
  ClipboardEdit,
  ShieldCheck,
  Info,
  Wallet,
  Receipt,
  FolderLock,
  Landmark,
  Award,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";
export function ModuleLinks({ group }: { group: "attendance" | "profile" }) {
  const { t } = useTranslation();
  const links =
    group === "attendance"
      ? ([
          ["/schedule", "nav.schedule", CalendarDays],
          ["/leave", "nav.leave", CalendarClock],
          ["/shift-swap", "shiftSwap.title", Repeat2],
          ["/overtime", "overtime.title", Clock3],
          [
            "/attendance/correction",
            "attendance.requestCorrection",
            ClipboardEdit,
          ],
          ["/attendance/appeals", "workspace.appeals", ShieldCheck],
          ["/attendance/rules", "attendanceRules.title", Info],
        ] as const)
      : ([
          ["/salary", "salary.title", Wallet],
          ["/reimbursement", "home.reimbursement", Receipt],
          ["/profile/documents", "workspace.documents", FolderLock],
          ["/deposit", "home.deposit", Landmark],
          ["/deposit/rules", "deposit.rules", Info],
          ["/announcements", "announcement.title", Info],
          ["/points", "voucher.wallet", Award],
        ] as const);
  return (
    <section className={`module-links ${group}`}>
      <div className="module-links-heading">
        <h2>{t(group === "profile" ? "ui.private" : "ui.quick")}</h2>
        {group === "profile" && <LockKeyhole size={16} />}
      </div>
      {group === "profile" && (
        <p className="module-links-hint">{t("ui.privateHint")}</p>
      )}
      <div
        className={group === "profile" ? "workspace-list" : "module-links-grid"}
      >
        {links.map(([path, key, Icon]) => (
          <Link
            key={path}
            to={path}
            className={
              group === "profile" ? "workspace-row" : "module-link-tile"
            }
          >
            <span className="workspace-row-icon rose">
              <Icon size={20} />
            </span>
            <strong>{t(key)}</strong>
            <ChevronRight size={16} />
          </Link>
        ))}
      </div>
    </section>
  );
}
