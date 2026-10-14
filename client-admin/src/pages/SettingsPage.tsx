import { AdminDialog } from "../components/AdminDialog";
import { useMarketingCopy } from "../components/marketing/MarketingLayout";
import { DATE_FORMATS, TIMEZONES } from "../utils/storeDateTime";
import { TvScreenConfigPage } from "./marketing/TvScreenConfigPage";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  MapPin,
  Phone,
  Store,
  Smartphone,
  Shield,
} from "lucide-react";
import { configApi } from "../services/api";
import { useAuthStore } from "../stores/auth";
import { POSSettingsPage } from "./settings/POSSettingsPage";

const StaffPermissionsPage = lazy(() =>
  import("./settings/StaffPermissionsPage").then((module) => ({
    default: module.StaffPermissionsPage,
  })),
);
const AiPermissionsPage = lazy(() =>
  import("./settings/AiPermissionsPage").then((module) => ({
    default: module.AiPermissionsPage,
  })),
);

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab =
    location.pathname === "/settings/tv-screen"
      ? "tvScreen"
      : location.pathname === "/settings/permissions"
        ? "permissions"
        : location.pathname === "/settings/ai"
          ? "ai"
          : location.pathname === "/settings/pos"
            ? "pos"
            : "store";
  const l = useMarketingCopy();
  const [savedInfo, setSavedInfo] = useState<any>(null),
    [confirmSave, setConfirmSave] = useState(false);

  // 店铺信息状态
  const [storeInfo, setStoreInfo] = useState({
    storeName: "",
    storeCode: "",
    address: "",
    phone: "",
    email: "",
    storeLogo: "",
    timezone: "Asia/Jakarta",
    dateFormat: "YYYY-MM-DD",
  });

  const dirty =
    savedInfo !== null &&
    JSON.stringify(storeInfo) !== JSON.stringify(savedInfo);
  // 加载店铺信息
  const {
    data: configData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["config", "store", user?.storeId || ""],
    queryFn: () => configApi.get(user?.storeId || undefined),
    enabled: activeTab === "store",
  });

  useEffect(() => {
    if (configData?.data?.data?.storeInfo && !dirty) {
      const info = { ...storeInfo, ...configData.data.data.storeInfo };
      setStoreInfo(info);
      setSavedInfo(info);
    }
  }, [configData]);

  // 保存设置
  const saveMutation = useMutation({
    mutationFn: (data: { key: string; value: any }) =>
      configApi.set(user?.storeId || "", data.key, data.value, "store"),
    onSuccess: (_result, variables) => {
      setSavedInfo(variables.value);
      setConfirmSave(false);
      queryClient.invalidateQueries();
    },
  });

  const handleSave = (key: string, value: any) => {
    saveMutation.mutate({ key, value });
  };

  if (activeTab === "store" && isError)
    return (
      <div role="alert" className="card">
        {t("common.error")}
        <button className="btn ml-3" onClick={() => refetch()}>
          {t("common.refresh")}
        </button>
      </div>
    );
  if (activeTab === "store" && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap mb-6">
        <button
          onClick={() => navigate("/settings")}
          aria-current={activeTab === "store" ? "page" : undefined}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "store"
              ? "bg-primary text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Store size={18} />
          {t("settings.store")}
        </button>
        <button
          onClick={() => navigate("/settings/pos")}
          aria-current={activeTab === "pos" ? "page" : undefined}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "pos"
              ? "bg-primary text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Smartphone size={18} />
          {t("settings.pos")}
        </button>
        <button
          className={activeTab === "tvScreen" ? "btn-primary" : "btn-ghost"}
          onClick={() => navigate("/settings/tv-screen")}
        >
          {t("settings.tvScreen", "电视大屏终端")}
        </button>
        {user?.role === "admin" && (
          <button
            onClick={() => navigate("/settings/permissions")}
            aria-current={activeTab === "permissions" ? "page" : undefined}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "permissions" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Shield size={18} />
            {t("staffAccess.title")}
          </button>
        )}
        {user?.role === "admin" && (
          <button
            onClick={() => navigate("/settings/ai")}
            aria-current={activeTab === "ai" ? "page" : undefined}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "ai" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Shield size={18} />
            {t("aiPermissions.title")}
          </button>
        )}
      </div>

      {activeTab === "tvScreen" && <TvScreenConfigPage />}
      {/* 店铺设置 Tab */}
      {activeTab === "store" && (
        <form
          className="card max-w-4xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) setConfirmSave(true);
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Store className="text-primary" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {t("settings.storeInfo")}
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 店铺名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("settings.storeName")}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required maxLength={100} aria-label={t("settings.storeName")}
                value={storeInfo.storeName}
                  onChange={(e) =>
                    setStoreInfo({ ...storeInfo, storeName: e.target.value })
                  }
                  className="input pl-10"
                  placeholder={t("settings.storeNamePlaceholder")}
                />
                <Store
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={18}
                />
              </div>
            </div>

            {/* 店铺编号 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("settings.storeCode")}
              </label>
              <input
                type="text"
                aria-label={t("settings.storeCode")}
                value={storeInfo.storeCode}
                onChange={(e) =>
                  setStoreInfo({ ...storeInfo, storeCode: e.target.value })
                }
                className="input"
                placeholder={t("settings.storeCodePlaceholder")}
              />
            </div>

            {/* 地址 */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("settings.address")}
              </label>
              <div className="relative">
                <input
                  type="text"
                  aria-label={t("settings.address")}
                value={storeInfo.address}
                  onChange={(e) =>
                    setStoreInfo({ ...storeInfo, address: e.target.value })
                  }
                  className="input pl-10"
                  placeholder={t("settings.addressPlaceholder")}
                />
                <MapPin
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={18}
                />
              </div>
            </div>

            {/* 电话 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("settings.phone")}
              </label>
              <div className="relative">
                <input
                  type="text"
                  aria-label={t("settings.phone")}
                value={storeInfo.phone}
                  onChange={(e) =>
                    setStoreInfo({ ...storeInfo, phone: e.target.value })
                  }
                  className="input pl-10"
                  placeholder={t("settings.phonePlaceholder")}
                />
                <Phone
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={18}
                />
              </div>
            </div>

            {/* 邮箱 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("settings.email")}
              </label>
              <input
                type="email"
                aria-label={t("settings.email")}
                value={storeInfo.email}
                onChange={(e) =>
                  setStoreInfo({ ...storeInfo, email: e.target.value })
                }
                className="input"
                placeholder={t("settings.emailPlaceholder")}
              />
            </div>
          </div>

          <section
            className="mt-6 border-t pt-5"
            data-testid="store-date-settings"
          >
            <h3 className="font-semibold">{t("storeDates.title")}</h3>
            <p className="mt-1 text-sm text-gray-500">{t("storeDates.hint")}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                {t("storeDates.timezone")}
                <select
                  aria-label={t("storeDates.timezone")}
                  className="input mt-2"
                  value={storeInfo.timezone}
                  onChange={(e) => {
                    const next = { ...storeInfo, timezone: e.target.value };
                    setStoreInfo(next);
                  }}
                >
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                {t("storeDates.format")}
                <select
                  aria-label={t("storeDates.format")}
                  className="input mt-2"
                  value={storeInfo.dateFormat}
                  onChange={(e) => {
                    const next = { ...storeInfo, dateFormat: e.target.value };
                    setStoreInfo(next);
                  }}
                >
                  {DATE_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {saveMutation.isError && (
              <p role="alert" className="mt-2 text-red-600">
                {(saveMutation.error as any)?.response?.data?.message ||
                  t("common.error")}
              </p>
            )}
          </section>

          {/* 保存按钮 */}
          <div className="sticky bottom-0 bg-white mt-6 py-4 border-t border-gray-200 flex flex-wrap justify-between gap-3 items-center">
            <p
              role="status"
              className={`text-sm ${dirty ? "text-amber-700" : "text-green-700"}`}
            >
              {saveMutation.isPending
                ? t("common.loading")
                : dirty
                  ? l(
                      "有未保存修改",
                      "Unsaved changes",
                      "Perubahan belum disimpan",
                    )
                  : t("common.saved")}
            </p>
            <button
              type="submit"
              disabled={saveMutation.isPending || !dirty}
              className="btn-primary flex items-center gap-2"
            >
              {saveMutation.isPending && (
                <Loader2 size={18} className="animate-spin" />
              )}
              {t("common.save")}
            </button>
          </div>
        </form>
      )}

      {confirmSave && (
        <AdminDialog title={l(
            "确认门店设置",
            "Review store settings",
            "Tinjau pengaturan toko",
          )} onClose={() => setConfirmSave(false)} className="max-w-lg" busy={Boolean(saveMutation.isPending)} trackChanges chrome>

            <p className="text-sm text-gray-500">
              {l(
                "保存后将用于门店展示、日期及报表。请核对以下修改。",
                "These settings affect store displays, dates and reports. Review the changes.",
                "Pengaturan memengaruhi tampilan toko, tanggal dan laporan. Tinjau perubahan.",
              )}
            </p>
            {Object.entries(storeInfo)
              .filter(([key, value]) => value !== savedInfo?.[key])
              .map(([key, value]) => (
                <div key={key} className="text-sm border-b pb-2 break-words">
                  <strong>
                    {key === "timezone"
                      ? t("storeDates.timezone")
                      : key === "dateFormat"
                        ? t("storeDates.format")
                        : t("settings." + key, key)}
                  </strong>
                  <p>
                    {savedInfo?.[key] || "—"} → {String(value) || "—"}
                  </p>
                </div>
              ))}
            {saveMutation.isError && (
              <p role="alert" className="text-red-600">
                {(saveMutation.error as any)?.response?.data?.message ||
                  t("common.error")}
              </p>
            )}
            <div className="admin-dialog-footer flex gap-3">
              <button
                className="btn"
                disabled={saveMutation.isPending}
                onClick={() => setConfirmSave(false)}
               data-dialog-close="true">
                {t("common.cancel")}
              </button>
              <button
                className="btn-primary"
                disabled={saveMutation.isPending}
                onClick={() => handleSave("storeInfo", { ...storeInfo })}
              >
                {l("确认保存", "Confirm save", "Konfirmasi simpan")}
              </button>
            </div>
          </AdminDialog>
      )}
      {activeTab === "permissions" && (
        <Suspense
          fallback={
            <div className="flex justify-center py-8" role="status">
              <Loader2 className="animate-spin text-primary" size={28} />
              <span className="sr-only">{t("common.loading")}</span>
            </div>
          }
        >
          <StaffPermissionsPage />
        </Suspense>
      )}

      {activeTab === "ai" && (
        <Suspense
          fallback={
            <div className="flex justify-center py-8" role="status">
              <Loader2 className="animate-spin text-primary" size={28} />
              <span className="sr-only">{t("common.loading")}</span>
            </div>
          }
        >
          <AiPermissionsPage />
        </Suspense>
      )}

      {/* POS设置 Tab */}
      {activeTab === "pos" && <POSSettingsPage />}
    </div>
  );
}
