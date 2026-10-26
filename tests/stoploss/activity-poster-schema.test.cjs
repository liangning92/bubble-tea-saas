const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/utils/activityPosterSchema.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:m.exports,module:m,require});
const {activityPosterSchema}=m.exports;
test('saved design survives API parse and reopening including card-specific colours',()=>{
 const poster={template:'daily_specials',columns:5,rows:2,headline:'Es Krim',designConfig:{cardLayout:'overlay',rows:2,cardGap:14,imageFit:'cover',titlePosition:'overlay',pricePosition:'bottom',badgePosition:'bottom_bar',titleFontSize:24,priceFontSize:36,highlightMode:'popout',highlightScale:1.04,textStroke:true,textGlow:true,dayBadgeBg:'rgba(71, 85, 105, 0.95)',containerPaddingX:20},cardItems:[{dayOfWeek:5,productId:'p',productName:'Actual product',originalPrice:16000,specialPrice:12000,color:'#ffffff',activeColor:'#ffddee',titleColor:'#111111',priceColor:'#ff0000',badgeBg:'#222222',badgeTextColor:'#ffffff'}]};
 assert.deepEqual(JSON.parse(JSON.stringify(activityPosterSchema.parse(poster))),poster);
});
test('legacy posters still save without designConfig',()=>assert.deepEqual(JSON.parse(JSON.stringify(activityPosterSchema.parse({template:'daily_specials',rows:1}))),{template:'daily_specials',rows:1}));
test('reject invalid and unbounded style data',()=>{for(const designConfig of [{cardGap:-1},{priceFontSize:Infinity},{highlightScale:5000},{titleColor:'x'.repeat(101)},{textStroke:'yes'}])assert.equal(activityPosterSchema.safeParse({designConfig}).success,false)});
