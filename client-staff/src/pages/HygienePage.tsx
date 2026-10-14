import { PageHeader } from "../components/PageHeader";
import { useMemoryDraft, useSessionDraft } from "../utils/useSessionDraft";
import { LoadFailure } from "../components/LoadFailure";
import { RouteLoading } from "../components/RouteLoading";
import { businessDate } from "../utils/businessDate";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { staffApi } from "../services/api";
import { useAuthStore } from "../stores/auth";
import { CheckCircle, Clock, Camera, ShieldCheck } from "lucide-react";

export function HygienePage() {
  const { t } = useTranslation();
  useAuthStore();
  const actionRef = useRef<HTMLDivElement>(null);

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmTask, setConfirmTask] = useSessionDraft<any>(
    "hygiene.confirmTask",
    null,
  );
  const [issueTaskId, setIssueTaskId] = useSessionDraft<string | null>(
    "hygiene.issueTask",
    null,
  );
  const [issueDescription, setIssueDescription] = useSessionDraft(
    `hygiene.issue.${issueTaskId}`,
    "",
  );
  const [skipTaskId, setSkipTaskId] = useSessionDraft<string | null>(
    "hygiene.skipTask",
    null,
  );
  const [skipNote, setSkipNote] = useSessionDraft(
    `hygiene.skip.${skipTaskId}`,
    "",
  );
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [photos, setPhotos] = useMemoryDraft<Record<string, File>>(
    "hygiene.photos",
    {},
  );
  useEffect(() => { if (confirmTask || skipTaskId || issueTaskId) { actionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); actionRef.current?.focus({ preventScroll: true }); } }, [confirmTask, skipTaskId, issueTaskId]);
  const [selectedDate] = useState(businessDate());

  const loadTasks = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await staffApi.getMyTasks(selectedDate);
      setTasks(data?.data?.list || []);
    } catch (err) {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [selectedDate]);

  const handleStart = async (taskId: string) => {
    setBusy(taskId);
    setActionError("");
    try {
      await staffApi.startTask(taskId);
      await loadTasks();
    } catch (err: any) {
      setActionError(err.response?.data?.message || t("common.error"));
    } finally {
      setBusy(null);
    }
  };
  const handleComplete = async (task: any) => {
    if (task.template?.photoRequired && !photos[task.id]) {
      setActionError(t("hygiene.photoRequired"));
      return;
    }
    setBusy(task.id);
    setActionError("");
    try {
      let photoUrl: string | undefined;
      if (photos[task.id]) {
        const upload = await staffApi.uploadAttachment(photos[task.id]);
        photoUrl = upload.data?.urls?.[0];
        if (!photoUrl) throw new Error("Upload failed");
      }
      await staffApi.completeTask(task.id, { photoUrl });
      setConfirmTask(null);
      setPhotos((previous) => {
        const next = { ...previous };
        delete next[task.id];
        return next;
      });
      await loadTasks();
    } catch (err: any) {
      setActionError(err.response?.data?.message || t("common.error"));
    } finally {
      setBusy(null);
    }
  };
  const handleSkip = async (taskId: string) => {
    const note = skipNote.trim();
    if (!note) return;
    setBusy(taskId);
    setActionError("");
    try {
      await staffApi.skipTask(taskId, note);
      setSkipTaskId(null);
      setSkipNote("");
      await loadTasks();
    } catch (err: any) {
      setActionError(err.response?.data?.message || t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const pendingTasks = tasks.filter((t) =>
    ["pending", "in_progress", "overdue"].includes(t.status),
  );
  const completedTasks = tasks.filter((t) =>
    [
      "completed",
      "approved",
      "pending_approval",
      "skipped",
      "rejected",
    ].includes(t.status),
  );

  if (loading && !busy) return <RouteLoading />;
  if (loadFailed) return <LoadFailure retry={loadTasks} />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <PageHeader
        title={t("hygiene.title")}
        subtitle={`${selectedDate} · ${t("ui.todoHint")}`}
        icon={ShieldCheck}
      />

      {actionError && (
        <div role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-red-700">
          {actionError}
        </div>
      )}
      <div ref={actionRef} tabIndex={-1} className="outline-none">
      {(confirmTask || skipTaskId) && (
        <section
          role="form"
          aria-label={t("common.confirm")}
          className="m-4 rounded-xl border border-primary bg-white p-4"
        >
          <h2 className="font-bold">
            {confirmTask
              ? t("hygiene.confirmComplete")
              : t("hygiene.skipReasonPlaceholder")}
          </h2>
          {confirmTask && <p className="my-2">{confirmTask.name}</p>}
          {skipTaskId && (
            <textarea
              aria-label={t("hygiene.skipReasonPlaceholder")}
              value={skipNote}
              onChange={(e) => setSkipNote(e.target.value)}
              className="mt-2 w-full rounded-lg border p-2"
            />
          )}
          <div className="mt-3 flex gap-3">
            <button
              disabled={!!busy}
              onClick={() => {
                setConfirmTask(null);
                setSkipTaskId(null);
              }}
              className="rounded-lg border px-4 py-2"
            >
              {t("common.cancel")}
            </button>
            <button
              disabled={!!busy || (!!skipTaskId && !skipNote.trim())}
              onClick={() =>
                confirmTask
                  ? handleComplete(confirmTask)
                  : handleSkip(skipTaskId!)
              }
              className="rounded-lg bg-primary px-4 py-2 text-white"
            >
              {busy ? t("common.submitting") : t("common.submit")}
            </button>
          </div>
        </section>
      )}
      </div>
      {/* Summary */}
      <div className="hygiene-summary">
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{tasks.length}</div>
          <div className="text-sm text-gray-500">{t("hygiene.totalTasks")}</div>
        </div>
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-500">
            {pendingTasks.length}
          </div>
          <div className="text-sm text-gray-500">{t("hygiene.toDo")}</div>
        </div>
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-500">
            {
              completedTasks.filter((task) =>
                ["completed", "approved"].includes(task.status),
              ).length
            }
          </div>
          <div className="text-sm text-gray-500">{t("hygiene.done")}</div>
        </div>
      </div>

      <p className="px-4 pb-3">
        {t("workspace.pendingReview")}:{" "}
        {tasks.filter((task) => task.status === "pending_approval").length}
      </p>
      {issueTaskId && (
        <form
          ref={el => { if (issueTaskId && el) { el.scrollIntoView({ block: "center" }); el.querySelector("textarea")?.focus({ preventScroll: true }); } }}
          className="mx-4 p-4 bg-white rounded-xl space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(issueTaskId);
            try {
              await staffApi.reportTaskIssue(issueTaskId, issueDescription);
              setIssueTaskId(null);
              setIssueDescription("");
              await loadTasks();
            } catch (err: any) {
              setActionError(err.response?.data?.message || t("common.error"));
            } finally {
              setBusy(null);
            }
          }}
        >
          <h2>{t("workspace.issue")} · {tasks.find(task => task.id === issueTaskId)?.name}</h2>
          <textarea
            required
            className="w-full border p-2"
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
          />
          <button
            disabled={!!busy || !issueDescription.trim()}
            className="bg-primary text-white p-2 rounded"
          >
            {t("common.submit")}
          </button>
          <button type="button" disabled={!!busy} className="p-3 border rounded-lg" onClick={() => setIssueTaskId(null)}>{t("common.cancel")}</button>
        </form>
      )}
      {/* Pending Tasks */}
      <div className="px-4">
        <h2 className="text-base font-medium text-gray-700 mb-3">
          {t("hygiene.pending")}
        </h2>

        {pendingTasks.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">
            <p>{t("hygiene.noTasks")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingTasks.map((task) => (
              <div key={task.id} className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-sm">
                        {t("hygiene.area")}: {task.area || task.areaCode}
                      </span>
                      <span className="text-base font-medium">{task.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-base text-gray-500 mt-2">
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {task.time}
                      </span>
                      {task.template?.photoRequired && (
                        <span className="flex items-center gap-1 text-orange-500">
                          <Camera size={14} />
                          {t("hygiene.photoRequired")}
                        </span>
                      )}
                    </div>
                    {task.template?.standard && (
                      <div className="mt-2 text-base text-gray-600 bg-gray-50 p-2 rounded">
                        {t("hygiene.standard")}: {task.template.standard}
                      </div>
                    )}
                  </div>
                  {task.status === "in_progress" &&
                    task.template?.photoRequired && (
                      <label className="text-sm text-gray-600">
                        {t("hygiene.photoRequired")}
                        <input
                          aria-label={t("hygiene.photoRequired")}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={!!busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            setPhotos((prev) => {
                              const next = { ...prev };
                              if (file) next[task.id] = file;
                              else delete next[task.id];
                              return next;
                            });
                          }}
                          className="max-w-40 block"
                        />
                      </label>
                    )}
                  <div className="hygiene-task-actions">
                    <button
                      disabled={!!busy}
                      className="hygiene-issue-button"
                      onClick={() => (() => { setConfirmTask(null); setSkipTaskId(null); setIssueTaskId(task.id); })()}
                    >
                      {t("workspace.issue")}
                    </button>
                    <button
                      disabled={!!busy}
                      aria-label={
                        task.status !== "in_progress"
                          ? t("hygiene.startTask")
                          : t("hygiene.confirmComplete")
                      }
                      onClick={() =>
                        task.status !== "in_progress"
                          ? handleStart(task.id)
                          : (() => { setSkipTaskId(null); setIssueTaskId(null); setConfirmTask(task); })()
                      }
                      className="hygiene-submit-button"
                    >
                      {task.status !== "in_progress"
                        ? t("hygiene.startTask")
                        : t("ui.complete")}
                    </button>
                    <button
                      disabled={!!busy}
                      aria-label={t("hygiene.skipReasonPlaceholder")}
                      onClick={() => {
                        setConfirmTask(null); setIssueTaskId(null); setSkipTaskId(task.id);
                        setSkipNote("");
                      }}
                      className="hygiene-skip-button"
                    >
                      {t("ui.skip")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="text-base font-medium text-gray-700 mb-3">
            {t("ui.submissions")}
          </h2>
          <div className="space-y-2">
            {completedTasks.map((task) => (
              <div
                key={task.id}
                className="bg-gray-100 rounded-lg p-3 flex items-center gap-3"
              >
                {task.status === "pending_approval" ? (
                  <Clock size={18} className="text-amber-500 shrink-0" />
                ) : (
                  <CheckCircle size={18} className="text-green-500 shrink-0" />
                )}
                <span className="text-base text-gray-600">
                  {task.area || task.areaCode} - {task.name} ·{" "}
                  {t(`hygiene.state_${task.status}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
