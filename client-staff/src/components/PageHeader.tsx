import { type LucideIcon } from "lucide-react";
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <header className="employee-page-header">
      <div className="page-header-icon">
        <Icon size={23} />
      </div>
      <div className="page-header-copy">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
