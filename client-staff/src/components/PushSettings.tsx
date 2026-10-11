import { useState } from "react";
import { useTranslation } from "react-i18next";
import { employeeApi } from "../services/api";
export function PushSettings() {
  const { t } = useTranslation(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw new Error(t("workspace.pushUnsupported"));
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(t("workspace.pushDenied"));
      await navigator.serviceWorker.register("/employee-sw.js");
      const { publicKey } = await employeeApi.get("/my/push-key");
      const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
      const applicationServerKey = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const ready = await navigator.serviceWorker.ready,
        existing = await ready.pushManager.getSubscription();
      if (
        existing?.options.applicationServerKey &&
        !new Uint8Array(existing.options.applicationServerKey).every(
          (v, i) => v === applicationServerKey[i],
        )
      )
        await existing.unsubscribe();
      const subscription =
        (await ready.pushManager.getSubscription()) ||
        (await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));
      const saved = await employeeApi.put(
        "/my/subscription",
        subscription.toJSON(),
      );
      sessionStorage.setItem("employee-push-id", saved.id);
      setMessage(t("workspace.pushEnabled"));
    } catch (e: any) {
      setMessage(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="p-4 bg-white rounded-xl space-y-2">
      <h2 className="font-bold">{t("workspace.notifications")}</h2>
      <details className="text-xs text-gray-500 leading-relaxed">
        <summary className="py-2 cursor-pointer">{t("ui.help")}</summary>
        <p className="pb-3">{t("workspace.pushHelp")}</p>
      </details>
      <button
        onClick={enable}
        disabled={busy}
        className="bg-primary text-white p-3 rounded-xl"
      >
        {t("workspace.enablePush")}
      </button>
      <button
        disabled={busy}
        onClick={async () => {
          try {
            await employeeApi.delete("/my/subscription", {
              id: sessionStorage.getItem("employee-push-id"),
            });
            sessionStorage.removeItem("employee-push-id");
            const r = await navigator.serviceWorker?.getRegistration();
            await (await r?.pushManager.getSubscription())?.unsubscribe();
            setMessage(t("workspace.pushDisabled"));
          } catch {
            setMessage(t("common.loadFailed"));
          }
        }}
        className="p-3"
      >
        {t("workspace.disablePush")}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
