import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ScanLine,
  Bell,
  RefreshCw,
  CalendarDays,
  Clock3,
  ArrowUpRight,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  BookOpen,
  Repeat2,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { staffApi, employeeApi } from "../services/api";
import { EmployeeActions } from "../components/EmployeeActions";
import { QRCameraScannerModal } from "../components/QRCameraScannerModal";
export function HomePage() {
  const { t, i18n } = useTranslation(),
    navigate = useNavigate(),
    { user } = useAuthStore();
  const [overview, setOverview] = useState<any>(null),
    [dashboard, setDashboard] = useState<any>(null),
    [attendance, setAttendance] = useState<any>(null),
    [failed, setFailed] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [scanner, setScanner] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function refresh() {
    setLoading(true);
    const results = await Promise.allSettled([
      staffApi.getMonthlyOverview(),
      employeeApi.get("/my/dashboard"),
      staffApi.getTodayAttendance(user!.staffId),
    ]);
    if (results[0].status === "fulfilled") setOverview(results[0].value.data);
    if (results[1].status === "fulfilled") setDashboard(results[1].value);
    if (results[2].status === "fulfilled")
      setAttendance(results[2].value.data ?? null);
    setFailed(
      results.flatMap((r, i) =>
        r.status === "rejected"
          ? [["overview", "dashboard", "attendance"][i]]
          : [],
      ),
    );
    setLoading(false);
  }
  useEffect(() => {
    if (user?.staffId) void refresh();
  }, [user?.staffId]);
  const working = attendance && !attendance.checkOutTime,
    mode = working ? "check_out" : "check_in";
  async function scan(data: string, selected: "check_in" | "check_out") {
    setBusy(true);
    setMessage("");
    try {
      await staffApi.checkInWithQR(
        data,
        selected,
        selected === "check_out" ? attendance?.id : undefined,
      );
      setScanner(false);
      setMessage(
        t(
          selected === "check_in"
            ? "attendance.checkInSuccess"
            : "attendance.checkOutSuccess",
        ),
      );
      await refresh();
    } catch (e: any) {
      setMessage(e.response?.data?.message || t("attendance.invalidQR"));
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const shift = overview?.schedule?.todayShift;
  const shiftLanguage = i18n.language.split('-')[0];
  const shiftName = (shiftLanguage === 'zh' ? shift?.shiftNameZh : shiftLanguage === 'id' ? shift?.shiftNameId : '') || shift?.shiftName;
  const locale =
    i18n.language === "zh"
      ? "zh-CN"
      : i18n.language === "en"
        ? "en-GB"
        : "id-ID";
  const today = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());
  const rewards =
    (overview?.pointsAndDiscipline?.rewardsCount || 0) +
    (dashboard?.rewardsCount || 0);
  const penalties =
    (overview?.pointsAndDiscipline?.penaltiesCount || 0) +
    (dashboard?.penaltiesCount || 0);
  const reminders = dashboard?.reminders?.slice(0, 5) || [];
  const taskRows = [
    {
      path: "/hygiene",
      title: t("hygiene.title"),
      subtitle: t("ui.hygieneHint"),
      count: dashboard?.hygiene?.todo,
      icon: ShieldCheck,
      tone: "mint",
    },
    {
      path: "/training",
      title: t("home.training"),
      subtitle: t("ui.trainingHint"),
      count: dashboard?.training,
      icon: BookOpen,
      tone: "lavender",
    },
    {
      path: "/shift-swap",
      title: t("workspace.swapConfirm"),
      subtitle: t("nav.schedule"),
      count: dashboard?.swap,
      icon: Repeat2,
      tone: "amber",
    },
  ];
  return (
    <main className="employee-home">
      <header className="home-brand-panel">
        <img src="/youme-logo-red.png" alt="YOUME" />
        <div className="home-values">
          <p>{t("ui.coreValueHonesty")}</p>
          <p>{t("ui.coreValueInitiative")}</p>
          <p>{t("ui.coreValueEnthusiasm")}</p>
        </div>
      </header>
      <section className="home-greeting">
        <div>
          <p className="home-date">{today} · WIB</p>
          <h1>
            {t("ui.greeting", {
              name: user?.name?.split(" ")[0] || user?.name,
            })}
          </h1>
          <p className="home-store">
            <MapPin size={13} />
            {overview?.staff?.storeName || user?.storeName || t("ui.workplace")}
          </p>
        </div>
        <select
          aria-label={t("ui.language")}
          value={i18n.resolvedLanguage?.split("-")[0] || "id"}
          onChange={(e) => {
            void i18n.changeLanguage(e.target.value);
            localStorage.setItem("bubble-tea-language", e.target.value);
          }}
          className="home-language"
        >
          <option value="id">ID</option>
          <option value="zh">中文</option>
          <option value="en">EN</option>
        </select>
      </section>
      {message && (
        <p role="status" className="workspace-feedback">
          <CheckCircle2 size={17} />
          {message}
        </p>
      )}
      {(failed.length > 0 || dashboard?.failedModules?.length > 0) && (
        <div role="alert" className="workspace-feedback warning">
          {t("common.loadFailed")}{" "}
          <button onClick={refresh}>{t("common.retry")}</button>
        </div>
      )}
      <section className="home-shift-card">
        <div className="home-shift-top">
          <span className="home-eyebrow">
            <CalendarDays size={15} />
            {t("ui.yourShift")}
          </span>
          <span className={`work-status ${working ? "working" : ""}`}>
            <i />
            {working
              ? t("home.working")
              : attendance
                ? t("attendance.checkOut")
                : t("home.notCheckedIn")}
          </span>
        </div>
        <button
          className="home-shift-details"
          onClick={() => navigate("/schedule")}
        >
          <div>
            <h2>{shiftName || t("home.noShiftToday")}</h2>
            {shift && (
              <p className="home-shift-time">
                {shift.startTime}
                <span>—</span>
                {shift.endTime}
                <small>WIB</small>
              </p>
            )}
          </div>
          <ArrowUpRight size={21} />
        </button>
        <div className="home-scan-area">
          <button
            className="home-scan-cta"
            disabled={loading || failed.includes("attendance")}
            onClick={() => setScanner(true)}
          >
            <ScanLine size={20} />
            {working ? t("ui.checkOut") : t("ui.checkIn")}
            <ChevronRight size={17} />
          </button>
          <p>{t("ui.scanHint")}</p>
        </div>
      </section>
      <section>
        <div className="home-section-title">
          <h2>{t("ui.month")}</h2>
          <button
            aria-label={t("ui.refresh")}
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span>{overview?.month}</span>
          </button>
        </div>
        <div className="home-metrics">
          <button onClick={() => navigate("/attendance")}>
            <span className="metric-icon mint">
              <CalendarDays size={18} />
            </span>
            <strong>
              {dashboard?.workDays ?? overview?.attendance?.presentDays ?? "—"}
              <small>{t("ui.days")}</small>
            </strong>
            <span className="metric-label">{t("home.presentDays")}</span>
          </button>
          <button onClick={() => navigate("/attendance/appeals")}>
            <span className="metric-icon amber">
              <Clock3 size={18} />
            </span>
            <strong>
              {dashboard?.lateMinutes ?? "—"}
              <small>{t("workspace.minutes")}</small>
            </strong>
            <span className="metric-label">{t("ui.late")}</span>
          </button>
          <button onClick={() => navigate("/points")}>
            <span className="metric-icon rose">
              <Sparkles size={18} />
            </span>
            <strong>{overview || dashboard ? rewards + penalties : "—"}</strong>
            <span className="metric-label">{t("ui.rewards")}</span>
            <span className="metric-detail">
              <span className="block">{t("workspace.rewardCount")} {rewards}</span>
              <span className="block">{t("workspace.penaltyCount")} {penalties}</span>
            </span>
          </button>
        </div>
      </section>
      <section>
        <div className="home-section-title">
          <h2>{t("ui.tasks")}</h2>
          <span className="home-count">
            {dashboard
              ? (dashboard.hygiene?.todo || 0) +
                (dashboard.training || 0) +
                (dashboard.swap || 0)
              : "—"}
          </span>
        </div>
        <div className="workspace-list">
          {taskRows.map(
            ({ path, title, subtitle, count, icon: Icon, tone }) => (
              <button
                className="workspace-row"
                key={path}
                onClick={() => navigate(path)}
              >
                <span className={`workspace-row-icon ${tone}`}>
                  <Icon size={21} />
                </span>
                <span className="workspace-row-copy">
                  <strong>{title}</strong>
                  <small>{subtitle}</small>
                </span>
                <span className={`task-count ${count ? "has-tasks" : ""}`}>
                  {count ?? "—"}
                </span>
                <ChevronRight size={17} />
              </button>
            ),
          )}
        </div>
        {dashboard?.hygiene?.pendingReview > 0 && (
          <button className="home-pending" onClick={() => navigate("/hygiene")}>
            <Clock3 size={15} />
            {t("hygiene.title")} · {t("workspace.pendingReview")}{" "}
            {dashboard.hygiene.pendingReview}
            <ChevronRight size={15} />
          </button>
        )}
      </section>
      <section>
        <div className="home-section-title">
          <h2>{t("ui.quick")}</h2>
        </div>
        <EmployeeActions />
      </section>
      <section>
        <div className="home-section-title">
          <h2>{t("ui.review")}</h2>
          <Bell size={17} />
        </div>
        <div className="workspace-list">
          {!reminders.length && !overview?.announcements?.length ? (
            <div className="home-empty">
              <span>
                <CheckCircle2 size={22} />
              </span>
              <div>
                <strong>{t("ui.noUpdates")}</strong>
                <p>{t("ui.noUpdatesHint")}</p>
              </div>
            </div>
          ) : (
            <>
              {reminders.map((r: any) => (
                <button
                  key={r.id}
                  className="workspace-row"
                  onClick={() => navigate(r.url)}
                >
                  <span className="workspace-row-icon rose">
                    <Bell size={19} />
                  </span>
                  <span className="workspace-row-copy">
                    <strong>{r.title}</strong>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
              {overview?.announcements?.map((a: any) => (
                <button
                  key={a.id}
                  className="workspace-row"
                  onClick={() => navigate("/announcements")}
                >
                  <span className="workspace-row-icon lavender">
                    <Bell size={19} />
                  </span>
                  <span className="workspace-row-copy">
                    <strong>{a.title}</strong>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </>
          )}
        </div>
      </section>
      <QRCameraScannerModal
        isOpen={scanner}
        onClose={() => setScanner(false)}
        onScan={scan}
        defaultMode={mode}
        isLoading={busy}
      />
    </main>
  );
}
