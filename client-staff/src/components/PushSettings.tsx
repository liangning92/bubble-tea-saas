import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { employeeApi } from "../services/api";
export function PushSettings() {
  const { t } = useTranslation(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setEnabled(false); return; }
    navigator.serviceWorker.getRegistration().then(async r => {
      const subscription = await r?.pushManager.getSubscription();
      if (active) setEnabled(!!subscription && !!sessionStorage.getItem("employee-push-id"));
    }).catch(() => { if (active) { setEnabled(false); setMessage(t("common.loadFailed")); } });
    return () => { active = false; };
  }, [t]);
  async function enable() {
    if (busy) return;
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
      setEnabled(true);
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
      <details className="text-sm text-gray-500 leading-relaxed">
        <summary className="py-2 cursor-pointer">{t("ui.help")}</summary>
        <p className="pb-3">{t("workspace.pushHelp")}</p>
      </details>
      <p role="status">{t(enabled === null ? "common.loading" : enabled ? "workspace.pushEnabled" : "workspace.pushDisabled")}</p>
      {enabled === false && <button
        onClick={enable}
        disabled={busy}
        className="bg-primary text-white p-3 rounded-xl"
      >
        {t("workspace.enablePush")}
      </button>}
      {enabled === true && <button
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true); setMessage("");
          try {
            await employeeApi.delete("/my/subscription", {
              id: sessionStorage.getItem("employee-push-id"),
            });
            sessionStorage.removeItem("employee-push-id");
            const r = await navigator.serviceWorker?.getRegistration();
            await (await r?.pushManager.getSubscription())?.unsubscribe();
            setEnabled(false);
            setMessage(t("workspace.pushDisabled"));
          } catch {
            setMessage(t("common.loadFailed"));
          } finally { setBusy(false); }
        }}
        className="btn-secondary"
      >
        {t("workspace.disablePush")}
      </button>}
      <p role="status">{message}</p>
    </section>
  );
}
