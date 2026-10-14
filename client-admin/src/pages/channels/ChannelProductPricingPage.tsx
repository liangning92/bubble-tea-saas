import { useEmployeePermission } from "../../contexts/EmployeeAccess";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { channelApi } from "../../services/api";
import { formatCurrency } from "../../utils/helpers";
import { useAuthStore } from "../../stores/auth";
import { AdminDialog } from "../../components/AdminDialog";
import { useMarketingCopy } from "../../components/marketing/MarketingLayout";
type Draft = { percent: string; enabled: boolean };
export function ChannelProductPricingPage() {
  const canWrite = useEmployeePermission("channels.write");
  const { t } = useTranslation(),
    l = useMarketingCopy(),
    client = useQueryClient(),
    storeId = useAuthStore((s) => s.user?.storeId);
  const [channel, setChannel] = useState(""),
    [search, setSearch] = useState(""),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [saved, setSaved] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [bulk, setBulk] = useState<number | null>(null);
  const channels = useQuery({
    queryKey: ["channels", storeId],
    queryFn: () => channelApi.list(storeId || undefined),
  });
  const query = useQuery({
    queryKey: ["channel-products", storeId, channel],
    queryFn: () => channelApi.getProductPrices(channel),
    enabled: !!channel,
  });
  const products = query.data?.data?.data?.list || [],
    filtered = products.filter(
      (p: any) =>
        !search ||
        (p.productName + " " + p.productCode)
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const draft = (p: any): Draft =>
    drafts[p.productId] || {
      percent: String(Math.round(p.priceAdjustment * 10000) / 100),
      enabled: p.enabled,
    };
  const valid = (d: Draft) =>
    d.percent.trim() !== "" &&
    Number.isFinite(Number(d.percent)) &&
    Number(d.percent) >= 0 &&
    Number(d.percent) <= 1000;
  const update = (p: any, data: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [p.productId]: { ...draft(p), ...data } }));
    setSaved((prev) => prev.filter((id) => id !== p.productId));
    setErrors((prev) => ({ ...prev, [p.productId]: "" }));
  };
  async function save(ids: string[]) {
    setBusy(true);
    try {
      for (const id of ids) {
        const d = drafts[id];
        if (!d) continue;
        if (!valid(d)) {
          setErrors((e) => ({
            ...e,
            [id]: l(
              "请输入0至1000的价格比例",
              "Enter a price ratio from 0 to 1000",
              "Masukkan rasio harga 0 hingga 1000",
            ),
          }));
          continue;
        }
        try {
          await channelApi.setProductPrice(channel, id, {
            priceAdjustment: Number(d.percent) / 100,
            enabled: d.enabled,
          });
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setSaved((prev) => [...prev, id]);
          setErrors((e) => ({ ...e, [id]: "" }));
        } catch (e: any) {
          setErrors((prev) => ({
            ...prev,
            [id]:
              e.response?.data?.message ||
              l(
                "保存失败，请重试",
                "Save failed. Please retry.",
                "Gagal menyimpan. Coba lagi.",
              ),
          }));
        }
      }
      await client.invalidateQueries({
        queryKey: ["channel-products", storeId, channel],
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4 min-w-0">
      <div className="card space-y-3">
        <h2 className="font-semibold">
          {l(
            "渠道商品定价",
            "Channel product pricing",
            "Harga produk per kanal",
          )}
        </h2>
        <p className="text-sm text-gray-500">
          {l(
            "100%等于基础价。修改先保存为草稿，确认价格后再保存；批量设置仅影响当前筛选商品。",
            "100% equals the base price. Review drafts before saving; bulk edits affect only filtered products.",
            "100% sama dengan harga dasar. Tinjau draf sebelum menyimpan; edit massal hanya untuk produk yang difilter.",
          )}
        </p>
        <select
          aria-label={t("channels.selectChannel")}
          className="input sm:max-w-xs"
          value={channel}
          disabled={busy}
          onChange={(e) => {
            if (
              Object.keys(drafts).length &&
              !confirm(
                l(
                  "放弃未保存的调价？",
                  "Discard unsaved price edits?",
                  "Buang perubahan harga?",
                ),
              )
            )
              return;
            setChannel(e.target.value);
            setDrafts({});
            setErrors({});
            setSaved([]);
          }}
        >
          <option value="">{t("channels.selectChannel")}</option>
          {(channels.data?.data?.data?.list || []).map((ch: any) => (
            <option key={ch.id} value={ch.id}>
              {ch.name}
            </option>
          ))}
        </select>
        {channels.isError && (
          <p role="alert">
            {t("common.error")}{" "}
            <button className="btn" onClick={() => channels.refetch()}>
              {t("common.refresh")}
            </button>
          </p>
        )}
      </div>
      {!channel ? (
        <p className="card text-gray-500">
          {l(
            "选择渠道后查看商品价格。",
            "Choose a channel to view prices.",
            "Pilih kanal untuk melihat harga.",
          )}
        </p>
      ) : (
        <>
          <div className="card flex flex-wrap items-center gap-3">
            <input
              type="search"
              className="input flex-1 min-w-0 sm:min-w-48"
              aria-label={t("common.search")}
              placeholder={t("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={!canWrite || busy || !Object.keys(drafts).length}
              onClick={() => save(Object.keys(drafts))}
            >
              {busy
                ? t("common.loading")
                : l("保存修改", "Save changes", "Simpan perubahan")}{" "}
              ({Object.keys(drafts).length})
            </button>
            <div className="flex flex-wrap gap-2 w-full">
              {[-20, -10, -5, 5, 10, 20].map((pct) => (
                <button
                  className="btn btn-sm"
                  key={pct}
                  disabled={!canWrite || busy || !filtered.length}
                  onClick={() => setBulk(pct)}
                >
                  {pct > 0 ? "+" : ""}
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          {query.isError ? (
            <div role="alert" className="card">
              {t("common.error")}{" "}
              <button className="btn" onClick={() => query.refetch()}>
                {t("common.refresh")}
              </button>
            </div>
          ) : query.isLoading ? (
            <p>{t("common.loading")}</p>
          ) : !filtered.length ? (
            <p className="card text-gray-500">{t("common.noData")}</p>
          ) : (
            <div className="grid xl:grid-cols-2 gap-3">
              {filtered.map((p: any) => {
                const d = draft(p),
                  dirty = !!drafts[p.productId];
                return (
                  <section key={p.productId} className="card space-y-3 !p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="font-semibold">
                        {p.productName}
                        <span className="block text-xs text-gray-500">
                          {p.productCode} · {p.category}
                        </span>
                      </h3>
                      <span className="badge badge-info">
                        {dirty
                          ? l("待保存", "Unsaved", "Belum disimpan")
                          : saved.includes(p.productId)
                            ? t("common.saved")
                            : l("当前价格", "Current price", "Harga saat ini")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <p>
                        {l("基础价", "Base price", "Harga dasar")}
                        <strong className="block">
                          {formatCurrency(p.basePrice)}
                        </strong>
                      </p>
                      <p>
                        {l(
                          "已保存渠道价",
                          "Saved channel price",
                          "Harga kanal tersimpan",
                        )}
                        <strong className="block">
                          {formatCurrency(p.finalPrice)}
                        </strong>
                      </p>
                    </div>
                    <label className="block text-sm">
                      {l(
                        "基础价比例（%）",
                        "Base price ratio (%)",
                        "Rasio harga dasar (%)",
                      )}
                      <input
                        aria-label={
                          p.productName +
                          " " +
                          l("价格比例", "Price ratio", "Rasio harga")
                        }
                        className="input mt-1"
                        type="number"
                        min={0}
                        max={1000}
                        step="0.01"
                        disabled={!canWrite || busy}
                        value={d.percent}
                        onChange={(e) => update(p, { percent: e.target.value })}
                      />
                    </label>
                    <p className="text-sm text-primary">
                      {l("保存后", "After saving", "Setelah disimpan")}:{" "}
                      {valid(d)
                        ? formatCurrency(
                            Math.round((p.basePrice * Number(d.percent)) / 100),
                          )
                        : "—"}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-sm flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!canWrite || busy}
                          checked={d.enabled}
                          onChange={(e) =>
                            update(p, { enabled: e.target.checked })
                          }
                        />
                        {t("products.active")}
                      </label>
                      <button
                        className="btn-primary ml-auto"
                        disabled={!canWrite || busy || !dirty || !valid(d)}
                        onClick={() => save([p.productId])}
                      >
                        {t("common.save")}
                      </button>
                      <button
                        className="btn"
                        disabled={!canWrite || busy || !dirty}
                        onClick={() => {
                          setDrafts((prev) => {
                            const next = { ...prev };
                            delete next[p.productId];
                            return next;
                          });
                          setErrors((prev) => ({ ...prev, [p.productId]: "" }));
                        }}
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                    {errors[p.productId] && (
                      <p role="alert" className="text-sm text-red-600">
                        {errors[p.productId]}
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
      {bulk !== null && (
        <AdminDialog
          title={l(
            "批量调价预览",
            "Bulk price preview",
            "Pratinjau harga massal",
          )}
          onClose={() => setBulk(null)}
        >
          <div className="p-4 sm:p-6 space-y-4">
            <h2 className="font-semibold">
              {l(
                "批量调价预览",
                "Bulk price preview",
                "Pratinjau harga massal",
              )}
            </h2>
            <p>
              {filtered.length}{" "}
              {l(
                "个商品，将设为基础价的",
                "products will use this base price ratio:",
                "produk akan memakai rasio harga dasar:",
              )}{" "}
              {100 + bulk}%
            </p>
            <p className="text-sm text-gray-500">
              {l(
                "只填入待保存草稿；启用状态保留。确认后仍须点击保存修改。",
                "This fills drafts only and preserves enabled states. Save changes after reviewing.",
                "Hanya mengisi draf dan mempertahankan status aktif. Simpan setelah ditinjau.",
              )}
            </p>
            <div className="max-h-72 overflow-auto space-y-2">
              {filtered.map((p: any) => (
                <p
                  key={p.productId}
                  className="flex justify-between gap-3 text-sm"
                >
                  <span>{p.productName}</span>
                  <span>
                    {formatCurrency(p.finalPrice)} →{" "}
                    {formatCurrency(
                      Math.round((p.basePrice * (100 + bulk)) / 100),
                    )}
                  </span>
                </p>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                className="btn-primary"
                onClick={() => {
                  setDrafts((prev) => {
                    const next = { ...prev };
                    filtered.forEach(
                      (p: any) =>
                        (next[p.productId] = {
                          percent: String(100 + bulk),
                          enabled: draft(p).enabled,
                        }),
                    );
                    return next;
                  });
                  setBulk(null);
                }}
              >
                {l("填入草稿", "Fill drafts", "Isi draf")}
              </button>
              <button className="btn" onClick={() => setBulk(null)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </div>
  );
}
