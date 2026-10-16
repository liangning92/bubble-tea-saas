/* Shared browser / Android player. Backend determines prices; this module only
 * filters cached schedules and formats published values. No client price calculation. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    native = window.TVNative;
  const words = {
    id: {
      pair: "Hubungkan TV",
      help: "Masukkan kode ini di Pengelolaan TV, pilih layar toko.",
      settings: "Pengaturan",
      sound: "Aktifkan suara",
      server: "Alamat server",
      http: "Izinkan HTTP jaringan lokal",
      test: "Tes koneksi",
      save: "Simpan",
      unpair: "Lepaskan perangkat",
      close: "Tutup",
      offline: "Offline",
      stale: "Harga sementara disembunyikan",
      standby: "Selamat datang",
      price: "Harga belum tersedia",
      failed: "Konten belum tersedia. Periksa koneksi.",
      confirm: "Lepaskan perangkat dan hapus cache?",
      connecting: "Menghubungkan…",
      error: "Gagal",
      online: "Terhubung",
    },
    en: {
      pair: "Connect TV",
      help: "Enter this code in TV management and select the store screen.",
      settings: "Settings",
      sound: "Enable sound",
      server: "Server address",
      http: "Allow local network HTTP",
      test: "Test connection",
      save: "Save",
      unpair: "Unpair device",
      close: "Close",
      offline: "Offline",
      stale: "Prices temporarily hidden",
      standby: "Welcome",
      price: "Price unavailable",
      failed: "No content yet. Check connection.",
      confirm: "Unpair device and clear cache?",
      connecting: "Connecting…",
      error: "Failed",
      online: "Connected",
    },
    zh: {
      pair: "连接电视",
      help: "在电视管理中输入此配对码并选择门店屏幕。",
      settings: "连接设置",
      sound: "启用声音",
      server: "服务器地址",
      http: "允许局域网HTTP",
      test: "测试连接",
      save: "保存",
      unpair: "解除绑定",
      close: "关闭",
      offline: "离线",
      stale: "价格暂时隐藏",
      standby: "欢迎光临",
      price: "价格未配置",
      failed: "暂无内容，请检查网络。",
      confirm: "解除绑定并清除缓存？",
      connecting: "正在连接…",
      error: "失败",
      online: "已连接",
    },
  };
  let language = localStorage.getItem("tv.language") || "id",
    snapshot = null,
    online = false,
    cacheState = "empty",
    errors = [],
    desiredVersion = "",
    page = 0,
    slide = 0,
    pageTimer,
    slideTimer,
    clockTimer,
    pairing = false,
    fetching = false,
    eventBusy = false,
    eventFetching = false,
    pendingAck = JSON.parse(localStorage.getItem("tv.acks") || "[]");
  let origin = new URL(document.baseURI).origin,
    identity = JSON.parse(localStorage.getItem("tv.identity") || "null");
  if (native) {
    const state = JSON.parse(native.state());
    origin = state.server;
    identity = state.identity && state.identity.token ? state.identity : null;
    language = state.language || language;
  }
  let pairGeneration = 0;
  let failedMedia = new Set(),
    mediaFailed = false;
  let reqId = 0;
  const pending = new Map();
  window.TVNativeResponse = function (id, status, body) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    status >= 200 && status < 300
      ? p.resolve(JSON.parse(body))
      : p.reject(Object.assign(Error("HTTP " + status), { status }));
  };
  function t(key) {
    return (words[language] || words.id)[key] || key;
  }
  function labels() {
    document.documentElement.lang = language;
    $("pair-title").textContent = t("pair");
    $("pair-help").textContent = t("help");
    ["settings", "test", "save", "unpair", "close"].forEach(
      (id) => ($(id).textContent = t(id)),
    );
    $("setup-title").textContent = t("settings");
    $("server-label").textContent = t("server");
    $("http-label").textContent = t("http");
  }
  labels();
  async function request(method, path, body) {
    if (native)
      return new Promise((resolve, reject) => {
        const id = ++reqId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error("TIMEOUT"));
        }, 45000);
        pending.set(id, { resolve, reject, timer });
        native.request(id, method, path, body ? JSON.stringify(body) : "");
      });
    const headers = { "Content-Type": "application/json" };
    if (identity) headers["X-TV-Device-Token"] = identity.token;
    const pair = JSON.parse(sessionStorage.getItem("tv.pair") || "null");
    if (pair) headers["X-TV-Pair-Secret"] = pair.secret;
    const res = await fetch(origin + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok)
      throw Object.assign(Error("HTTP " + res.status), { status: res.status });
    return res.json();
  }
  function setIdentity(value) {
    identity = value;
    if (native) native.identity(JSON.stringify(value));
    else localStorage.setItem("tv.identity", JSON.stringify(value));
  }
  async function clearIdentity() {
    pairGeneration++;
    identity = null;
    snapshot = null;
    localStorage.removeItem("tv.identity");
    localStorage.removeItem("tv.snapshot");
    localStorage.removeItem("tv.acks");
    pendingAck = [];
    sessionStorage.removeItem("tv.pair");
    if (native) native.clear();
    else
      for (const k of await caches.keys())
        if (k.startsWith("tv-content-")) await caches.delete(k);
    clearInterval(pageTimer);
    clearTimeout(slideTimer);
    $("media").replaceChildren();
    $("promotions").replaceChildren();
    window.TVLottery.cancel();
    eventBusy = false;
    $("lottery").hidden = true;
    pairing = false;
    $("display").hidden = true;
    $("pair").hidden = false;
    startPair();
  }
  async function startPair() {
    if (pairing || identity) return;
    pairing = true;
    const pairEpoch = pairGeneration;
    $("status").textContent = t("connecting");
    try {
      const json = await request("POST", "/api/tv/pair/request");
      if (pairEpoch !== pairGeneration) return;
      if (!json.success) throw Error(json.message);
      if (native) native.pair(JSON.stringify(json.data));
      else sessionStorage.setItem("tv.pair", JSON.stringify(json.data));
      $("pin").textContent =
        json.data.pin.slice(0, 3) + " " + json.data.pin.slice(3);
      const session = json.data;
      while (!identity && pairEpoch === pairGeneration) {
        await new Promise((r) => setTimeout(r, 3000));
        const result = await request("GET", "/api/tv/pair/check/" + session.id);
        if (pairEpoch !== pairGeneration) return;
        if (result.data.expired) break;
        if (result.data.paired) {
          setIdentity(result.data);
          await refresh();
          break;
        }
      }
    } catch (e) {
      $("status").textContent = t("failed");
      recordError(e.message);
    } finally {
      if (pairEpoch === pairGeneration) {
        pairing = false;
        if (!identity) setTimeout(startPair, 5000);
      }
    }
  }
  function recordError(message) {
    errors = [...errors.slice(-18), String(message).slice(0, 300)];
  }
  function estimatedTime() {
    if (!snapshot || snapshot.timeTrusted === false) return null;
    const checked = Number(snapshot.checkedAt),
      wall = Date.now();
    if (!checked || wall < checked - 60000) return null;
    return Date.parse(snapshot.serverTime) + (wall - checked);
  }
  function freshPrices() {
    const now = estimatedTime();
    return now !== null && now <= Date.parse(snapshot.validUntil);
  }
  function eligible(a) {
    const now = estimatedTime();
    if (now === null || !freshPrices()) return false;
    if (
      (a.startsAt && now < Date.parse(a.startsAt)) ||
      (a.endsAt && now >= Date.parse(a.endsAt))
    )
      return false;
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: a.timezone || snapshot.store.timezone,
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).formatToParts(new Date(now)),
        get = (k) => parts.find((p) => p.type === k).value;
      let day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        get("weekday"),
      );
      const minute = Number(get("hour")) * 60 + Number(get("minute")),
        minutes = (s) => Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]);
      if (a.dailyStart && a.dailyEnd) {
        const start = minutes(a.dailyStart),
          end = minutes(a.dailyEnd);
        if (start < end) {
          if (minute < start || minute >= end) return false;
        } else {
          if (minute >= end && minute < start) return false;
          if (minute < end) day = (day + 6) % 7;
        }
      }
      return !a.weekdays.length || a.weekdays.includes(day);
    } catch {
      return false;
    }
  }
  function assetUrl(url) {
    const asset = snapshot && snapshot.assets.find((a) => a.url === url);
    if (native)
      return asset
        ? "https://appassets.androidplatform.net/cache/" + asset.sha256
        : "";
    return (
      (url.startsWith("/") ? origin + url : url) +
      (asset ? "?tv-sha=" + asset.sha256 : "")
    );
  }
  function element(tag, text, cls) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  function money(n) {
    return new Intl.NumberFormat(snapshot.store.locale, {
      style: "currency",
      currency: snapshot.store.currency,
      maximumFractionDigits: 2,
    }).format(n);
  }
  function productCards() {
    return snapshot.menu.flatMap((p) => {
      if (p.specs.length <= 3) return [p];
      const cards = [];
      for (let i = 0; i < p.specs.length; i += 3)
        cards.push({ ...p, specs: p.specs.slice(i, i + 3) });
      return cards;
    });
  }
  function appendPrices(info,p,compact=false) {
    if (freshPrices()) {
        if (!p.specs.length) info.append(element("p", t("price")));
        for (const spec of p.specs) {
          const line = element("p");
          if(!compact||p.specs.length>1)line.append(element("small", spec.name + " "));
          const promotion =
            spec.activityId &&
            snapshot.promotions.find((a) => a.id === spec.activityId);
          const applicable =
            !spec.activityId || (promotion && eligible(promotion));
          if (applicable && spec.displayPrice < spec.basePrice)
            line.append(element("del", money(spec.basePrice)));
          line.append(
            document.createTextNode(
              money(applicable ? spec.displayPrice : spec.basePrice),
            ),
          );
          info.append(line);
        }
      }
  }
  let heroProduct = null;
  function catalogMode() { return snapshot?.settings.layoutTemplate === 'product_catalog'; }
  function categoryGroups() {
    const groups=new Map();
    for(const p of snapshot.menu){const name=p.category||(language==='zh'?'全部产品':language==='en'?'All products':'Semua produk');if(!groups.has(name))groups.set(name,[]);groups.get(name).push(p);}
    return Array.from(groups,([name,products])=>({name,products}));
  }
  function fitCatalog() {
    if(!catalogMode())return;
    const board=$('products').querySelector('.catalog-categories');if(!board)return;
    const groups=categoryGroups(),count=snapshot.menu.length,columns=count>38?3:count>10?2:1;
    board.style.setProperty('--catalog-columns',columns);
    let size=Math.min(30,Math.floor(board.clientHeight*columns/Math.max(1,count*1.85+groups.length*2.5)));
    const minimum=innerWidth<500?12:16;size=Math.max(minimum,size);board.style.fontSize=size+'px';
    while(size>minimum&&(board.scrollWidth>board.clientWidth+1||board.scrollHeight>board.clientHeight+1))board.style.fontSize=--size+'px';
    // Small preview windows can scroll manually; the TV menu itself never advances or omits rows.
    board.classList.toggle('catalog-overflow',board.scrollWidth>board.clientWidth+1||board.scrollHeight>board.clientHeight+1);
  }
  function refreshHeroCaption() {
    const caption=$('media').querySelector('.hero-caption');if(!caption||!heroProduct)return;
    caption.replaceChildren(element('h2',heroProduct.name));appendPrices(caption,heroProduct,true);
  }
  function renderCatalog() {
    const section=$('products'),groups=categoryGroups();section.replaceChildren();
    if(!groups.length){section.append(element('h2',language==='zh'?'暂无可展示产品':language==='en'?'No products to display':'Belum ada produk'));return;}
    const board=element('div',undefined,'catalog-categories');
    for(const group of groups){
      const category=element('section',undefined,'catalog-category');category.append(element('h2',group.name));
      for(const p of group.products){const row=element('article',undefined,'catalog-product'),prices=element('div',undefined,'catalog-prices');row.append(element('h3',p.name));appendPrices(prices,p,true);row.append(prices);category.append(row);}
      board.append(category);
    }
    section.append(board);refreshHeroCaption();requestAnimationFrame(fitCatalog);
  }
  function renderHero() {
    const section=$('media');section.style.removeProperty('--backdrop');heroProduct=null;
    const pictured=snapshot.menu.filter(p=>p.image),items=pictured.length?pictured:snapshot.menu;
    if(!items.length){section.append(element('h2',snapshot.store.name));return;}
    slide%=items.length;const p=items[slide];heroProduct=p;
    const hero=element('div',undefined,'product-hero'),placeholder=()=>{const empty=element('div',undefined,'hero-placeholder');empty.append(element('strong',p.name.slice(0,1)),element('span',language==='zh'?'暂无产品图片':language==='en'?'Product photo unavailable':'Foto produk belum tersedia'));return empty;};
    if(p.image){const img=element('img',undefined,'hero-image');img.alt=p.name;img.src=assetUrl(p.image);img.onerror=()=>{img.replaceWith(placeholder());recordError('IMAGE:'+p.id);};hero.append(img);}else hero.append(placeholder());
    hero.append(element('div',undefined,'hero-caption'));section.append(hero);refreshHeroCaption();
    slideTimer=setTimeout(()=>{slide=(slide+1)%items.length;playSlide();},snapshot.settings.mediaIntervalSeconds*1000);
  }
  function renderProducts() {
    if (!snapshot) return;
    if (catalogMode()) {renderCatalog();return;}
    const grid = $("products");
    grid.replaceChildren();
    const count = snapshot.settings.orientation === "portrait" ? 6 : 8,
      items = productCards().slice(page * count, (page + 1) * count);
    if (!items.length) {
      page = 0;
      return;
    }
    for (const p of items) {
      const card = element("article"),
        info = element("div");
      if (p.image) {
        const img = element("img");
        img.src = assetUrl(p.image);
        img.alt = p.name;
        img.onerror = () => {
          img.remove();
          recordError("IMAGE:" + p.id);
        };
        card.append(img);
      }
      info.append(element("small", p.category), element("h3", p.name));
      appendPrices(info,p);
      card.append(info);
      grid.append(card);
    }
  }
  function promotionText(a) {
    const labels = {
      zh: {
        off: "优惠",
        minimum: "最低消费",
        member: "会员专享",
        payment: "支付方式",
        cup: "第几杯优惠",
        buy: "购买",
        get: "赠送",
        conditions: "参与条件", birthday:"生日限定",welcome:"首次购买",people:"人",couponClaim:"领取优惠券",couponPurchase:"购买后获得优惠券",limit:"每位会员限次",
        special: "特价",
        bundle: "套餐",
        gift: "赠品",
        lottery: "订单抽奖",
        points: "积分",
        stamps: "集章",
        coupon: "优惠券",
        referral: "邀请奖励",
        group: "拼团",
        addon: "加料优惠",
        upgrade: "升级优惠",
      },
      en: {
        off: "off",
        minimum: "Minimum spend",
        member: "Members only",
        payment: "Payment methods",
        cup: "Cup offer",
        buy: "Buy",
        get: "Get",
        conditions: "Eligibility",birthday:"Birthday only",welcome:"First purchase",people:"people",couponClaim:"Claim coupon",couponPurchase:"Coupon after purchase",limit:"Per-member limit",
        special: "Special price",
        bundle: "Bundle",
        gift: "Gift",
        lottery: "Order lottery",
        points: "Points",
        stamps: "Stamps",
        coupon: "Coupon",
        referral: "Referral reward",
        group: "Group offer",
        addon: "Topping offer",
        upgrade: "Upgrade offer",
      },
      id: {
        off: "diskon",
        minimum: "Belanja minimum",
        member: "Khusus anggota",
        payment: "Metode pembayaran",
        cup: "Penawaran gelas",
        buy: "Beli",
        get: "Gratis",
        conditions: "Syarat",birthday:"Khusus ulang tahun",welcome:"Pembelian pertama",people:"orang",couponClaim:"Klaim kupon",couponPurchase:"Kupon setelah pembelian",limit:"Batas per anggota",
        special: "Harga spesial",
        bundle: "Paket",
        gift: "Hadiah",
        lottery: "Undian pesanan",
        points: "Poin",
        stamps: "Stempel",
        coupon: "Kupon",
        referral: "Hadiah undangan",
        group: "Penawaran kelompok",
        addon: "Penawaran topping",
        upgrade: "Penawaran peningkatan",
      },
    };
    const l = labels[language] || labels.id,
      r = a.rule || {},
      parts = [];
    if (r.price !== undefined) parts.push((a.type==="bundle"?l.bundle:a.type==="group"?l.group:l.special) + ": " + money(r.price));
    else if (r.percent !== undefined) parts.push(r.percent + "% " + l.off);
    else if (r.amount !== undefined) parts.push(money(r.amount) + " " + l.off);
    else parts.push(l[a.type] || l.conditions);
    if (r.minAmount) parts.push(l.minimum + ": " + money(r.minAmount));
    if (a.memberOnly || (a.memberLevels || []).length)
      parts.push(
        l.member +
          ((a.memberLevels || []).length
            ? " (" + a.memberLevels.join(", ") + ")"
            : ""),
      );
    if ((a.paymentMethods || []).length)
      parts.push(l.payment + ": " + a.paymentMethods.join(", "));
    if (r.nth) parts.push(l.cup + ": " + r.nth);
    if (r.buy) parts.push(l.buy + " " + r.buy + ", " + l.get + " " + r.get);
    if(a.products?.length)parts.push(a.products.slice(0,2).map(p=>p.name+(p.quantity?' ×'+p.quantity:'')+(p.specs?.length?' ('+p.specs.map(s=>s.name).join('/')+')':'')).join(' + ')+(a.products.length>2?' +…':''));
    if(r.participants)parts.push(r.participants+' '+l.people);
    if(['birthday','welcome'].includes(a.type))parts.push(l[a.type]);
    if(r.perMemberLimit)parts.push(l.limit+': '+r.perMemberLimit);
    if(a.type==='coupon')parts.push(r.couponTrigger==='claim'?l.couponClaim:l.couponPurchase);
    if(a.type==='points')parts.push(l.points+(r.multiplier?' ×'+r.multiplier:'')+(r.points?' +'+r.points:''));
    if(r.stampsRequired)parts.push(l.stamps+': '+r.stampsRequired);
    if(r.addonNames?.length)parts.push(r.addonNames.join(', '));
    if(r.tiers?.length)parts.push(r.tiers.map(t=>l.minimum+' '+money(t.minAmount)+' → '+(t.percent!==undefined?t.percent+'% '+l.off:money(t.amount)+' '+l.off)).join(' / '));
    return [...parts, a.description].filter(Boolean).join(" · ");
  }
  function renderPromotions() {
    const box = $("promotions");
    box.replaceChildren();
    if (
      !snapshot.screen.isActive ||
      !snapshot.settings.showActivities ||
      snapshot.settings.activityDisplayType === "badges_only"
    )
      return;
    const active = snapshot.promotions.filter(eligible),
      batch =
        Math.floor(
          (estimatedTime() || 0) / (snapshot.settings.pageSeconds * 1000),
        ) % Math.max(1, Math.ceil(active.length / 3));
    for (const a of active.slice(batch * 3, batch * 3 + 3)) {
      const item = element("div");
      item.append(element("strong", a.name), element("p", promotionText(a)));
      box.append(item);
    }
  }
  function playSlide() {
    clearTimeout(slideTimer);
    const section = $("media");
    for (const old of section.children) {
      old.onerror =
        old.onended =
        old.onloadeddata =
        old.onwaiting =
        old.onplaying =
          null;
      if (old.tagName === "VIDEO") {
        old.pause();
        old.removeAttribute("src");
        old.load();
      }
    }
    section.replaceChildren();
    if (!snapshot) return;
    if(catalogMode()){renderHero();return;}
    const items = snapshot.media.length
      ? snapshot.media
      : snapshot.menu
          .filter((p) => p.image)
          .map((p) => ({ url: p.image, kind: "image", name: p.name }));
    if (!items.length) {
      section.append(element("h2", snapshot.store.name));
      return;
    }
    slide %= items.length;
    for (
      let tries = 0;
      tries < items.length && failedMedia.has(items[slide].url);
      tries++
    )
      slide = (slide + 1) % items.length;
    const item = items[slide],
      el = element(item.kind === "video" ? "video" : "img"),
      next = () => {
        slide = (slide + 1) % items.length;
        playSlide();
      };
    el.src = assetUrl(item.url);
    section.style.setProperty(
      "--backdrop",
      snapshot.settings.mediaFitMode === "contain_blur" && item.kind !== "video"
        ? "url(" + JSON.stringify(el.src) + ")"
        : "none",
    );
    el.style.objectFit =
      snapshot.settings.mediaFitMode === "cover" ? "cover" : "contain";
    el.onerror = () => {
      clearTimeout(slideTimer);
      failedMedia.add(item.url);
      if (items.every((m) => failedMedia.has(m.url))) {
        mediaFailed = true;
        recordError("MEDIA_ALL_FAILED");
        section.replaceChildren(element("h2", snapshot.store.name));
        if (snapshot.menu.length) document.body.classList.add("media-failed");
        return;
      }
      recordError("MEDIA:" + item.url);
      slideTimer = setTimeout(next, 1000);
    };
    if (item.kind === "video") {
      el.autoplay = true;
      el.muted = true;
      el.playsInline = true;
      el.onended = next;
      el.onloadeddata = () => clearTimeout(slideTimer);
      el.onwaiting = () => {
        clearTimeout(slideTimer);
        slideTimer = setTimeout(() => el.onerror(), 30000);
      };
      el.onplaying = () => clearTimeout(slideTimer);
      slideTimer = setTimeout(() => {
        recordError("VIDEO_TIMEOUT:" + item.url);
        next();
      }, 30000);
      el.play().catch((e) => {
        if (e.name !== "AbortError") recordError(e.message);
      });
    } else {
      el.alt = item.name;
      slideTimer = setTimeout(
        next,
        snapshot.settings.mediaIntervalSeconds * 1000,
      );
    }
    section.append(el);
  }
  let musicTimer,
    failedMusic = new Set();
  let audio = null,
    audioIndex = 0;
  function music() {
    clearTimeout(musicTimer);
    if (audio) {
      audio.onended = audio.onerror = null;
      audio.pause();
      audio.remove();
      audio = null;
    }
    if (
      eventBusy ||
      !snapshot.settings.musicEnabled ||
      !snapshot.music.length ||
      !snapshot.screen.isActive
    )
      return;
    for (
      let tries = 0;
      tries < snapshot.music.length &&
      failedMusic.has(snapshot.music[audioIndex % snapshot.music.length].url);
      tries++
    )
      audioIndex++;
    if (snapshot.music.every((m) => failedMusic.has(m.url))) {
      recordError("AUDIO_ALL_FAILED");
      return;
    }
    audio = element("audio");
    audio.volume = snapshot.settings.volume;
    audio.src = assetUrl(
      snapshot.music[audioIndex % snapshot.music.length].url,
    );
    audio.onended = () => {
      audioIndex++;
      music();
    };
    const currentAudio = audio,
      track = snapshot.music[audioIndex % snapshot.music.length];
    audio.onerror = () => {
      if (audio !== currentAudio) return;
      failedMusic.add(track.url);
      recordError("AUDIO_FAILED");
      audioIndex++;
      musicTimer = setTimeout(music, 1000);
    };
    document.body.append(audio);
    audio
      .play()
      .then(() => {
        $("enable-sound").hidden = true;
      })
      .catch((e) => {
        if (audio !== currentAudio || e.name === "AbortError") return;
        if (e.name === "NotAllowedError") {
          $("enable-sound").textContent = t("sound");
          $("enable-sound").hidden = false;
        } else currentAudio.onerror();
      });
  }
  function apply(data) {
    const changed = !snapshot || snapshot.version !== data.version;
    snapshot = data;
    language = data.store.locale.split("-")[0];
    labels();
    $("pair").hidden = true;
    $("display").hidden = false;
    $("brand").textContent = data.store.name;
    $("store-logo").hidden = !data.store.logo;
    if (data.store.logo) {
      $("store-logo").src = assetUrl(data.store.logo);
      $("store-logo").onerror = () => {
        $("store-logo").hidden = true;
      };
    }
    $("channel").textContent = data.channel.name;
    document.body.className = [
      data.settings.themeStyle,
      data.settings.layoutTemplate,
      data.settings.orientation,
    ].join(" ");
    $("display").style.padding = data.settings.safeAreaPadding + "vmin";
    $("ticker").textContent = data.settings.marqueeText;
    $("ticker").style.animationDuration = 60 / data.settings.marqueeSpeed + "s";
    if (changed) {
      failedMedia.clear();
      failedMusic.clear();
      mediaFailed = false;
      errors = errors.filter((e) => e !== "MEDIA_ALL_FAILED");
      page = 0;
      slide = 0;
      heroProduct=null;
      clearInterval(pageTimer);
      if (data.screen.isActive) {
        renderProducts();
        if(data.settings.layoutTemplate!=="menu_full")playSlide();else{clearTimeout(slideTimer);$("media").replaceChildren();}
        music();
        if(!catalogMode())pageTimer = setInterval(() => {
          page =
            (page + 1) %
            Math.max(
              1,
              Math.ceil(
                productCards().length /
                  (snapshot.settings.orientation === "portrait" ? 6 : 8),
              ),
            );
          renderProducts();
        }, data.settings.pageSeconds * 1000);
      } else {
        window.TVLottery.cancel();
        $("products").replaceChildren();
        $("media").replaceChildren(element("h2", t("standby")));
        clearTimeout(slideTimer);
        if (audio) audio.pause();
      }
    }
    renderPromotions();
    updateClock();
  }
  let lastPriceState = "";
  function updateClock() {
    if (!snapshot) return;
    $("clock").textContent = new Intl.DateTimeFormat(snapshot.store.locale, {
      timeZone: snapshot.store.timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    $("network").textContent =
      (online ? t("online") : t("offline")) +
      (!freshPrices() ? " · " + t("stale") : "");
    if (!snapshot.screen.isActive) return;
    renderPromotions();
    const priceState =
      String(freshPrices()) +
      snapshot.promotions
        .filter(eligible)
        .map((a) => a.id)
        .join(",");
    if (priceState !== lastPriceState) {
      lastPriceState = priceState;
      renderProducts();
    }
  }
  async function browserCommit(data) {
    const bytes = data.assets.reduce((n, a) => n + a.size, 0);
    if (bytes > 1073741824) throw Error("CACHE_LIMIT");
    const old = JSON.parse(localStorage.getItem("tv.snapshot") || "null");
    if (
      old &&
      old.version !== data.version &&
      bytes + old.assets.reduce((n, a) => n + a.size, 0) > 1073741824
    )
      throw Error("CACHE_LIMIT");
    const name = "tv-content-" + data.version,
      cache = await caches.open(name);
    for (const asset of data.assets) {
      const url = origin + asset.url + "?tv-sha=" + asset.sha256;
      let res = await cache.match(url);
      if (!res) {
        res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) throw Error("ASSET_HTTP");
        const buffer = await res.arrayBuffer(),
          digest = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
          )
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        if (buffer.byteLength !== asset.size || digest !== asset.sha256)
          throw Error("ASSET_CHECKSUM");
        await cache.put(url, new Response(buffer, { headers: res.headers }));
      }
    }
    if (old && old.version !== data.version)
      localStorage.setItem("tv.previous", JSON.stringify(old));
    localStorage.setItem("tv.snapshot", JSON.stringify(data));
    for (const key of await caches.keys())
      if (
        key.startsWith("tv-content-") &&
        key !== name &&
        key !== "tv-content-" + (old && old.version)
      )
        await caches.delete(key);
  }
  window.TVCacheReady = function (raw) {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    cacheState = "ready";
    apply(data);
  };
  window.TVClockInvalid = function () {
    if (snapshot) {
      snapshot.timeTrusted = false;
      updateClock();
    }
  };
  window.TVCacheFailed = function (message) {
    cacheState = "failed";
    recordError(message);
  };
  async function refresh() {
    if (!identity || fetching) return;
    fetching = true;
    try {
      const result = await request("GET", "/api/tv/device/content");
      if (!result.success) throw Error(result.message);
      online = true;
      const data = { ...result.data, checkedAt: Date.now() };
      desiredVersion = data.version;
      if (snapshot && snapshot.version === data.version) {
        snapshot = {
          ...snapshot,
          serverTime: data.serverTime,
          checkedAt: data.checkedAt,
          validUntil: data.validUntil,
          timeTrusted: true,
        };
        if (native) native.commit(JSON.stringify(snapshot));
        else localStorage.setItem("tv.snapshot", JSON.stringify(snapshot));
        updateClock();
      } else {
        cacheState = "downloading";
        if (native) native.commit(JSON.stringify(data));
        else {
          await browserCommit(data);
          cacheState = "ready";
          apply(data);
        }
      }
    } catch (e) {
      online = false;
      recordError(e.message);
      if (e.status === 401) {
        await clearIdentity();
        return;
      }
      if (snapshot) updateClock();
      else $("status").textContent = t("failed");
    } finally {
      fetching = false;
      heartbeat();
    }
  }
  async function heartbeat() {
    if (!identity) return;
    try {
      await request("POST", "/api/tv/device/heartbeat", {
        appVersion: native
          ? JSON.parse(native.state()).appVersion
          : window.TV_BUILD?.appVersion || "browser-development",
        sourceSha: native
          ? JSON.parse(native.state()).sourceSha
          : window.TV_BUILD?.sourceSha || "development",
        version: snapshot ? snapshot.version : "",
        desiredVersion,
        cacheState,
        playbackState: snapshot
          ? snapshot.screen.isActive
            ? mediaFailed
              ? "failed"
              : "playing"
            : "standby"
          : "failed",
        resolution: innerWidth + "x" + innerHeight,
        errors,
        acknowledged: pendingAck,
      });
      pendingAck = [];
      localStorage.setItem("tv.acks", "[]");
    } catch {}
  }
  async function presentDraw(event, preview = false) {
    if(eventBusy) return false;
    const epoch = pairGeneration;
    eventBusy = true;
    if(audio) audio.pause();
    try {
      const completed = await window.TVLottery.play(event,{language,timezone:snapshot?.store.timezone});
      if(completed && !preview && epoch===pairGeneration && identity) {
        pendingAck.push(event.eventId);
        localStorage.setItem("tv.acks",JSON.stringify(pendingAck));
        await heartbeat();
      }
      return completed;
    } finally {
      eventBusy = false;
      if(snapshot) {
        if(audio && snapshot.screen.isActive && snapshot.settings.musicEnabled) audio.play().catch(()=>{ $("enable-sound").textContent=t("sound");$("enable-sound").hidden=false; });
        else music();
      }
    }
  }
  async function events() {
    if (!identity || !online || eventBusy || eventFetching || !snapshot || !snapshot.screen.isActive) return;
    eventFetching = true;
    const epoch=pairGeneration;
    try {
      const json=await request("GET","/api/tv/device/events");
      const event=json.data.find(e => !pendingAck.includes(e.eventId) && Date.parse(e.expiresAt)>estimatedTime());
      if(event && epoch===pairGeneration && !eventBusy) await presentDraw(event);
    } catch {} finally { eventFetching=false; }
  }
  function openSetup() {
    $("server").value = origin;
    $("setup").showModal();
    $("server").focus();
  }
  $("settings").onclick = openSetup;
  $("enable-sound").onclick = music;
  window.TVOpenSettings = openSetup;
  window.addEventListener("keydown", (e) => {
    if (["m", "M", "Menu", "ContextMenu"].includes(e.key) || e.keyCode === 82) {
      e.preventDefault();
      openSetup();
    }
  });
  window.TVServerTest = (status) => {
    $("test-result").textContent =
      status === 200 ? t("online") : t("error") + " HTTP " + status;
  };
  $("test").onclick = async () => {
    try {
      const value = new URL($("server").value);
      validateServer(value);
      if (native) {
        $("test-result").textContent = native.test(
          value.origin,
          $("allow-http").checked,
        );
      } else {
        const res = await fetch(value.origin + "/api/health", {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw Error("HTTP " + res.status);
        $("test-result").textContent = t("online");
      }
    } catch (e) {
      $("test-result").textContent = t("error") + ": " + e.message;
    }
  };
  function privateHost(host) {
    if (host === "localhost") return true;
    const parts = host.split(".");
    if (
      parts.length !== 4 ||
      parts.some((p) => !/^\d+$/.test(p) || Number(p) > 255)
    )
      return false;
    const [a, b] = parts.map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31)
    );
  }
  function validateServer(value) {
    if (value.protocol === "https:") return;
    if (
      value.protocol !== "http:" ||
      !$("allow-http").checked ||
      !privateHost(value.hostname)
    )
      throw Error("HTTPS_REQUIRED");
  }
  $("save").onclick = async () => {
    try {
      const value = new URL($("server").value);
      validateServer(value);
      if (value.origin !== origin) {
        if (native) {
          native.server(value.origin, $("allow-http").checked);
          return;
        }
        await clearIdentity();
        location.assign(value.origin + "/tv/");
        return;
      }
      $("setup").close();
    } catch (e) {
      $("test-result").textContent = e.message;
    }
  };
  $("unpair").onclick = () => {
    if (confirm(t("confirm"))) {
      $("setup").close();
      clearIdentity();
    }
  };
  async function boot() {
    if (new URLSearchParams(location.search).get("preview") === "1" || document.body.dataset.preview === "1") {
      const previewOrigin = new URL(document.baseURI).origin;
      window.addEventListener("message", (e) => {
        if(e.source!==window.parent || !e.data) return;
        if (e.origin === previewOrigin && e.data.type === "tv-preview") {
          online = true;
          apply({ ...e.data.snapshot, checkedAt: Date.now() });
          window.parent.postMessage({type:"tv-preview-applied"},previewOrigin);
        } else if(e.source===window.parent && e.origin===previewOrigin && e.data.type==="tv-lottery-preview" && e.data.event?.testMode===true) {
          presentDraw(e.data.event,true).finally(()=>window.parent.postMessage({type:"tv-lottery-preview-finished"},previewOrigin));
        }
      });
      window.parent.postMessage({type:"tv-preview-ready"},previewOrigin);
      return;
    }
    if (!native && "serviceWorker" in navigator)
      try {
        await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      } catch (e) {
        recordError(e.message);
      }
    const saved = native
      ? native.cached()
      : localStorage.getItem("tv.snapshot");
    if (saved && identity)
      try {
        cacheState = "ready";
        apply(JSON.parse(saved));
      } catch (e) {
        recordError(e.message);
      }
    if (identity) refresh();
    else startPair();
    setInterval(refresh, 8000);
    setInterval(events, 5000);
    clockTimer = setInterval(updateClock, 1000);
  }
  boot();
  window.addEventListener('resize',()=>{if(catalogMode())requestAnimationFrame(fitCatalog);});
  window.TVTest = { eligible, freshPrices, apply, displaySpec: renderProducts };
})();
