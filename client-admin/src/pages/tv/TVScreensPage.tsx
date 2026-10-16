import tvPlayerDocument from "../../../../server/public/tv/index.html?raw";
import { confirmAdmin } from '../../components/AdminFeedback'
import { useEmployeePermission } from "../../contexts/EmployeeAccess";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AdminDialog } from "../../components/AdminDialog";
import { MediaPreview } from "../../components/MediaLibrary";
import { useMarketingCopy } from "../../components/marketing/MarketingLayout";
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
  const l = useMarketingCopy();
  const [searches, setSearches] = useState<Record<string, string>>({});
  const canWrite = useEmployeePermission("marketing.write");
  const [loading,setLoading]=useState(true);
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
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const [previewPrize,setPreviewPrize] = useState(0), [previewDrawing,setPreviewDrawing] = useState(false), [previewReady,setPreviewReady] = useState(false), [previewFailed,setPreviewFailed] = useState(false);
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin||event.source!==previewFrame.current?.contentWindow)return;
      if(event.data?.type==='tv-lottery-preview-finished')setPreviewDrawing(false);
      if(event.data?.type==='tv-preview-ready')previewFrame.current?.contentWindow?.postMessage({type:'tv-preview',snapshot:preview},window.location.origin);
      if(event.data?.type==='tv-preview-applied'){setPreviewReady(true);setPreviewFailed(false);}
    };
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
  },[preview]);
  useEffect(()=>{
    if(!preview||previewReady)return;
    const timeout=window.setTimeout(()=>setPreviewFailed(true),12000);
    return()=>window.clearTimeout(timeout);
  },[preview,previewReady]);
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
    } finally {setLoading(false);}
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
    const query = searches[key] || "",
      chosen = edit.settings[key] || [];
    const matches = list.filter((item) =>
      item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
    return (
      <details className="border rounded-lg p-3 space-y-3" open={chosen.length>0||key==="selectedProductIds"||key==="selectedMediaIds"||key==="musicIds"&&edit.settings.musicEnabled}>
        <summary className="cursor-pointer text-sm font-medium">{tr(key==="selectedMediaIds"?"media":key==="musicIds"?"music":key==="selectedProductIds"?"products":key==="selectedSpecIds"?"specs":"categories")} · {l("已选","Selected","Dipilih")} {chosen.length}</summary>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="search"
            className="input flex-1 min-w-0"
            aria-label={
              l("搜索", "Search", "Cari") +
              " " +
              tr(
                key === "selectedMediaIds"
                  ? "media"
                  : key === "musicIds"
                    ? "music"
                    : key === "selectedProductIds"
                      ? "products"
                      : key === "selectedSpecIds"
                        ? "specs"
                        : "categories",
              )
            }
            placeholder={l("搜索名称", "Search names", "Cari nama")}
            value={query}
            onChange={(e) =>
              setSearches({ ...searches, [key]: e.target.value })
            }
          />
          <span className="text-xs text-gray-500">
            {l("已选", "Selected", "Dipilih")} {chosen.length} / {list.length}
          </span>
        </div>
        <div className="max-h-48 overflow-auto grid sm:grid-cols-2 gap-2">
          {matches.map((item) => (
            <label
              key={item.id}
              className={`flex items-center gap-3 rounded p-2 cursor-pointer ${chosen.includes(item.id) ? "bg-primary-light" : "hover:bg-gray-50"}`}
            >
              <input
                type="checkbox"
                aria-label={item.name}
                checked={chosen.includes(item.id)}
                onChange={() => toggle(key, item.id)}
              />
              {item.url && (
                <span className="tv-selection-preview w-16 shrink-0">
                  <MediaPreview asset={item} />
                </span>
              )}
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  className="w-12 h-12 rounded object-cover"
                />
              )}
              <span className="text-sm break-words min-w-0">{item.name}</span>
            </label>
          ))}
        </div>
        {!matches.length && (
          <p className="text-sm text-gray-500">
            {l("没有匹配项", "No matches", "Tidak ada hasil")}
          </p>
        )}
        {chosen.some((id:string)=>!list.some(item=>item.id===id))&&<button type="button" className="btn btn-sm" onClick={()=>set(key,chosen.filter((id:string)=>list.some(item=>item.id===id)))}>{l("清除不可用选择","Remove unavailable selections","Hapus pilihan tidak tersedia")}</button>}
      </details>
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
          disabled={!canWrite||loading}
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
          disabled={loading}
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
      {loading&&<p role="status">{t("common.loading")}</p>}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {!loading&&!screens.length && (
        <section className="card bg-primary-light/30 space-y-3">
          <h2 className="font-semibold">
            {l(
              "开始展示门店内容",
              "Start your store display",
              "Mulai tampilan toko",
            )}
          </h2>
          <ol className="grid sm:grid-cols-3 gap-3 text-sm">
            <li>1. {tr("defaults")}</li>
            <li>2. {tr("add")}</li>
            <li>
              3. {tr("pairCode")} → {tr("pair")}
            </li>
          </ol>
          <p className="text-sm text-gray-600">
            {l(
              "先设置内容并添加屏幕，随后输入电视显示的配对码。",
              "Set content and add a screen, then enter the code shown on the TV.",
              "Atur konten dan tambah layar, lalu masukkan kode di TV.",
            )}
          </p>
        </section>
      )}
      {screens.length > 0 && (
        <form
          className="card flex flex-wrap gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            action(() => tvApi.claimDevice({ pin, screenId: target })).then(
              () => setPin(""),
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
      )}
      {legacy.length > 0 && (
        <details className="card">
          <summary>{tr("legacyImport")}</summary>
          <p>{tr("legacyHint")}</p>
          {legacy.map((row) => (
            <button
              key={row.id}
              disabled={busy || !canWrite}
              className="btn"
              onClick={async () => {
                if (await confirmAdmin(tr("legacyConfirm")))
                  action(() => tvApi.importLegacy(row.id));
              }}
            >
              {row.name} ({row.code})
            </button>
          ))}
        </details>
      )}
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
                    setPreviewPrize(0);setPreviewDrawing(false);setPreviewReady(false);setPreviewFailed(false);setPreview(res.data.data);
                  })
                }
              >
                {tr("preview")}
              </button>
              <button
                className="btn"
                onClick={async () => {
                  if (await confirmAdmin(tr("deleteConfirm")))
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
                  onClick={async () => {
                    if (await confirmAdmin(tr("revokeConfirm")))
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
        <AdminDialog title={edit.isDefaults ? tr("defaults") : tr("edit")} onClose={() => setEdit(null)} className="max-w-lg" busy={Boolean(busy)} trackChanges chrome>
          <form
            className="flex flex-col max-h-[94dvh]"
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
            <div className="overflow-y-auto p-4 sm:p-6 space-y-4 min-h-0">

              {!edit.isDefaults && (
                <>
                  <label className="block">
                    {tr("name")}
                    <input
                      className="input"
                      required
                      maxLength={100}
                      value={edit.name}
                      onChange={(e) =>
                        setEdit({ ...edit, name: e.target.value })
                      }
                    />
                  </label>
                  <label className="block">
                    {tr("code")}
                    <input
                      className="input"
                      required
                      pattern="(?:[A-Za-z0-9_]|-)+"
                      maxLength={40}
                      value={edit.code}
                      onChange={(e) =>
                        setEdit({ ...edit, code: e.target.value })
                      }
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
                {selectList("selectedCategoryIds", options.categories)}
                {selectList("selectedProductIds", options.products)}
                {selectList(
                  "selectedSpecIds",
                  options.products.flatMap((p: any) =>
                    p.specs.map((s: any) => ({
                      ...s,
                      name: p.name + " · " + s.name,
                    })),
                  ),
                )}
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
                        onChange={(e) =>
                          set(String(key), Number(e.target.value))
                        }
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
            </div>
            <div className="admin-dialog-footer shrink-0 border-t bg-white p-4 flex flex-wrap gap-3 items-center">
              <button
                type="button"
                className="btn"
                onClick={() => setEdit(null)}
               data-dialog-close="true">
                {tr("cancel")}
              </button>
              <button className="btn-primary" disabled={busy || !canWrite}>
                {tr("save")}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-red-600 px-4 pb-3">
                {error}
              </p>
            )}
          </form>
        </AdminDialog>
      )}
      {preview && (
        <AdminDialog title={tr("preview")} onClose={() => setPreview(null)} className="max-w-4xl" busy={false} chrome>
            <button className="btn" onClick={() => setPreview(null)} data-dialog-close="true">
              {tr("close")}
            </button>

            <div className="flex flex-wrap items-end gap-3 mb-3">
              <label className="min-w-0 flex-1 text-sm">
                {l('预览奖项','Preview result','Hasil pratinjau')}
                <select className="input" aria-label={l('预览奖项','Preview result','Hasil pratinjau')} value={previewPrize} disabled={previewDrawing||!preview.drawPreview?.prizes?.length} onChange={e=>setPreviewPrize(Number(e.target.value))}>
                  {(preview.drawPreview?.prizes||[]).map((prize:any,index:number)=><option key={prize.id} value={index}>{prize.name}</option>)}
                </select>
              </label>
              <button className="btn-primary" disabled={!previewReady||previewDrawing||!preview.drawPreview?.prizes?.length} onClick={()=>{
                const prizes=preview.drawPreview.prizes,prize=prizes[previewPrize];if(!prize)return;
                setPreviewDrawing(true);
                previewFrame.current?.contentWindow?.postMessage({type:'tv-lottery-preview',event:{eventId:'preview:'+Date.now(),testMode:true,orderNumber:'DEMO',prizeName:prize.name,prizeId:prize.id,prizeIndex:previewPrize,prizes,coupon:preview.drawPreview.coupons?.[prize.id]}},window.location.origin);
              }}>{previewDrawing?l('正在演示…','Playing preview…','Demo berlangsung…'):l('预览抽奖动画（不发奖）','Preview draw (no reward)','Demo undian (tanpa hadiah)')}</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">{preview.drawPreview?l('使用当前活动奖品演示，不创建订单、不扣库存、不发放权益。','Uses current activity prizes. No orders, stock changes or rewards.','Memakai hadiah promo saat ini. Tanpa pesanan, perubahan stok atau pemberian hadiah.'):l('当前渠道没有生效中的抽奖活动，暂不可预览动画。','No active draw for this channel. Preview is unavailable.','Tidak ada undian aktif untuk kanal ini. Demo belum tersedia.')}</p>
            {!previewReady&&<p role={previewFailed?'alert':'status'} className={previewFailed?'text-red-600 mb-3':'text-gray-500 mb-3'}>{previewFailed?l('预览加载失败，请关闭后重试。','Preview failed to load. Close and try again.','Pratinjau gagal dimuat. Tutup lalu coba lagi.'):l('正在加载电视预览…','Loading TV preview…','Memuat pratinjau TV…')}</p>}
            <iframe
              ref={previewFrame}
              title={tr("preview")}
              className="w-full h-[65vh]"
              srcDoc={tvPlayerDocument.replace('<head>',`<head><base href="${window.location.origin}/tv/">`).replace('<body>','<body data-preview="1">')}
              onLoad={(e) => {
                e.currentTarget.contentWindow?.postMessage(
                  { type: "tv-preview", snapshot: preview },
                  window.location.origin,
                );}
              }
            />
            <p className="text-red-600">{preview.errors.join(" · ")}</p>
          </AdminDialog>
      )}
    </div>
  );
}
export default TVScreensPage;
