/** Small recipe amounts must never be rendered as zero (e.g. 0.394 kg powder). */
export function consumptionQuantity(value:unknown,language='en'):string {
 if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return '—'
 const n=Number(value),format=new Intl.NumberFormat(language,{maximumFractionDigits:6})
 if(n!==0&&Math.abs(n)<0.000001)return (n<0?'>-':'<')+format.format(0.000001)
 return format.format(n)
}
