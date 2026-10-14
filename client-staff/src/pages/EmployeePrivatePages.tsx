import { EmployeeFile } from "../components/EmployeeFile";
import { PageHeader } from "../components/PageHeader";
import { ShieldCheck, FolderLock } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { employeeApi } from "../services/api";
import { useSessionDraft } from "../utils/useSessionDraft";
function UploadFiles({
  files,
  onChange,
  onBusyChange,
}: {
  files: string[];
  onChange: (ids: string[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useTranslation(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <label>
        {t("workspace.evidence")}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,application/pdf"
          disabled={busy}
          onChange={async (e) => {
            setBusy(true); onBusyChange(true);
            setError("");
            try {
              const selected = [...(e.target.files || [])];
              if (selected.length + files.length > 5)
                throw new Error(t("workspace.maxFiles"));
              const ids = [...files];
              for (const f of selected) {
                ids.push(await employeeApi.upload(f));
                onChange([...ids]);
              }
            } catch (err: any) {
              setError(err.response?.data?.message || err.message);
            } finally {
              setBusy(false); onBusyChange(false);
              e.target.value = "";
            }
          }}
          className="block w-full p-3 border rounded"
        />
      </label>
      <p>
        {busy ? t("common.loading") : `${files.length} ${t("workspace.files")}`}
      </p>
      {files.map((id) => (
        <div key={id}>
          <EmployeeFile id={id} />
          <button
            type="button"
            disabled={busy} aria-label={t("common.remove")} className="p-2"
            onClick={() => onChange(files.filter((f) => f !== id))}
          >
            ×
          </button>
        </div>
      ))}
      <p role="alert" className="text-red-600">
        {error}
      </p>
    </div>
  );
}
function RecordStatus({ record }: { record: any }) {
  const { t } = useTranslation();
  return (
    <p className="text-base">
      {t(`workspace.${record.status}`)}{" "}
      {record.reviewNote && `· ${record.reviewNote}`}
      {record.payrollStatus === "pending_review" &&
        ` · ${t("workspace.payrollPending")}`}
    </p>
  );
}
export function EmployeeAppealsPage() {
  const { t } = useTranslation(),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploadBusy, setUploadBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [draft, setDraft, clear] = useSessionDraft("appeal", {
    attendanceId: "",
    reason: "",
    files: [] as string[],
    requestId: crypto.randomUUID(),
  });
  async function load() {
    setLoading(true);
    try {
      setData(await employeeApi.get("/my/attendance"));
      setError("");
    } catch {
      setError(t("common.loadFailed"));
    } finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <main className="p-4 space-y-4">
      <PageHeader
        title={t("workspace.appeals")}
        subtitle={t("workspace.appealHelp")}
        icon={ShieldCheck}
      />
      <p role="alert" className="text-red-600">
        {error}
      </p>
      {error && <button disabled={busy || uploadBusy || loading} onClick={load} className="text-primary-hover">{t("ui.refresh")}</button>}
      {loading && <p role="status">{t("common.loading")}</p>}
      {!loading && !error && data && !data.records?.some((r: any) => r.minutes > 0 && !r.exempt) && <p role="status" className="bg-white p-4 rounded-xl">{t("audit.noAppeals")}</p>}
      {data?.records
        ?.filter((r: any) => r.minutes > 0)
        .map((r: any) => (
          <section key={r.attendanceId} className="bg-white p-4 rounded-xl">
            <p>
              {r.businessDate} · {r.shiftName} · {r.minutes}{" "}
              {t("workspace.minutes")}
            </p>
            <p>{r.exempt ? t("workspace.exempt") : t("workspace.recorded")}</p>
            {!r.exempt && (
              <button
                onClick={() =>
                  setDraft({ ...draft, attendanceId: r.attendanceId })
                }
                className="text-primary"
              >
                {t("workspace.appeal")}
              </button>
            )}
          </section>
        ))}
      {draft.attendanceId && (
        <form
          className="space-y-3 bg-white p-4 rounded-xl"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || uploadBusy) return;
            setBusy(true);
            try {
              await employeeApi.post("/my/appeals", draft);
              clear();
              await load();
            } catch (err: any) {
              setError(err.response?.data?.message || t("common.error"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {
              data?.records?.find(
                (r: any) => r.attendanceId === draft.attendanceId,
              )?.businessDate
            }
          </p>
          <textarea
            required
            placeholder={t("workspace.reason")}
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            className="w-full p-3 border rounded"
          />
          <p className="text-sm text-gray-500">{t("audit.appealRequired")}</p>
          <UploadFiles
            onBusyChange={setUploadBusy}
            files={draft.files}
            onChange={(files) => setDraft({ ...draft, files })}
          />
          <button
            disabled={busy || uploadBusy || !draft.reason.trim() || !draft.files.length}
            className="p-3 bg-primary text-white rounded-xl"
          >
            {t("common.submit")}
          </button>
        </form>
      )}
      {data?.appeals?.map((r: any) => (
        <section key={r.id} className="bg-white p-4 rounded-xl">
          <p>{r.reason}</p>
          <RecordStatus
            record={{
              ...r,
              payrollStatus: data?.payrollIssues?.some(
                (issue: any) => issue.month === r.month,
              )
                ? "pending_review"
                : undefined,
            }}
          />
        </section>
      ))}
    </main>
  );
}
export function EmployeeDocumentsPage() {
  const { t } = useTranslation(),
    [records, setRecords] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uploadBusy, setUploadBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [draft, setDraft, clear] = useSessionDraft("profile", {
    requestId: crypto.randomUUID(),
    kind: "ktp",
    files: [] as string[],
    data: {
      number: "",
      bankName: "",
      bankAccount: "",
      email: "",
      address: "",
      emergencyContact: "",
      emergencyPhone: "",
    },
  });
  async function load() {
    setLoading(true);
    try {
      setRecords(await employeeApi.get("/my/profile-submissions"));
      setError("");
    } catch {
      setError(t("common.loadFailed"));
    } finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
  }, []);
  const fields =
    draft.kind === "ktp"
      ? ["number"]
      : draft.kind === "bank"
        ? ["bankName", "bankAccount"]
        : ["email", "address", "emergencyContact", "emergencyPhone"];
  return (
    <main className="p-4 space-y-4">
      <PageHeader
        title={t("workspace.documents")}
        subtitle={t("workspace.profileHelp")}
        icon={FolderLock}
      />
      <p role="alert" className="text-red-600">
        {error}
      </p>
      {error && <button disabled={busy || uploadBusy || loading} onClick={load} className="text-primary-hover">{t("ui.refresh")}</button>}
      {loading && <p role="status">{t("common.loading")}</p>}
      {records?.official &&
        Object.entries(records.official).map(([kind, v]: any) => (
          <section key={kind} className="p-4 rounded-xl bg-white">
            <h2>
              {t(`workspace.${kind}`)} · {t("workspace.approved")}
            </h2>
            {Object.entries(v.data).map(([k, value]: any) => (
              <p key={k}>
                {t(`workspace.${k}`)}: {value}
              </p>
            ))}
            {v.files.map((id: string) => (
              <EmployeeFile key={id} id={id} />
            ))}
          </section>
        ))}
      <form
        className="bg-white p-4 rounded-xl space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || uploadBusy) return;
          setBusy(true);
          setError("");
          try {
            const data = Object.fromEntries(
              fields
                .map((k) => [k, (draft.data as any)[k]])
                .filter(([, v]) => v),
            );
            await employeeApi.post("/my/profile-submissions", {
              ...draft,
              data,
            });
            clear();
            await load();
          } catch (err: any) {
            setError(err.response?.data?.message || t("common.error"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || uploadBusy} className="space-y-3">
        <select
          value={draft.kind}
          onChange={(e) =>
            setDraft({
              ...draft,
              kind: e.target.value,
              requestId: crypto.randomUUID(),
            })
          }
          className="w-full border p-3 rounded"
        >
          {["ktp", "bank", "personal"].map((k) => (
            <option key={k} value={k}>
              {t(`workspace.${k}`)}
            </option>
          ))}
        </select>
        {fields.map((k) => (
          <label key={k} className="block">
            {t(`workspace.${k}`)}
            <input
              required={draft.kind !== "personal"}
              type={k === "email" ? "email" : "text"}
              value={(draft.data as any)[k]}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  data: { ...draft.data, [k]: e.target.value },
                })
              }
              className="block w-full p-3 border rounded"
            />
          </label>
        ))}
        <p className="text-sm text-gray-500">{t(draft.kind === "ktp" ? "audit.ktpRequired" : "audit.optionalFiles")}</p>
        <UploadFiles
            onBusyChange={setUploadBusy}
          files={draft.files}
          onChange={(files) => setDraft({ ...draft, files })}
        />
        <button
          disabled={busy || uploadBusy || (draft.kind === "ktp" && !draft.files.length)}
          className="p-3 bg-primary text-white rounded-xl"
        >
          {t("common.submit")}
        </button>
        </fieldset>
      </form>
      {records?.submissions?.map((r: any) => (
        <section key={r.id} className="bg-white rounded-xl p-4">
          <h2>{t(`workspace.${r.kind}`)}</h2>
          <RecordStatus record={r} />
        </section>
      ))}
    </main>
  );
}
