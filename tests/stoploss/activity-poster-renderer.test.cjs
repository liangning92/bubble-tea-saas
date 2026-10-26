const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:m.exports,module:m,require:(name)=>name.startsWith('.')?load(require('node:path').resolve(require('node:path').dirname(path),name)+'.ts'):require(name),Intl,Date});return m.exports}
const {renderActivityPoster:render,posterPrice}=load('shared/utils/activityPoster.ts');
const cfg={headline:'Live offer',columns:2,rows:2,cardItems:[{productName:'First',dayOfWeek:0,originalPrice:16000,specialPrice:0},{productName:'Second'},{productName:'Third'},{productName:'Fourth'},{productName:'Fifth'}],designConfig:{imageFit:'contain',cardLayout:'overlay',rows:2,pricePosition:'top',badgePosition:'top_pill',headlineColor:'#123456',headlineFontSize:60}};
test('preserve custom order, real zero price, grid and page overflow',()=>{const html=render({posterConfig:cfg},{day:0});assert.ok(html.indexOf('First')<html.indexOf('Second'));assert.ok(html.includes('Rp 0'));assert.ok(!html.includes('Fifth'));assert.ok(html.includes('1/2'));assert.ok(html.includes('repeat(2,minmax'));assert.ok(render({posterConfig:cfg},{page:1}).includes('Fifth'))});
test('never manufacture weekday offers, products, discount amounts or unit prices',()=>{const html=render({name:'Gift',type:'buy_get',rule:{buy:1,get:1},products:[{id:'p',name:'Actual tea',price:16000}]},{day:6});assert.ok(html.includes('Actual tea'));assert.ok(!html.includes('12.000'));assert.ok(!html.includes('Senin'));assert.equal(posterPrice({type:'fixed',rule:{amount:4000}},{name:'Tea',price:16000}),undefined);assert.equal(posterPrice({type:'percent',rule:{percent:0}},{name:'Tea',price:16000}),16000)});
test('escape copy and forbid executable image URLs and CSS injection',()=>{const html=render({name:'<script>alert(1)</script>',posterConfig:{headline:'<img onerror="attack()">',backgroundColor:'red; background:url(https://attacker)',cardItems:[{productName:'<b>unsafe</b>',imageUrl:'javascript:alert(1)'}]}});assert.ok(!html.includes('<script>'));assert.ok(!html.includes('src="javascript:'));assert.ok(!html.includes('background:url'));assert.ok(html.includes('&lt;b&gt;unsafe'))});
test('empty cards stay empty and only explicit day matches highlight',()=>{assert.ok(render({posterConfig:{cardItems:[]}}).includes('Tambahkan kartu'));const html=render({posterConfig:{cardItems:[{productName:'Monday',dayOfWeek:1}],highlightToday:true}},{day:6});assert.ok(!html.includes('transform:scale('))});
test('TV shell and React use byte-equivalent renderers',()=>{const sandbox={window:{},Intl,Date};vm.runInNewContext(fs.readFileSync('server/public/tv/poster.js','utf8'),sandbox);for(const posterConfig of [cfg,{...cfg,freeform:true,canvasWidth:1920,canvasHeight:1080,elements:{productName:{fontSize:37,x:12}}}]){const input={posterConfig};assert.equal(sandbox.window.YOUME_POSTER.renderActivityPoster(input,{day:1}),render(input,{day:1}));}for(const file of ['index.html','player.js','player.css','poster.js','build.js'])assert.equal(fs.readFileSync('server/public/tv/'+file,'utf8'),fs.readFileSync('tv-android-app/app/src/main/assets/tv/'+file,'utf8'))});
test('every current editor design control and card colour survives storage',()=>{const design=load('shared/utils/activityPoster.ts').DEFAULT_POSTER_DESIGN;const {activityPosterSchema}=load('server/src/utils/activityPosterSchema.ts');const data={designConfig:design,cardItems:[{id:'stable-id',pillBg:'#ffffff',pillTextColor:'#222222',badgeBg:'#ff0000',badgeTextColor:'#ffffff'}]};assert.deepEqual(JSON.parse(JSON.stringify(activityPosterSchema.parse(data))),JSON.parse(JSON.stringify(data)))});
test('activity-specific content supports prize pools, tier milestones and audience conditions',()=>{const lottery=render({type:'lottery',rule:{prizes:[{id:'p',name:'Tea voucher',color:'#ffccdd'}]},memberOnly:true,paymentMethods:['QRIS']});assert.ok(lottery.includes('Tea voucher'));assert.ok(lottery.includes('Khusus anggota'));assert.ok(lottery.includes('QRIS'));const tiers=render({type:'tiered',rule:{tiers:[{minAmount:30000,amount:5000}]}});assert.ok(tiers.includes('30.000'));assert.ok(tiers.includes('5.000'));assert.ok(!tiers.includes('16.000'))});
const {choosePosterImage,posterLayout,REFERENCE_ELEMENTS}=load('shared/utils/posterLayout.ts');
test('automatic image matches actual box ratio, while explicit manual choice wins',()=>{
 const product={image:'/uploads/default.jpg',imageVariants:[{url:'/uploads/wide.jpg',width:1920,height:1080},{url:'/uploads/tall.jpg',width:1080,height:1920}]};
 assert.equal(choosePosterImage(product,{imageMode:'auto'},.5).url,'/uploads/tall.jpg');
 assert.equal(choosePosterImage(product,{imageMode:'auto'},2).url,'/uploads/wide.jpg');
 assert.equal(choosePosterImage(product,{imageMode:'manual',imageUrl:'/uploads/custom.jpg'},.5).url,'/uploads/custom.jpg');
 assert.equal(choosePosterImage({image:'/uploads/only.jpg'},{imageMode:'auto'},2).url,'/uploads/only.jpg');
});
test('free positioning, card overrides, styles and labels survive schema and affect canonical renderer',()=>{
 const config={freeform:true,canvasWidth:1920,canvasHeight:1080,columns:1,elements:{...REFERENCE_ELEMENTS,headline:{x:12,y:4,width:70,height:12,fontSize:82,color:'#ff1234',rotation:5},image:{x:0,y:0,width:100,height:50},originalPrice:{visible:false}},priceFormat:'plain',priceLabels:{specialPrice:'Promo'},cardItems:[{productId:'p',productName:'Tea <safe>',dayOfWeek:2,specialPrice:12000,elements:{productName:{x:8,fontSize:42,letterSpacing:3},card:{padding:12}}}]};
 const schema=load('server/src/utils/activityPosterSchema.ts').activityPosterSchema;
 const parsed=JSON.parse(JSON.stringify(schema.parse(config)));assert.deepEqual(parsed,JSON.parse(JSON.stringify(config)));
 const geometry=posterLayout(parsed,1),title=geometry.layers.find(x=>x.key==='productName');assert.equal(title.style.fontSize,42);assert.equal(title.style.x,8);
 const html=render({posterConfig:parsed,products:[{id:'p',name:'Tea',price:16000,imageVariants:[{url:'/uploads/wide.jpg',width:1920,height:1080},{url:'/uploads/tall.jpg',width:1080,height:1920}]}]},{day:2});
 assert.ok(html.includes('Promo : 12000'));assert.ok(html.includes('Tea &lt;safe&gt;'));assert.ok(html.includes('font-size:calc(42 * var(--u))'));assert.ok(html.includes('rotate(5deg)'));assert.ok(!html.includes('data-element-key="originalPrice"'));assert.ok(html.includes('/uploads/wide.jpg'));
});
test('freeform suppresses executable URLs and CSS values and does not invent conditional offer prices',()=>{
 const html=render({type:'buy_get',products:[{id:'p',price:16000}],posterConfig:{freeform:true,cardItems:[{productId:'p',imageUrl:'javascript:alert(1)',imageMode:'manual',productName:'<script>bad</script>'}],elements:{headline:{color:'red; background:url(https://bad)'}}}});
 assert.ok(!html.includes('src="javascript:'));assert.ok(!html.includes('background:url'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('Harga Spesial :'));
});
test('variant association requires an exact Unicode product name and never a substring',()=>{
 const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/utils/posterImageVariants.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:()=>({})});
 const urls=m.exports.posterImageUrls({name:'奶茶',image:'/uploads/primary.jpg'},[{name:'奶茶 (9:16).webp',url:'/uploads/tea-tall.jpg'},{name:'草莓奶茶_9x16.webp',url:'/uploads/strawberry.jpg'},{name:'咖啡_16x9.webp',url:'/uploads/coffee.jpg'}]);
 assert.deepEqual(Array.from(urls),['/uploads/primary.jpg','/uploads/tea-tall.jpg']);
 assert.deepEqual(Array.from(m.exports.posterImageUrls({name:''},[{name:'9x16.webp',url:'/uploads/no.jpg'}])),[]);
});
const controls=load('shared/utils/posterControls.ts');
const editable={freeform:true,canvasWidth:1920,canvasHeight:1080,columns:2,cardItems:[{productName:'Tea',dayOfWeek:1,imageUrl:'/uploads/tea.jpg',imageMode:'manual',originalPrice:16000,specialPrice:12000,elements:{productName:{fontSize:35,color:'#ffffff'}}},{productName:'Ice',dayOfWeek:2,originalPrice:18000,specialPrice:13000}],designConfig:{highlightMode:'border_only'}};
test('formerly inert controls produce a visible rendering difference in free positioning',()=>{
 const before=render({posterConfig:editable},{day:1});
 for(const patch of [{textGlow:true},{overlayGradientOpacity:65},{cardBorderStyle:'dashed'},{cardBorderStyle:'none'},{cardShadow:'deep'},{highlightMode:'popout'},{highlightMode:'glow'},{highlightMode:'ribbon'},{highlightMode:'popout',highlightScale:1.1},{priceStyle:'pill'},{priceBoxShadow:'soft'},{containerPaddingX:70},{containerPaddingY:35},{imageBleed:false},{fontStyle:'mono'}]){
  const updated=controls.applyPosterDesignPatch(editable,patch);assert.notEqual(render({posterConfig:updated},{day:1}),before,JSON.stringify(patch));
 }
 const dashed=render({posterConfig:controls.applyPosterDesignPatch(editable,{cardBorderStyle:'dashed'})});assert.ok(dashed.includes('border:calc(1 * var(--u)) dashed #ffffff'));
 const changed=controls.applyPosterDesignPatch(editable,{titleFontSize:48,titleColor:'#123456'});assert.equal(posterLayout(changed,2).layers.find(l=>l.key==='productName').style.fontSize,48);
});
test('two price gaps measure actual separation, preserve independent card scope and survive API storage',()=>{
 const spaced=controls.setPosterPriceSpacing(editable,[9,13],0),schema=load('server/src/utils/activityPosterSchema.ts').activityPosterSchema;
 const saved=JSON.parse(JSON.stringify(schema.parse(spaced))),layout=posterLayout(saved,2),prices=['originalPrice','specialPrice','savingAmount'].map(key=>layout.layers.find(l=>l.key===key&&l.cardIndex===0));
 assert.ok(Math.abs(prices[1].rect.y-prices[0].rect.y-prices[0].rect.height-9)<.001);assert.ok(Math.abs(prices[2].rect.y-prices[1].rect.y-prices[1].rect.height-13)<.001);
 const bigger=controls.applyPosterDesignPatch(saved,{priceFontSize:42});const biggerLayers=posterLayout(bigger,2).layers.filter(l=>l.cardIndex===0);assert.ok(biggerLayers.find(l=>l.key==='specialPrice').rect.height>=42*1.2);assert.deepEqual(Array.from(controls.posterPriceGaps(bigger,0)),[9,13]);
 assert.ok(prices.every(l=>l.rect.height>=l.style.fontSize*(l.style.lineHeight||1.2)));assert.deepEqual(saved.cardItems[1],editable.cardItems[1]);
 const styled={...saved,elements:{specialPrice:{italic:true,textDecoration:'underline',textTransform:'uppercase',strokeWidth:3,strokeColor:'#ffffff',shadowColor:'#ff5d89',shadowBlur:12}}};
 const html=render({posterConfig:schema.parse(styled)});assert.ok(html.includes('font-style:italic'));assert.ok(html.includes('text-decoration:underline'));assert.ok(html.includes('text-transform:uppercase'));assert.ok(html.includes('overflow:visible'));
});

test('canvas padding insets every canvas layer without rewriting user positions',()=>{const padded=controls.applyPosterDesignPatch(editable,{containerPaddingX:60,containerPaddingY:40});const layout=posterLayout(padded,2),headline=layout.layers.find(l=>l.key==='headline'),grid=layout.layers.find(l=>l.key==='grid');assert.equal(headline.owner.x,60);assert.equal(headline.owner.y,40);assert.equal(grid.owner.x,60);assert.equal(grid.owner.height,1000);assert.equal(padded.elements?.headline,undefined);});
