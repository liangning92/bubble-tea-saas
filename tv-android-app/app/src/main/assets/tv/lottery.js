/* Authoritative result presentation. Equal display sectors are not a new draw. */
(function (root) {
  "use strict";
  const colors = ["#F8BFD0", "#F6D99B", "#BFE2CE", "#BFDDF1", "#D9C7EC", "#F5C7AF", "#C6DFDF"];
  function model(event) {
    if (!event || typeof event.prizeName !== "string" || !event.prizeName.trim()) throw Error("DRAW_RESULT_MISSING");
    let prizes = (Array.isArray(event.prizes) ? event.prizes : []).slice(0, 30).map((p, i) => ({
      id: String(p.id || ""), name: String(p.name || "").slice(0, 100),
      color: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : colors[i % colors.length],
    }));
    let index = Number.isInteger(event.prizeIndex) ? event.prizeIndex : -1;
    if (!prizes[index] || prizes[index].name !== event.prizeName || (event.prizeId && prizes[index].id !== event.prizeId))
      index = prizes.findIndex(p => event.prizeId ? p.id === event.prizeId && p.name === event.prizeName : p.name === event.prizeName);
    // Old API results without a pool still show their exact result; never invent prizes.
    if (index < 0) { prizes = [{ id: event.prizeId || "result", name: event.prizeName, color: colors[0] }]; index = 0; }
    return { prizes, index, rotation: 2160 + ((360 - (index + 0.5) * 360 / prizes.length) % 360) };
  }
  const words = {
    zh: ["幸运抽奖", "演示 · 不发奖", "订单", "好运即将揭晓", "一起倒数，看看这次的好运！", "转盘正在旋转", "目光锁定指针，惊喜即将揭晓", "您的抽奖结果", "感谢参与，请按活动规则确认领取。", "好运", "准备", "揭晓"],
    en: ["LUCKY DRAW", "PREVIEW · NO REWARD", "ORDER", "Your lucky moment", "Count down together. Your result is on its way!", "Around it goes…", "Watch the pointer. The reveal is coming!", "Your draw result", "Thank you for joining. Claim according to the offer rules.", "LUCK", "READY", "REVEAL"],
    id: ["UNDIAN BERUNTUNG", "DEMO · TANPA HADIAH", "PESANAN", "Saatnya mencoba keberuntungan", "Hitung mundur bersama. Hasilnya segera tiba!", "Roda sedang berputar…", "Perhatikan penunjuknya. Hasil segera muncul!", "Hasil undian Anda", "Terima kasih. Penukaran mengikuti ketentuan promo.", "HOKI", "SIAP", "HASIL"],
  };
  let cancelCurrent = null;
  function play(event, options) {
    if (cancelCurrent) return Promise.resolve(false);
    const m = model(event), doc = root.document, $ = id => doc.getElementById(id),
      copy = words[options.language] || words.id, overlay = $("lottery"), wheel = $("draw-wheel"),
      reduced = root.matchMedia("(prefers-reduced-motion: reduce)").matches,
      countdownMs = 3000, spinMs = reduced ? 600 : 6000, revealMs = event.coupon?.code ? 30000 : 6000;
    const svg = (tag, attributes) => { const el = doc.createElementNS("http://www.w3.org/2000/svg", tag); Object.entries(attributes || {}).forEach(([k,v]) => el.setAttribute(k,String(v))); return el; };
    wheel.replaceChildren();
    const point = (angle, radius) => [300 + radius * Math.cos(angle * Math.PI / 180), 300 + radius * Math.sin(angle * Math.PI / 180)];
    m.prizes.forEach((p,i) => {
      const width = 360 / m.prizes.length, start = -90 + i*width, end = start+width,
        a = point(start,284), b = point(end,284), middle = start+width/2;
      if(m.prizes.length === 1) wheel.append(svg("circle",{cx:300,cy:300,r:284,fill:p.color}));
      else wheel.append(svg("path",{d:`M300 300 L${a[0]} ${a[1]} A284 284 0 ${width>180?1:0} 1 ${b[0]} ${b[1]} Z`,fill:p.color,stroke:"#f6db9a","stroke-width":1.5}));
      const pos = point(middle, m.prizes.length===1 ? 185 : 194),
        text = svg("text",{x:pos[0],y:pos[1],fill:(parseInt(p.color.slice(1,3),16)*.2126+parseInt(p.color.slice(3,5),16)*.7152+parseInt(p.color.slice(5,7),16)*.0722)>160?"#593147":"#fff","font-size":m.prizes.length>12?13: m.prizes.length>8?17:22,"font-weight":700,"text-anchor":"middle","dominant-baseline":"middle",transform:`rotate(${middle+90} ${pos[0]} ${pos[1]})`});
      const chars = Array.from(p.name), chunk = m.prizes.length>12?9:12;
      const rows=[];let remaining=p.name;
      while(remaining && rows.length<3){
        let end=Math.min(Array.from(remaining).length,chunk),part=Array.from(remaining).slice(0,end).join("");
        const space=part.lastIndexOf(" ");if(space>chunk/2 && remaining.length>part.length){part=part.slice(0,space);end=Array.from(part).length;}
        rows.push(part.trim());remaining=Array.from(remaining).slice(end).join("").trimStart();
      }
      rows.forEach((line,n)=>{const span=svg("tspan",{x:pos[0],dy:n?"1.15em":`${-(rows.length-1)*0.575}em`});span.textContent=line+(n===rows.length-1&&chars.length>chunk*3?"…":"");text.append(span);});
      wheel.append(text);
    });
    overlay.dataset.phase = "countdown";
    $("draw-coupon").hidden=true;
    overlay.classList.toggle('draw-has-coupon',!!event.coupon?.code);
    overlay.setAttribute("aria-label",copy[0]);
    $("draw-kicker").textContent=copy[0];
    $("draw-preview").textContent=copy[1];$("draw-preview").hidden=!event.testMode;
    $("lottery-order").textContent=copy[2]+" "+String(event.orderNumber||"").slice(0,50);
    $("lottery-prize").hidden=true;$("lottery-prize").textContent="";
    $("draw-footer").textContent=event.testMode?copy[1]:"";
    $("draw-confetti").replaceChildren();
    for(let i=0;i<32;i++){const bit=doc.createElement("i");bit.style.cssText=`--x:${(i*31)%100}%;--delay:${(i%8)*0.15}s;--turn:${i*47}deg;background:${["#f4d58b","#7cd5c0","#eea3bc"][i%3]}`;$("draw-confetti").append(bit);}
    wheel.style.transform="rotate(0deg)";overlay.hidden=false;
    let frame, previous=null, elapsed=0, phase="";
    return new Promise(resolve => {
      const finish = completed => {
        root.cancelAnimationFrame(frame); cancelCurrent=null; overlay.hidden=true;
        overlay.removeAttribute("data-phase");wheel.style.transform="rotate(0deg)";
        resolve(completed);
      };
      cancelCurrent=()=>finish(false);
      function tick(now) {
        if(previous!==null) elapsed+=Math.min(100,Math.max(0,now-previous));
        previous=now;
        const next=elapsed<countdownMs?"countdown":elapsed<countdownMs+spinMs?"spinning":"result";
        if(next!==phase){phase=next;overlay.dataset.phase=phase;
          $("draw-heading").textContent=copy[phase==="countdown"?3:phase==="spinning"?5:7];
          $("draw-description").textContent=copy[phase==="countdown"?4:phase==="spinning"?6:8];
          $("draw-hub-label").textContent=copy[phase==="countdown"?10:phase==="spinning"?9:11];
          if(phase==="result"){
            $("lottery-prize").textContent=event.prizeName;$("lottery-prize").hidden=false;
            if(event.coupon?.code){
              const coupon=event.coupon,money=value=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(value)||0),lang=options.language;
              $("draw-coupon").hidden=false;$("draw-coupon-code").textContent=coupon.code;
              $("draw-coupon-label").textContent=lang==='zh'?'您的专属券码':lang==='en'?'YOUR VOUCHER CODE':'KODE VOUCHER ANDA';
              let terms=coupon.type==='discount_fixed'?'Rp '+money(coupon.value):coupon.type==='discount_percent'?coupon.value+'%':'';
              if(coupon.minOrder)terms+=' · '+(lang==='zh'?'最低消费 ':lang==='en'?'Min. spend ':'Min. belanja ')+'Rp '+money(coupon.minOrder);
              if(coupon.validUntil)terms+=' · '+(lang==='zh'?'有效期至 ':lang==='en'?'Valid until ':'Berlaku s.d. ')+new Intl.DateTimeFormat(lang==='zh'?'zh-CN':lang==='en'?'en-GB':'id-ID',{timeZone:options.timezone||'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(coupon.validUntil));
              $("draw-coupon-terms").textContent=terms;
              $("draw-coupon-photo").textContent=event.testMode?(lang==='zh'?'演示券码，不可核销。':lang==='en'?'Demo code. Cannot be redeemed.':'Kode demo. Tidak dapat ditukar.'):lang==='zh'?'请拍照保存，下次消费出示券码。仅可使用一次。':lang==='en'?'Take a photo. Show this code to the cashier next time. One use only.':'Foto dan simpan. Tunjukkan kode kepada kasir saat kunjungan berikutnya. Sekali pakai.';
            }
          }
        }
        $("draw-countdown").textContent=phase==="countdown"?String(Math.max(1,Math.ceil((countdownMs-elapsed)/1000))):"★";
        const progress=Math.max(0,Math.min(1,(elapsed-countdownMs)/spinMs));
        wheel.style.transform=`rotate(${m.rotation*(1-Math.pow(1-progress,5))}deg)`;
        overlay.style.setProperty("--draw-progress",Math.min(1,elapsed/(countdownMs+spinMs+revealMs)));
        if(elapsed>=countdownMs+spinMs+revealMs)finish(true);else frame=root.requestAnimationFrame(tick);
      }
      frame=root.requestAnimationFrame(tick);
    });
  }
  const api={model,play,cancel:()=>{if(cancelCurrent)cancelCurrent();}};
  if(typeof module!=="undefined"&&module.exports)module.exports={model};else root.TVLottery=api;
})(typeof window!=="undefined"?window:{});
