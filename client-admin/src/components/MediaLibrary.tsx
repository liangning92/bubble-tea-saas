import { formatNumber } from '../utils/numberDisplay'
import { AdminDialog } from "./AdminDialog";
import { useEmployeePermission } from "../contexts/EmployeeAccess";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  mediaUploadError,
  mediaApi,
  MediaAsset,
  MediaScene,
} from "../services/media";
import { receiptMediaUrl } from "../services/api";
import { useAuthStore } from "../stores/auth";

export function MediaPreview({
  asset,
  controls = false,
  large = false,
}: {
  asset: Pick<MediaAsset, "url" | "kind" | "name">;
  controls?: boolean;
  large?: boolean;
}) {
  const url = receiptMediaUrl(asset.url),
    size = large
      ? "w-full max-h-[65dvh] min-h-40 object-contain bg-gray-100"
      : "w-full h-40 object-contain bg-gray-100";
  if (asset.kind === "video")
    return (
      <video
        src={url}
        controls={controls}
        preload="metadata"
        muted
        className={size}
      />
    );
  if (asset.kind === "audio")
    return (
      <div className="h-40 flex flex-col gap-2 items-center justify-center bg-gray-100">
        {!controls&&<span aria-hidden="true" className="text-2xl text-gray-600">♫</span>}
        <audio src={url} controls={controls} preload="metadata" className="w-full" />
      </div>
    );
  return <img src={url} alt={asset.name} loading="lazy" className={size} />;
}
export function MediaLibrary({
  scene = "library",
  max = 10,
  onSelect,
  onClose,
  imagesOnly = false,
}: {
  scene?: MediaScene;
  max?: number;
  onSelect?: (assets: MediaAsset[]) => void;
  onClose?: () => void;
  imagesOnly?: boolean;
}) {
  const { t } = useTranslation(),
    client = useQueryClient(),
    storeId = useAuthStore((s) => s.user?.storeId);
  const canWrite = useEmployeePermission(
    scene === "library" || scene === "tv"
      ? "marketing.write"
      : scene === "product"
        ? "products.write"
        : "orders.create",
  );
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<MediaAsset[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<MediaAsset | null>(null),
    [referencesAsset, setReferencesAsset] = useState<MediaAsset | null>(null),
    [references, setReferences] = useState<any[] | null>(null);
  const [rename, setRename] = useState<MediaAsset | null>(null),
    [name, setName] = useState(""),
    [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const key = ["media", storeId, scene, search, kind, page, imagesOnly];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      mediaApi.list(scene, { search, kind: imagesOnly ? "image" : kind, page }),
  });
  const data = query.data?.data.data;
  useEffect(() => {
    setPage(1);
  }, [search, kind]);
  const invalidate = () =>
    client.invalidateQueries({ queryKey: ["media", storeId] });
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setProgress(null);
    try {
      await fn();
      await invalidate();
    } catch (e: any) {
      setError(t(mediaUploadError(e)));
      if (e.response?.status === 409)
        setReferences(e.response.data?.data?.list || []);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {!onClose && <h1 className="text-xl font-bold">{t("media.title")}</h1>}
      <p className="text-sm text-gray-500">{t("media.limits")}</p>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label={t("media.search")}
          className="input flex-1"
          placeholder={t("media.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
         data-dialog-search="true" />
        <select
          aria-label={t("media.type")}
          className="input w-auto"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">{t("media.all")}</option>
          {(scene === "product" || imagesOnly
            ? ["image"]
            : scene === "library"
              ? ["image", "video", "audio"]
              : ["image", "video"]
          ).map((k) => (
            <option key={k} value={k}>
              {t(`media.${k}`)}
            </option>
          ))}
        </select>
        {canWrite && (
          <label className={`btn btn-primary ${busy ? "opacity-50" : ""}`}>
            {busy ? t("common.loading") : t("media.upload")}
            <input
              disabled={busy}
              type="file"
              multiple
              accept={
                scene === "product" || imagesOnly
                  ? ".jpg,.jpeg,.png,.gif,.webp"
                  : scene === "library"
                    ? ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mp3,.m4a,.wav,.ogg"
                    : ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm"
              }
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                if (files.length)
                  void run(async () => {
                    if (files.length > 10) throw Error();
                    await mediaApi.upload(scene, files, setProgress);
                  });
              }}
            />
          </label>
        )}
      </div>
      {busy && progress !== null && (
        <div role="status" className="space-y-1">
          <p className="text-sm">
            {t("media.upload")} · {formatNumber(progress)}%
          </p>
          <progress
            aria-label={t("media.upload")}
            value={progress}
            max={100}
            className="w-full accent-primary"
          />
        </div>
      )}
      {(error || query.isError) && (
        <div role="alert" className="text-red-600">
          {error || t("media.failed")}
          <button type="button" className="btn" onClick={() => query.refetch()}>
            {t("media.retry")}
          </button>
        </div>
      )}
      {query.isLoading ? (
        <p>{t("common.loading")}</p>
      ) : !data?.list.length ? (
        <p className="p-8 text-center text-gray-500">{t("media.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.list.map((asset: MediaAsset) => (
            <div
              key={asset.id}
              className={`border rounded-xl overflow-hidden ${selected.some((a) => a.id === asset.id) ? "border-primary ring-2 ring-primary" : "border-gray-200"}`}
            >
              <button
                type="button"
                className="w-full"
                aria-label={asset.name}
                onClick={() => {
                  setPreview(asset);
                  setReferences(null);
                }}
              >
                <MediaPreview asset={asset} />
              </button>
              <div className="p-3 space-y-2">
                <p className="font-medium break-all">{asset.name}</p>
                <p className="text-xs text-gray-500">
                  {t(`media.${asset.kind}`)} ·{" "}
                  {asset.size < 1024
                    ? `${asset.size} B`
                    : asset.size < 1024 * 1024
                      ? `${(asset.size / 1024).toFixed(0)} KB`
                      : `${(asset.size / 1024 / 1024).toFixed(0)} MB`}
                </p>
                {onSelect ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={
                      !selected.some((a) => a.id === asset.id) &&
                      selected.length >= max
                    }
                    onClick={() =>
                      setSelected((list) =>
                        list.some((a) => a.id === asset.id)
                          ? list.filter((a) => a.id !== asset.id)
                          : [...list, asset],
                      )
                    }
                  >
                    {t(
                      selected.some((a) => a.id === asset.id)
                        ? "media.deselect"
                        : "media.select",
                    )}
                  </button>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {canWrite && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setRename(asset);
                          setName(asset.name);
                        }}
                      >
                        {t("media.rename")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        void run(async () => {
                          setReferencesAsset(asset);
                          const r = await mediaApi.references(asset.id);
                          setReferences(r.data.data.list);
                        })
                      }
                    >
                      {t("media.references")}
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        className="btn btn-sm text-red-600"
                        onClick={() => setDeleting(asset)}
                      >
                        {t("common.delete")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between items-center">
        <button
          type="button"
          className="btn"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          {t("media.previous")}
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil((data?.total || 0) / 24))}
        </span>
        <button
          type="button"
          className="btn"
          disabled={page * 24 >= (data?.total || 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          {t("media.next")}
        </button>
      </div>
      {onSelect && (
        <div className="admin-dialog-footer"><button
          type="button"
          className="btn btn-primary"
          disabled={!selected.length}
          onClick={() => onSelect(selected)}
        >
          {t("media.useSelected", { count: selected.length })}
        </button></div>
      )}
      {preview && (
        <AdminDialog title={preview.name} onClose={() => setPreview(null)} className="max-w-3xl" busy={false} trackChanges chrome>
            <p>{preview.name}</p>
            <MediaPreview asset={preview} controls large />
            <button
              type="button"
              className="btn"
              onClick={() => setPreview(null)}
             data-dialog-close="true">
              {t("common.close")}
            </button>
          </AdminDialog>
      )}
      {references !== null && (
        <div className="card space-y-3 p-4 bg-amber-50/50 border border-amber-200 rounded-xl" role="status">
          <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
            <h2 className="font-bold text-gray-900 text-base">
              {t("media.references")} {referencesAsset ? `(${referencesAsset.name})` : ""}
            </h2>
            {references.length > 0 && canWrite && referencesAsset && (
              <button
                type="button"
                className="btn btn-sm bg-red-600 text-white hover:bg-red-700"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await mediaApi.remove(referencesAsset.id, true);
                    setReferences(null);
                    setReferencesAsset(null);
                  })
                }
              >
                {t("media.forceDelete", "解除全部引用并删除")}
              </button>
            )}
          </div>
          {references.length ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                {t("media.referenceHint", "该文件被以下位置引用。您可以点击【解除引用】单个解绑，或进入商品编辑页修改：")}
              </p>
              <div className="divide-y divide-gray-200/60 max-h-60 overflow-y-auto">
                {references.map((r: any) => (
                  <div key={r.kind + r.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-medium">
                        {r.kind === "product" ? t("media.kindProduct", "商品") : r.kind === "tv" ? "TV" : t("media.kindConfig", "系统配置")}
                      </span>
                      {r.kind === "product" ? (
                        r.isDeleted ? (
                          <span className="text-gray-500 line-through">
                            {r.name} <span className="text-xs text-red-500">({t("media.deletedProduct", "已软删除商品")})</span>
                          </span>
                        ) : (
                          <Link
                            className="text-primary hover:underline font-medium"
                            to={`/products/${r.id}/edit`}
                            target="_blank"
                          >
                            {r.name}
                          </Link>
                        )
                      ) : (
                        <span>
                          {t(
                            r.id === "hardwareSettings"
                              ? "media.displayReference"
                              : r.id === "tv_screen_marketing_config"
                                ? "media.tvReference"
                                : "media.otherReference",
                            r.id
                          )}
                        </span>
                      )}
                    </div>
                    {canWrite && referencesAsset && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost text-red-600 hover:bg-red-50 text-xs px-2 py-1"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const res = await mediaApi.unlink(referencesAsset.id, { kind: r.kind, id: r.id });
                            setReferences(res.data.data.list);
                          })
                        }
                      >
                        {t("media.unlinkReference", "解除引用")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">{t("media.unused")}</p>
          )}
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setReferences(null);
                setReferencesAsset(null);
              }}
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
      {rename && (
        <div className="card flex gap-2">
          <input
            aria-label={t("media.rename")}
            className="input"
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !name.trim()}
            onClick={() =>
              void run(async () => {
                await mediaApi.rename(rename.id, name);
                setRename(null);
              })
            }
          >
            {t("common.save")}
          </button>
          <button type="button" className="btn" onClick={() => setRename(null)}>
            {t("common.cancel")}
          </button>
        </div>
      )}
      {deleting && (
        <div className="card space-y-3">
          <p>{t("media.deleteConfirm", { name: deleting.name })}</p>
          <button
            type="button"
            disabled={busy}
            className="btn text-red-600"
            onClick={() =>
              void run(async () => {
                const asset = deleting;
                setReferencesAsset(asset);
                setDeleting(null);
                await mediaApi.remove(asset.id);
              })
            }
          >
            {t("common.delete")}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setDeleting(null)}
          >
            {t("common.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
export function MediaPicker(props: {
  scene: MediaScene;
  max?: number;
  imagesOnly?: boolean;
  onSelect: (assets: MediaAsset[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AdminDialog title={t("media.title")} onClose={props.onClose || (() => {})} className="max-w-5xl" busy={false} trackChanges chrome>
        <MediaLibrary {...props} />
      </AdminDialog>
  );
}
