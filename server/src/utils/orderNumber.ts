import {formatDate} from './dateUtils'
import {randomBytes} from 'crypto'
/** Global uniqueness is enforced by Order.orderNumber; random candidates are retried on that constraint only. */
export function orderNumberCandidate(date=new Date(),prefix='ORD'){
 const random=BigInt('0x'+randomBytes(7).toString('hex'))&((1n<<50n)-1n)
 const compact=random.toString(32).toUpperCase().padStart(10,'0')
 return prefix==='ORD' ? compact : `${prefix}${formatDate(date).replace(/-/g,'')}-${compact}`
}
export function isOrderNumberCollision(error:unknown){
 const e=error as {code?:string;meta?:{target?:string|string[]}}
 return e?.code==='P2002'&&(Array.isArray(e.meta?.target)?e.meta!.target.includes('orderNumber'):typeof e.meta?.target==='string'&&e.meta.target.includes('orderNumber'))
}
