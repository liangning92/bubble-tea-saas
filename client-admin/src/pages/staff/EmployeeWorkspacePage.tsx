import { LocalizedDateTimeInput } from '../../components/LocalizedDateTimeInput'
import { useEffect, useState } from "react";
import api from "../../services/api";
import { useAuthStore } from "../../stores/auth";
export function EmployeeWorkspacePage() {
  const user = useAuthStore((s) => s.user),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<any>(null);
  const [rule, setRule] = useState<any>({
    month: new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7),
    enabled: false,
    mode: "tiers",
    tiers: [{ minutes: 30, amount: 20000 }],
    intervalMinutes: 30,
    intervalAmount: 20000,
    expectedVersion: null,
    confirmRecalculate: false,
  });
  const [refundMonths, setRefundMonths] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function load() {
    try {
      const res = await api.get("/staff-work/admin");
      setData(res.data.data);
      setError("");
    } catch (e: any) {
      setError(e.response?.data?.message || "加载失败，请重试");
    }
  }
  useEffect(() => {
    if (user?.role === "admin") void load();
  }, [user?.role]);
  if (user?.role !== "admin") return <p>仅管理员可审核申诉和个人资料。</p>;
  async function review(kind: string, id: string, approved: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.put(`/staff-work/admin/${kind}/${id}/review`, {
        approved,
        note: notes[id] || "",
      });
      await load();
    } catch (e: any) {
      setError(e.response?.data?.message || "审核失败");
    } finally {
      setBusy(false);
    }
  }
  async function file(id: string) {
    try {
      const result = await api.get(`/staff-work/files/${id}`, {
          responseType: "blob",
        }),
        url = URL.createObjectURL(result.data),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "document" +
        (result.data.type === "application/pdf"
          ? ".pdf"
          : result.data.type === "image/png"
            ? ".png"
            : ".jpg");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      setError("附件加载失败");
    }
  }
  return (
    <main className="space-y-6 p-4">
      <h1 className="text-xl font-bold">员工工作台审核与迟到规则</h1>
      <p role="alert" className="text-red-600">
        {error}
      </p>
      <button onClick={load}>刷新</button>
      <section className="bg-white p-4 rounded-xl space-y-3">
        <h2 className="font-bold">月度迟到处罚（金额 Rp）</h2>
        <p>
          按实际班次开始时间累计完整分钟，不使用宽限期。规则首次启用前的记录不会追加罚款。
        </p>
        <label>
          生效月份{" "}
          <LocalizedDateTimeInput
            type="month"
            value={rule.month}
            onChange={(e) => {
              const old = data?.rules?.find(
                (r: any) => r.month === e.target.value,
              );
              setRule(
                old
                  ? {
                      ...old,
                      expectedVersion: old.version,
                      confirmRecalculate: false,
                    }
                  : {
                      ...rule,
                      month: e.target.value,
                      expectedVersion: null,
                      confirmRecalculate: false,
                    },
              );
              setPreview(null);
            }}
          />
        </label>
        <button
          className="p-2 border"
          onClick={() => {
            const old = data?.rules?.find((r: any) => r.month === rule.month);
            if (old)
              setRule({
                ...old,
                expectedVersion: old.version,
                confirmRecalculate: false,
              });
            setPreview(null);
          }}
        >
          加载本月已保存规则
        </button>
        <label className="block">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
          />{" "}
          启用新累计规则，替代迟到按次扣款
        </label>
        <select
          className="border p-2"
          value={rule.mode}
          onChange={(e) => setRule({ ...rule, mode: e.target.value })}
        >
          <option value="tiers">累计阶梯总金额</option>
          <option value="interval">每累计固定分钟扣款</option>
        </select>
        {rule.mode === "tiers" ? (
          <div>
            {rule.tiers.map((tier: any, i: number) => (
              <div key={i} className="flex gap-2 my-2">
                <label>
                  累计分钟
                  <input
                    type="number"
                    min="1"
                    value={tier.minutes}
                    onChange={(e) =>
                      setRule({
                        ...rule,
                        tiers: rule.tiers.map((v: any, j: number) =>
                          j === i
                            ? { ...v, minutes: Number(e.target.value) }
                            : v,
                        ),
                      })
                    }
                    className="border p-2 w-28"
                  />
                </label>
                <label>
                  总罚款 Rp
                  <input
                    type="number"
                    min="0"
                    value={tier.amount}
                    onChange={(e) =>
                      setRule({
                        ...rule,
                        tiers: rule.tiers.map((v: any, j: number) =>
                          j === i
                            ? { ...v, amount: Number(e.target.value) }
                            : v,
                        ),
                      })
                    }
                    className="border p-2 w-40"
                  />
                </label>
                <button
                  onClick={() =>
                    setRule({
                      ...rule,
                      tiers: rule.tiers.filter((_: any, j: number) => i !== j),
                    })
                  }
                >
                  删除
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setRule({
                  ...rule,
                  tiers: [...rule.tiers, { minutes: 60, amount: 50000 }],
                })
              }
            >
              新增阶梯
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <label>
              每累计分钟
              <input
                type="number"
                min="1"
                value={rule.intervalMinutes}
                onChange={(e) =>
                  setRule({ ...rule, intervalMinutes: Number(e.target.value) })
                }
              />
            </label>
            <label>
              扣款 Rp
              <input
                type="number"
                min="0"
                value={rule.intervalAmount}
                onChange={(e) =>
                  setRule({ ...rule, intervalAmount: Number(e.target.value) })
                }
              />
            </label>
          </div>
        )}
        <button
          disabled={busy}
          className="p-3 border rounded"
          onClick={async () => {
            setBusy(true);
            try {
              setPreview(
                (await api.post("/staff-work/admin/rule-preview", rule)).data
                  .data,
              );
            } catch (e: any) {
              setError(e.response?.data?.message || "预览失败");
            } finally {
              setBusy(false);
            }
          }}
        >
          预览影响
        </button>
        {preview && (
          <div className="space-y-2">
            <p>
              已有考勤员工：{preview.employees} 人。以下为启用范围内的重新核算：
            </p>
            {preview.changes?.map((c: any) => (
              <p key={c.staffId}>
                {c.staffName} · {c.minutes} 分钟 · Rp {c.previousAmount} → Rp{" "}
                {c.amount} · {c.payrollStatus}
              </p>
            ))}
            <label>
              <input
                type="checkbox"
                checked={rule.confirmRecalculate}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    confirmRecalculate: e.target.checked,
                    expectedVersion: preview.current?.version || null,
                    previewToken: preview.previewToken,
                  })
                }
              />
              确认按预览重算
            </label>
            <button
              disabled={busy || !rule.confirmRecalculate}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.put("/staff-work/admin/rule", rule);
                  setPreview(null);
                  await load();
                } catch (e: any) {
                  setError(e.response?.data?.message || "保存失败");
                } finally {
                  setBusy(false);
                }
              }}
              className="p-3 bg-primary text-white rounded"
            >
              保存规则并重算
            </button>
          </div>
        )}
      </section>
      {(["appeal", "profile"] as const).map((kind) => (
        <section key={kind} className="space-y-3">
          <h2 className="font-bold">
            {kind === "appeal" ? "迟到申诉" : "KTP / 个人资料审核"}
          </h2>
          {data?.[kind === "appeal" ? "appeals" : "profiles"]?.map((r: any) => (
            <article key={r.id} className="bg-white p-4 rounded-xl space-y-2">
              <p>
                {r.staffName || r.staffId} · {r.status} · {r.createdAt}
              </p>
              {r.reason && <p>{r.reason}</p>}
              {r.data &&
                Object.entries(r.data).map(([k, v]: any) => (
                  <p key={k}>
                    {k}: {v}
                  </p>
                ))}
              <div>
                {r.files.map((id: string) => (
                  <button
                    key={id}
                    className="p-2 text-primary"
                    onClick={() => file(id)}
                  >
                    查看私密附件
                  </button>
                ))}
              </div>
              {r.status === "pending" ? (
                <>
                  <textarea
                    placeholder="必填：审核说明"
                    value={notes[r.id] || ""}
                    onChange={(e) =>
                      setNotes({ ...notes, [r.id]: e.target.value })
                    }
                    className="w-full border p-2"
                  />
                  <button
                    disabled={busy || !notes[r.id]?.trim()}
                    className="p-2 bg-green-100"
                    onClick={() => review(kind, r.id, true)}
                  >
                    批准
                  </button>
                  <button
                    disabled={busy || !notes[r.id]?.trim()}
                    className="p-2 bg-red-100"
                    onClick={() => review(kind, r.id, false)}
                  >
                    驳回
                  </button>
                </>
              ) : (
                <p>{r.reviewNote}</p>
              )}
            </article>
          ))}
        </section>
      ))}
      <section>
        <h2 className="font-bold">工资待处理</h2>
        {data?.payrollIssues?.map((r: any) => (
          <article className="bg-white p-4 space-y-2" key={r.staffId + r.month}>
            <p>
              {r.staffName || r.staffId} · {r.month} · {r.message}
            </p>
            <label>
              返还月份（原工资已发放时选择未冻结月份）{" "}
              <LocalizedDateTimeInput
                type="month"
                value={refundMonths[r.staffId + r.month] || ""}
                onChange={(e) =>
                  setRefundMonths({
                    ...refundMonths,
                    [r.staffId + r.month]: e.target.value,
                  })
                }
              />
            </label>
            <input
              className="border p-2"
              placeholder="管理员处理说明"
              value={notes[r.staffId + r.month] || ""}
              onChange={(e) =>
                setNotes({ ...notes, [r.staffId + r.month]: e.target.value })
              }
            />
            <button
              disabled={busy || !notes[r.staffId + r.month]?.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.put("/staff-work/admin/payroll-retry", {
                    staffId: r.staffId,
                    month: r.month,
                    refundMonth: refundMonths[r.staffId + r.month] || undefined,
                    note: notes[r.staffId + r.month],
                  });
                  await load();
                } catch (e: any) {
                  setError(e.response?.data?.message || "处理失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              重新核算
            </button>
          </article>
        ))}
      </section>
      <section>
        <h2 className="font-bold">员工自报学习进度（非正式考核通过）</h2>
        {data?.learning?.map((r: any) => (
          <p key={r.staffId + r.course + r.version}>
            {r.staffId} · {r.course} · {r.version} ·{" "}
            {r.completed ? "已学完" : "未完成"} · {r.updatedAt}
          </p>
        ))}
      </section>
    </main>
  );
}
