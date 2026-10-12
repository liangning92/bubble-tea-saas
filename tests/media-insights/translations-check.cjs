const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path')
;(async()=>{
 const {mediaInsightsTranslations:resources}=await import(path.resolve('client-admin/src/i18n/mediaInsights.ts'))
 const canonical=Object.keys(resources.zh.media).sort(),analysis=Object.keys(resources.zh.insights).sort()
 for(const language of ['zh','en','id']){
  assert.deepEqual(Object.keys(resources[language].media).sort(),canonical)
  assert.deepEqual(Object.keys(resources[language].insights).sort(),analysis)
  for(const group of ['media','insights'])for(const [key,value] of Object.entries(resources[language][group])){
   assert.ok(typeof value==='string'&&value.trim(),`${language}.${group}.${key}`)
   const placeholders=value.match(/\{\{\w+\}\}/g)||[]
   assert.deepEqual(placeholders.sort(),(resources.zh[group][key].match(/\{\{\w+\}\}/g)||[]).sort())
  }
 }
 const files=['client-admin/src/components/MediaLibrary.tsx','client-admin/src/components/ProductImageEditor.tsx','client-admin/src/pages/product-analysis/ProductAnalysisPage.tsx','client-admin/src/pages/inventory/StockAlertsPage.tsx','client-admin/src/pages/bom/BomAnalysisPage.tsx']
 for(const file of files)for(const match of fs.readFileSync(file,'utf8').matchAll(/['"](media|insights)\.([A-Za-z]+)['"]/g))assert.ok(resources.zh[match[1]][match[2]],`${file}: ${match[0]}`)
 console.log('Translations passed: matching ZH/EN/ID keys, placeholders and new page references.')
})().catch(error=>{console.error(error);process.exitCode=1})
