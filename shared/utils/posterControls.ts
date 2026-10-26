import type {ActivityPosterConfig, PosterDesignConfig, PosterElementKey, PosterElementStyle} from './activities';
import {posterLayout, POSTER_ELEMENT_KEYS} from './posterLayout';
const textKeys: PosterElementKey[]=['headline','subheadline','productName','productSubname','originalPrice','specialPrice','savingAmount','dayBadge','discountTag','footer'];
export function applyPosterDesignPatch(cfg:ActivityPosterConfig, patch:Partial<PosterDesignConfig>):ActivityPosterConfig {
 const elements={...cfg.elements}, changed:Partial<Record<PosterElementKey,Partial<PosterElementStyle>>>={};
 const set=(key:PosterElementKey,style:Partial<PosterElementStyle>)=>{changed[key]={...changed[key],...style};elements[key]={...elements[key],...style}};
 const bind=(field:keyof PosterDesignConfig,key:PosterElementKey,target:keyof PosterElementStyle)=>{if(patch[field]!==undefined)set(key,{[target]:patch[field]})};
 for(const [field,key] of [['headlineFontSize','headline'],['subheadlineFontSize','subheadline'],['titleFontSize','productName'],['normalPriceFontSize','originalPrice'],['priceFontSize','specialPrice'],['savingFontSize','savingAmount'],['dayBadgeFontSize','dayBadge']] as const)bind(field,key,'fontSize');
 for(const [field,key] of [['headlineColor','headline'],['subheadlineColor','subheadline'],['titleColor','productName'],['normalPriceColor','originalPrice'],['priceColor','specialPrice'],['savingColor','savingAmount'],['dayBadgeColor','dayBadge']] as const)bind(field,key,'color');
 for(const [field,key,target] of [['imageFit','image','objectFit'],['imageBorderRadius','image','borderRadius'],['imagePadding','image','padding'],['imageHeightRatio','image','height'],['imageBgColor','image','backgroundColor'],['cardBorderWidth','card','borderWidth'],['cardBorderColor','card','borderColor'],['cardBorderRadius','card','borderRadius'],['cardPadding','card','padding'],['priceBoxBg','priceBox','backgroundColor'],['priceBoxRadius','priceBox','borderRadius'],['priceBoxBorderColor','priceBox','borderColor'],['dayBadgeBg','dayBadge','backgroundColor'],['highlightColor','highlight','borderColor']] as const)bind(field,key,target);
 if(patch.cardGap!==undefined)patch={...patch,cardGapX:patch.cardGap,cardGapY:patch.cardGap};
 if(patch.fontStyle)for(const key of textKeys)set(key,{fontFamily:patch.fontStyle});
 if(patch.textAlign)for(const key of textKeys)set(key,{textAlign:patch.textAlign});
 if(patch.titlePosition)set('productName',{y:patch.titlePosition==='bottom'?66:patch.titlePosition==='top'?1:5});
 if(patch.pricePosition){const top=patch.pricePosition==='top'?27:patch.pricePosition==='middle'?55:77;set('priceBox',{y:top-1});for(const [i,key] of (['originalPrice','specialPrice','savingAmount'] as const).entries())set(key,{y:top+i*4});}
 if(patch.badgePosition){const corner=patch.badgePosition!=='bottom_bar'&&patch.badgePosition!=='hidden';set('dayBadge',{visible:patch.badgePosition!=='hidden',x:patch.badgePosition.includes('right')?60:0,y:patch.badgePosition.startsWith('top')?0:88.5,width:corner?40:100});}
 if(patch.textStroke!==undefined||patch.textStrokeWidth!==undefined||patch.textStrokeColor!==undefined)for(const key of textKeys)set(key,{strokeWidth:(patch.textStroke??cfg.designConfig?.textStroke)?(patch.textStrokeWidth??cfg.designConfig?.textStrokeWidth??2):0,strokeColor:patch.textStrokeColor??cfg.designConfig?.textStrokeColor??'#ffffff'});
 if(patch.textGlow!==undefined||patch.textShadow!==undefined){const glow=patch.textGlow??cfg.designConfig?.textGlow,shadow=patch.textShadow??cfg.designConfig?.textShadow;for(const key of textKeys)set(key,{shadowColor:glow?'#ff5d89':shadow?'#000000':'transparent',shadowX:0,shadowY:glow?0:shadow?3:0,shadowBlur:glow?14:shadow?6:0});}
 if(patch.highlightColor)set('highlight',{backgroundColor:patch.highlightColor});
 if(patch.cardBorderStyle)set('card',{borderStyle:patch.cardBorderStyle==='dashed'?'dashed':patch.cardBorderStyle==='none'?'none':'solid',...(patch.cardBorderStyle==='glow'?{shadowColor:cfg.designConfig?.cardBorderColor||'#ff5d89',shadowBlur:20,shadowX:0,shadowY:0}:{shadowBlur:0})});
 const shadows={none:0,soft:8,medium:16,deep:30,glow:24};
 if(patch.cardShadow)set('card',{shadowBlur:shadows[patch.cardShadow],shadowColor:patch.cardShadow==='glow'?(cfg.designConfig?.highlightColor||'#ff5d89'):'#000000',shadowX:0,shadowY:patch.cardShadow==='none'||patch.cardShadow==='glow'?0:5});
 if(patch.priceBoxShadow)set('priceBox',{shadowBlur:shadows[patch.priceBoxShadow],shadowColor:'#000000',shadowX:0,shadowY:patch.priceBoxShadow==='none'?0:4});
 if(patch.overlayGradientOpacity!==undefined)set('image',{gradientOpacity:patch.overlayGradientOpacity});
 if(patch.priceStyle)set('priceBox',{backgroundColor:patch.priceStyle==='list'?'transparent':cfg.designConfig?.priceBoxBg||'#ffffff',borderRadius:patch.priceStyle==='pill'?36:0});
 if(patch.cardLayout!==undefined||patch.imageBleed!==undefined){const overlay=patch.imageBleed??patch.cardLayout==='overlay';set('image',{y:0,height:overlay?88.5:62});set('productName',{y:overlay?5:63,height:overlay?22:12});set('priceBox',{y:76});}
 if(patch.containerPaddingX!==undefined||patch.containerPaddingY!==undefined){const x=patch.containerPaddingX??cfg.designConfig?.containerPaddingX??0,y=patch.containerPaddingY??cfg.designConfig?.containerPaddingY??0,w=cfg.canvasWidth||1920,h=cfg.canvasHeight||1080;for(const key of ['headline','subheadline','grid','footer'] as const){set(key,{x:x/w*100,width:100-x/w*200,...(key==='grid'?{y:24.5+y/h*100,height:64-y/h*200}:{})});}}
 const cardItems=cfg.cardItems?.map(c=>{const overrides={...c.elements};for(const key of POSTER_ELEMENT_KEYS){if(!changed[key]||!overrides[key])continue;const s={...overrides[key]};for(const field of Object.keys(changed[key]!))delete (s as any)[field];overrides[key]=s;}return {...c,...(patch.dayBadgeBg!==undefined?{activeColor:patch.dayBadgeBg}:{}),elements:overrides};});
 return {...cfg,designConfig:{...cfg.designConfig,...patch},...(cfg.freeform?{elements,cardItems}:{})};
}
export function posterPriceGaps(cfg:ActivityPosterConfig,index=0):[number,number]{
 const layout=posterLayout(cfg,cfg.cardItems?.length||1), layers=(['originalPrice','specialPrice','savingAmount'] as const).map(key=>layout.layers.find(l=>l.key===key&&l.cardIndex===index)!);
 return [Math.max(0,Math.round(layers[1].rect.y-layers[0].rect.y-layers[0].rect.height)),Math.max(0,Math.round(layers[2].rect.y-layers[1].rect.y-layers[1].rect.height))];
}
export function setPosterPriceSpacing(cfg:ActivityPosterConfig,gaps:[number,number],index?:number):ActivityPosterConfig {
 const layout=posterLayout(cfg,cfg.cardItems?.length||1);
 const cardItems=cfg.cardItems?.map((c,i)=>{if(index!==undefined&&index!==i)return c;const elements={...c.elements};const priceLayers=(['originalPrice','specialPrice','savingAmount'] as const).map(key=>layout.layers.find(l=>l.key===key&&l.cardIndex===i)!);const heights=priceLayers.map(l=>Math.max(l.rect.height,(l.style.fontSize||22)*(l.style.lineHeight||1.2)+2*(l.style.strokeWidth||0)));const badge=layout.layers.find(l=>l.key==='dayBadge'&&l.cardIndex===i)!;const bottomLimit=badge.style.visible!==false?badge.rect.y:layout.cards[i].y+layout.cards[i].height;const start=Math.max(priceLayers[0].owner.y,Math.min(priceLayers[0].rect.y,bottomLimit-heights.reduce((a,b)=>a+b,0)-gaps[0]-gaps[1]-4));let bottom=start;
 for(const [j,key] of (['originalPrice','specialPrice','savingAmount'] as const).entries()){const l=layout.layers.find(l=>l.key===key&&l.cardIndex===i)!;const h=heights[j];const y=j?bottom+gaps[j-1]:start;elements[key]={...elements[key],height:h/l.owner.height*100,y:(y-l.owner.y)/l.owner.height*100};bottom=y+h;}
 const box=layout.layers.find(l=>l.key==='priceBox'&&l.cardIndex===i)!;elements.priceBox={...elements.priceBox,y:(start-box.owner.y)/box.owner.height*100,height:(bottom-start)/box.owner.height*100};return {...c,elements};});return {...cfg,freeform:true,cardItems};
}
