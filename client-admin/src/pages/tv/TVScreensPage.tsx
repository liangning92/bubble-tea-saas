import { useEmployeePermission } from "../../contexts/EmployeeAccess";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { tvApi } from "../../services/api";
const initial = {
  inherit: true,
  channelId: "",
  orientation: "landscape",
  layoutTemplate: "split_media_menu",
  themeStyle: "international_dark",
  safeAreaPadding: 1.5,
  mediaFitMode: "contain_blur",
  mediaIntervalSeconds: 8,
  selectedMediaIds: [],
  selectedCategoryIds: [],
  selectedProductIds: [],
  selectedSpecIds: [],
  showActivities: true,
  activityDisplayType: "all",
  marqueeText: "",
  marqueeSpeed: 3,
  musicIds: [],
  musicEnabled: false,
  volume: 0.4,
  pageSeconds: 12,
};
type Settings = typeof initial;
export function TVScreensPage() {
  const canWrite = useEmployeePermission("marketing.write");
  const { t } = useTranslation(),
    tr = (key: string) => t("tvTerminal." + key);
  const [screens, setScreens] = useState<any[]>([]),
    [options, setOptions] = useState<any>({
      channels: [],
      categories: [],
      products: [],
      media: [],
    }),
    [defaults, setDefaults] = useState<Settings>(initial),
    [edit, setEdit] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pin, setPin] = useState(""),
    [target, setTarget] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [legacy, setLegacy] = useState<any[]>([]);
  async function load() {
    try {
      const [a, b, c, d] = await Promise.all([
        tvApi.getScreens(),
        tvApi.options(),
        tvApi.defaults(),
        tvApi.legacy(),
      ]);
      setLegacy(d.data.data);
      setScreens(a.data.data);
      setOptions(b.data.data);
      setDefaults(c.data.data);
      setError("");
    } catch (e: any) {
      setError(e.response?.data?.message || tr("loadFailed"));
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);
  async function action(fn: () => Promise<any>) {
    setBusy(true);
    try {
      await fn();
      await load();
      return true;
    } catch (e: any) {
      setError(e.response?.data?.message || tr("failed"));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function set(key: string, value: any) {
    setEdit({ ...edit, settings: { ...edit.settings, [key]: value } });
  }
  const toggle = (key: string, id: string) =>
    set(
      key,
      edit.settings[key].includes(id)
        ? edit.settings[key].filter((x: string) => x !== id)
        : [...edit.settings[key], id],
    );
  function selectList(key: string, list: any[]) {
    return (
      <div className="max-h-56 overflow-auto border rounded p-3 grid sm:grid-cols-2 gap-2">
        {list.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={edit.settings[key].includes(item.id)}
              onChange={() => toggle(key, item.id)}
            />{" "}
            {item.name}
          </label>
        ))}
      </div>
    );
  }
  function state(device: any, screen: any) {
    if (device.revoked) return tr("revoked");
    if (!device.lastSeen || Date.now() - Date.parse(device.lastSeen) > 90000)
      return tr("unknown");
    if (
      device.report.cacheState === "failed" ||
      device.report.playbackState === "failed"
    )
      return tr("failed");
    if (device.report.cacheState === "downloading") return tr("downloading");
    if (
      device.report.version &&
      device.report.version === screen.desiredVersion
    )
      return tr("applied");
    return tr("saved");
  }
  return (
    <div className="space-y-5">
      <div className="flex gap-3 items-center flex-wrap">
        <h1 className="text-2xl font-bold">{tr("title")}</h1>
        <button
          disabled={!canWrite}
          className="btn-primary"
          onClick={() =>
            setEdit({
              code: "TV-" + crypto.randomUUID().slice(0, 6).toUpperCase(),
              name: "",
              isActive: true,
              settings: { ...initial },
            })
          }
        >
          {tr("add")}
        </button>
        <button
          className="btn"
          onClick={() =>
            setEdit({
              isDefaults: true,
              settings: { ...defaults, inherit: false },
            })
          }
        >
          {tr("defaults")}
        </button>
        <Link className="btn" to="/marketing/media">
          {tr("mediaLibrary")}
        </Link>
        <Link className="btn" to="/marketing/promotions/activities">
          {tr("activities")}
        </Link>
      </div>
      <p className="text-gray-600">{tr("hint")}</p>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <form
        className="card flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          action(() => tvApi.claimDevice({ pin, screenId: target })).then(() =>
            setPin(""),
          );
        }}
      >
        <label>
          {tr("pairCode")}
          <input
            className="input"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label>
          {tr("screen")}
          <select
            className="input"
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">{tr("choose")}</option>
            {screens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy || !canWrite} className="btn-primary">
          {tr("pair")}
        </button>
      </form>
      <details className="card">
        <summary>{tr("legacyImport")}</summary>
        <p>{tr("legacyHint")}</p>
        {legacy.map((row) => (
          <button
            key={row.id}
            disabled={busy || !canWrite}
            className="btn"
            onClick={() => {
              if (confirm(tr("legacyConfirm")))
                action(() => tvApi.importLegacy(row.id));
            }}
          >
            {row.name} ({row.code})
          </button>
        ))}
      </details>
      <div className="grid lg:grid-cols-2 gap-4">
        {screens.map((screen) => (
          <section className="card space-y-3" key={screen.id}>
            <h2 className="text-lg font-bold">
              {screen.name}{" "}
              <span className="text-sm text-gray-500">{screen.code}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => setEdit({ ...screen })}>
                {tr("edit")}
              </button>
              <button
                disabled={busy || !canWrite}
                className="btn"
                onClick={() => action(() => tvApi.pushScreen(screen.id))}
              >
                {tr("publish")}
              </button>
              <button
                className="btn"
                onClick={() =>
                  action(async () => {
                    const res = await tvApi.preview(screen.id);
                    setPreview(res.data.data);
                  })
                }
              >
                {tr("preview")}
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (confirm(tr("deleteConfirm")))
                    action(() => tvApi.deleteScreen(screen.id));
                }}
              >
                {tr("delete")}
              </button>
            </div>
            <p>{screen.isActive ? tr("enabled") : tr("standby")}</p>
            {screen.configurationErrors?.length > 0 && (
              <p className="text-red-600 text-xs">
                {screen.configurationErrors.join(" · ")}
              </p>
            )}
            {screen.devices.map((d: any) => (
              <div className="p-3 bg-gray-50 rounded" key={d.id}>
                <p>
                  {d.id.slice(0, 8)} · {state(d, screen)} ·{" "}
                  {d.report.appVersion}
                </p>
                <p className="text-xs break-all">
                  {tr("version")}: {d.report.version || "—"}
                </p>
                {d.report.errors?.length > 0 && (
                  <p className="text-red-600 text-xs">
                    {d.report.errors.join(" · ")}
                  </p>
                )}
                <button
                  disabled={busy || d.revoked || !canWrite}
                  className="btn"
                  onClick={() => {
                    if (confirm(tr("revokeConfirm")))
                      action(() => tvApi.revoke(d.id));
                  }}
                >
                  {tr("revoke")}
                </button>
                <button
                  disabled={busy || d.revoked || !canWrite}
                  className="btn"
                  onClick={() => action(() => tvApi.interactive(d.id))}
                >
                  {d.interactive ? tr("interactive") : tr("setInteractive")}
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-auto p-5">
          <form
            className="bg-white rounded-xl max-w-4xl mx-auto p-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                if (edit.isDefaults) await tvApi.saveDefaults(edit.settings);
                else if (edit.id)
                  await tvApi.updateScreen(edit.id, {
                    code: edit.code,
                    name: edit.name,
                    isActive: edit.isActive,
                    revision: edit.revision,
                    settings: edit.settings,
                  });
                else
                  await tvApi.createScreen({
                    code: edit.code,
                    name: edit.name,
                    isActive: edit.isActive,
                    settings: edit.settings,
                  });
                setEdit(null);
              });
            }}
          >
            <h2 className="text-xl font-bold">
              {edit.isDefaults ? tr("defaults") : tr("edit")}
            </h2>
            {!edit.isDefaults && (
              <>
                <label className="block">
                  {tr("name")}
                  <input
                    className="input"
                    required
                    maxLength={100}
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </label>
                <label className="block">
                  {tr("code")}
                  <input
                    className="input"
                    required
                    pattern="[A-Za-z0-9_-]+"
                    maxLength={40}
                    value={edit.code}
                    onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={edit.isActive}
                    onChange={(e) =>
                      setEdit({ ...edit, isActive: e.target.checked })
                    }
                  />{" "}
                  {tr("enabled")}
                </label>
                <label className="block">
                  <input
                    type="checkbox"
                    checked={edit.settings.inherit}
                    onChange={(e) => set("inherit", e.target.checked)}
                  />{" "}
                  {tr("inherit")}
                </label>
              </>
            )}
            {!edit.isDefaults && (
              <div className="grid sm:grid-cols-2 gap-3">
                <label>
                  {tr("channel")}
                  <select
                    className="input"
                    value={edit.settings.channelId}
                    onChange={(e) => set("channelId", e.target.value)}
                  >
                    <option value="">{tr("dineIn")}</option>
                    {options.channels.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("orientation")}
                  <select
                    className="input"
                    value={edit.settings.orientation}
                    onChange={(e) => set("orientation", e.target.value)}
                  >
                    {["landscape", "portrait"].map((v) => (
                      <option key={v} value={v}>
                        {tr(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("layout")}
                  <select
                    className="input"
                    value={edit.settings.layoutTemplate}
                    onChange={(e) => set("layoutTemplate", e.target.value)}
                  >
                    {[
                      "menu_full",
                      "split_media_menu",
                      "media_loop",
                      "portrait_promo_menu",
                      "portrait_media_loop",
                    ].map((v) => (
                      <option key={v} value={v}>
                        {tr(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("theme")}
                  <select
                    className="input"
                    value={edit.settings.themeStyle}
                    onChange={(e) => set("themeStyle", e.target.value)}
                  >
                    {[
                      "international_dark",
                      "creamy_morandi",
                      "dynamic_vivid",
                    ].map((v) => (
                      <option key={v} value={v}>
                        {tr(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("fit")}
                  <select
                    className="input"
                    value={edit.settings.mediaFitMode}
                    onChange={(e) => set("mediaFitMode", e.target.value)}
                  >
                    <option value="cover">{tr("cover")}</option>
                    <option value="contain_blur">{tr("contain")}</option>
                  </select>
                </label>
                <label>
                  {tr("safeAreaPadding")}
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={edit.settings.safeAreaPadding}
                    onChange={(e) =>
                      set("safeAreaPadding", Number(e.target.value))
                    }
                  />
                </label>
              </div>
            )}
            <fieldset
              disabled={!edit.isDefaults && edit.settings.inherit}
              className="space-y-4 disabled:opacity-60"
            >
              <h3 className="font-bold">{tr("content")}</h3>
              <p>{tr("selectionHint")}</p>
              <h4>{tr("categories")}</h4>
              {selectList("selectedCategoryIds", options.categories)}
              <h4>{tr("products")}</h4>
              {selectList("selectedProductIds", options.products)}
              <h4>{tr("specs")}</h4>
              {selectList(
                "selectedSpecIds",
                options.products.flatMap((p: any) =>
                  p.specs.map((s: any) => ({
                    ...s,
                    name: p.name + " · " + s.name,
                  })),
                ),
              )}
              <h4>{tr("media")}</h4>
              {selectList(
                "selectedMediaIds",
                options.media.filter((m: any) => m.kind !== "audio"),
              )}
              <ol>
                {edit.settings.selectedMediaIds.map(
                  (id: string, index: number) => (
                    <li key={id}>
                      {options.media.find((m: any) => m.id === id)?.name}
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => {
                          const ids = [...edit.settings.selectedMediaIds];
                          [ids[index - 1], ids[index]] = [
                            ids[index],
                            ids[index - 1],
                          ];
                          set("selectedMediaIds", ids);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={
                          index === edit.settings.selectedMediaIds.length - 1
                        }
                        onClick={() => {
                          const ids = [...edit.settings.selectedMediaIds];
                          [ids[index + 1], ids[index]] = [
                            ids[index],
                            ids[index + 1],
                          ];
                          set("selectedMediaIds", ids);
                        }}
                      >
                        ↓
                      </button>
                    </li>
                  ),
                )}
              </ol>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ["mediaIntervalSeconds", 2, 300],
                  ["pageSeconds", 3, 300],
                  ["marqueeSpeed", 1, 5],
                  ["volume", 0, 1],
                ].map(([key, min, max]) => (
                  <label key={key}>
                    {tr(String(key))}
                    <input
                      className="input"
                      type="number"
                      min={Number(min)}
                      max={Number(max)}
                      step={key === "volume" ? 0.1 : 1}
                      value={edit.settings[key]}
                      onChange={(e) => set(String(key), Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              <label className="block">
                {tr("marquee")}
                <input
                  className="input"
                  maxLength={1000}
                  value={edit.settings.marqueeText}
                  onChange={(e) => set("marqueeText", e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={edit.settings.showActivities}
                  onChange={(e) => set("showActivities", e.target.checked)}
                />{" "}
                {tr("showActivities")}
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  checked={edit.settings.musicEnabled}
                  onChange={(e) => set("musicEnabled", e.target.checked)}
                />{" "}
                {tr("music")}
              </label>
              {selectList(
                "musicIds",
                options.media.filter((m: any) => m.kind === "audio"),
              )}
            </fieldset>
            <div className="flex gap-3">
              <button className="btn-primary" disabled={busy || !canWrite}>
                {tr("save")}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setEdit(null)}
              >
                {tr("cancel")}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-red-600">
                {error}
              </p>
            )}
          </form>
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/50 p-6 overflow-auto">
          <div className="bg-white rounded p-5 max-w-4xl mx-auto">
            <button className="btn" onClick={() => setPreview(null)}>
              {tr("close")}
            </button>
            <h2>
              {preview.store.name} · {preview.channel.name}
            </h2>
            <iframe
              title={tr("preview")}
              className="w-full h-[65vh]"
              src="/tv/?preview=1"
              onLoad={(e) =>
                e.currentTarget.contentWindow?.postMessage(
                  { type: "tv-preview", snapshot: preview },
                  window.location.origin,
                )
              }
            />
            <p className="text-red-600">{preview.errors.join(" · ")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
export default TVScreensPage;
