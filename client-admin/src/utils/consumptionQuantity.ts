/** Small recipe amounts must never be rendered as zero (e.g. 0.394 kg powder). */
export function consumptionQuantity(value:unknown,language='en',precision=6):string {
 if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return '—'
 const n=Number(value),format=new Intl.NumberFormat(language,{maximumFractionDigits:precision})
 const minimum=10**-precision
 if(n!==0&&Math.abs(n)<minimum)return (n<0?'>-':'<')+format.format(minimum)
 return format.format(n)
}
