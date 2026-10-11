import { PageHeader } from "../components/PageHeader";
import { ShieldCheck, FolderLock } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { employeeApi } from "../services/api";
import { useSessionDraft } from "../utils/useSessionDraft";
function UploadFiles({
  files,
  onChange,
}: {
  files: string[];
  onChange: (ids: string[]) => void;
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
            setBusy(true);
            setError("");
            try {
              const selected = [...(e.target.files || [])];
              if (selected.length + files.length > 5)
                throw new Error(t("workspace.maxFiles"));
              const ids = [];
              for (const f of selected) {
                ids.push(await employeeApi.upload(f));
              }
              onChange([...files, ...ids]);
            } catch (err: any) {
              setError(err.response?.data?.message || err.message);
            } finally {
              setBusy(false);
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
          <button
            type="button"
            onClick={() =>
              employeeApi.file(id).catch(() => setError(t("common.loadFailed")))
            }
            className="text-primary"
          >
            {t("workspace.viewFile")}
          </button>
          <button
            type="button"
            className="p-2"
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
    [busy, setBusy] = useState(false);
  const [draft, setDraft, clear] = useSessionDraft("appeal", {
    attendanceId: "",
    reason: "",
    files: [] as string[],
    requestId: crypto.randomUUID(),
  });
  async function load() {
    try {
      setData(await employeeApi.get("/my/attendance"));
      setError("");
    } catch {
      setError(t("common.loadFailed"));
    }
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
      <button onClick={load}>{t("common.retry")}</button>
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
          <UploadFiles
            files={draft.files}
            onChange={(files) => setDraft({ ...draft, files })}
          />
          <button
            disabled={busy || !draft.files.length}
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
    [error, setError] = useState("");
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
    try {
      setRecords(await employeeApi.get("/my/profile-submissions"));
      setError("");
    } catch {
      setError(t("common.loadFailed"));
    }
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
      <button onClick={load}>{t("common.retry")}</button>
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
              <button
                key={id}
                onClick={() =>
                  employeeApi
                    .file(id)
                    .catch(() => setError(t("common.loadFailed")))
                }
              >
                {t("workspace.viewFile")}
              </button>
            ))}
          </section>
        ))}
      <form
        className="bg-white p-4 rounded-xl space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
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
        <UploadFiles
          files={draft.files}
          onChange={(files) => setDraft({ ...draft, files })}
        />
        <button
          disabled={busy || (draft.kind === "ktp" && !draft.files.length)}
          className="p-3 bg-primary text-white rounded-xl"
        >
          {t("common.submit")}
        </button>
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
