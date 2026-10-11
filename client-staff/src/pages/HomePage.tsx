import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ScanLine, Bell, RefreshCw } from "lucide-react";
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
  return (
    <main className="space-y-4 pb-4">
      <header className="bg-primary text-white p-4 rounded-b-2xl flex items-center justify-between">
        <div>
          <h1 className="font-bold text-xl">{user?.name}</h1>
          <p className="text-sm">
            {overview?.staff?.storeName || user?.storeName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Language"
            value={i18n.language}
            onChange={(e) => {
              i18n.changeLanguage(e.target.value);
              localStorage.setItem("bubble-tea-language", e.target.value);
            }}
            className="bg-white/20 rounded p-2"
          >
            <option className="text-black" value="id">
              ID
            </option>
            <option className="text-black" value="zh">
              中文
            </option>
            <option className="text-black" value="en">
              EN
            </option>
          </select>
          <button
            aria-label={t("workspace.scan")}
            disabled={loading || failed.includes("attendance")}
            onClick={() => setScanner(true)}
            className="p-3 bg-white/20 rounded-xl"
          >
            <ScanLine size={26} />
          </button>
        </div>
      </header>
      <div className="px-4 space-y-4">
        {message && (
          <p role="status" className="p-3 bg-white rounded">
            {message}
          </p>
        )}
        {(failed.length > 0 || dashboard?.failedModules?.length > 0) && (
          <div role="alert" className="p-3 bg-amber-50 rounded-xl">
            {t("common.loadFailed")}{" "}
            <button onClick={refresh} className="text-primary font-bold">
              {t("common.retry")}
            </button>
          </div>
        )}
        <div className="flex justify-between items-center">
          <h2 className="font-bold">
            {t("workspace.monthlyBoard")} {overview?.month}
          </h2>
          <button
            aria-label={t("common.retry")}
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={20} />
          </button>
        </div>
        <section className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/attendance")}
            className="bg-white rounded-xl p-4 text-left"
          >
            <p className="text-sm text-gray-500">{t("home.presentDays")}</p>
            <strong className="text-2xl">
              {dashboard?.workDays ?? overview?.attendance?.presentDays ?? "—"}
            </strong>
          </button>
          <button
            onClick={() => navigate("/attendance/appeals")}
            className="bg-white rounded-xl p-4 text-left"
          >
            <p className="text-sm text-gray-500">
              {t("workspace.lateMinutes")}
            </p>
            <strong className="text-2xl">
              {dashboard?.lateMinutes ?? "—"}
            </strong>
          </button>
          <button
            onClick={() => navigate("/points")}
            className="bg-white rounded-xl p-4 text-left"
          >
            <p>{t("home.rewardsPenalties")}</p>
            <p>
              {t("workspace.rewardCount")}:{" "}
              {overview || dashboard
                ? (overview?.pointsAndDiscipline?.rewardsCount || 0) +
                  (dashboard?.rewardsCount || 0)
                : "—"}{" "}
              · {t("workspace.penaltyCount")}:{" "}
              {overview || dashboard
                ? (overview?.pointsAndDiscipline?.penaltiesCount || 0) +
                  (dashboard?.penaltiesCount || 0)
                : "—"}
            </p>
          </button>
          <button
            onClick={() => navigate("/attendance")}
            className="bg-white rounded-xl p-4 text-left"
          >
            <p>{t("nav.attendance")}</p>
            <strong>
              {working
                ? t("home.working")
                : attendance
                  ? t("attendance.checkOut")
                  : t("home.notCheckedIn")}
            </strong>
          </button>
        </section>
        <section className="bg-white p-4 rounded-xl space-y-3">
          <h2 className="font-bold flex gap-2">
            <Bell size={19} />
            {t("workspace.reminders")}
          </h2>
          <button
            className="block text-left w-full"
            onClick={() => navigate("/schedule")}
          >
            {t("home.todayScheduleTitle")}:{" "}
            {shift
              ? `${shift.shiftName} ${shift.startTime}–${shift.endTime}`
              : t("home.noShiftToday")}{" "}
            →
          </button>
          {dashboard && (
            <>
              <button
                className="block w-full text-left"
                onClick={() => navigate("/hygiene")}
              >
                {t("hygiene.title")}: {t("workspace.todo")}{" "}
                {dashboard.hygiene.todo} · {t("workspace.pendingReview")}{" "}
                {dashboard.hygiene.pendingReview} →
              </button>
              <button
                className="block w-full text-left"
                onClick={() => navigate("/training")}
              >
                {t("home.training")}: {dashboard.training} →
              </button>
              <button
                className="block w-full text-left"
                onClick={() => navigate("/shift-swap")}
              >
                {t("workspace.swapConfirm")}: {dashboard.swap} →
              </button>
            </>
          )}
          {dashboard?.reminders?.slice(0, 8).map((r: any) => (
            <button
              key={r.id}
              className="block text-left w-full border-t pt-2"
              onClick={() => navigate(r.url)}
            >
              {r.title} →
            </button>
          ))}
          {overview?.announcements?.map((a: any) => (
            <button
              key={a.id}
              className="block text-left w-full border-t pt-2"
              onClick={() => navigate("/announcements")}
            >
              {a.title} →
            </button>
          ))}
        </section>
        <EmployeeActions />
      </div>
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
