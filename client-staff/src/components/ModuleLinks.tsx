import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
export function ModuleLinks({ group }: { group: "attendance" | "profile" }) {
  const { t } = useTranslation();
  const links =
    group === "attendance"
      ? [
          ["/schedule", "nav.schedule"],
          ["/leave", "nav.leave"],
          ["/shift-swap", "shiftSwap.title"],
          ["/overtime", "overtime.title"],
          ["/attendance/correction", "attendance.requestCorrection"],
          ["/attendance/appeals", "workspace.appeals"],
          ["/attendance/rules", "attendanceRules.title"],
        ]
      : [
          ["/salary", "salary.title"],
          ["/reimbursement", "home.reimbursement"],
          ["/profile/documents", "workspace.documents"],
          ["/deposit", "home.deposit"],
          ["/points", "home.points"],
        ];
  return (
    <section className="grid grid-cols-2 gap-2 p-4">
      {links.map(([path, key]) => (
        <Link
          key={path}
          to={path}
          className="bg-white rounded-xl p-4 border font-semibold text-sm"
        >
          {t(key)} →
        </Link>
      ))}
    </section>
  );
}
