/** Store-wide revenue follows the actual report grant, not the role's label or
 * orders.read / pos.cash. Own sales and operational shift handover are separate. */
export function canReadStoreRevenue(actor:any):boolean {
 if(actor.employeeApp)return false
 if(actor.role==='admin')return true
 if(actor.accessRole?.version===2)return actor.accessRole.modes?.['dashboard.read']==='allow'
 if(actor.accessRole)return actor.accessRole.permissions?.includes('dashboard.read')===true
 return actor.role==='manager'
}
export function ownFinancialRecords(actor:any):Record<string,string> {
 if(canReadStoreRevenue(actor))return {}
 if(!actor.staffId)throw Error('STAFF_ACCESS_PERSONAL_SCOPE_REQUIRED')
 return {staffId:actor.staffId}
}

/** Production needs names, quantities and state, never the whole financial DTO. */
export function productionOrder(order:any) {
 const addons=(value:any)=>{try {const rows=typeof value==='string'?JSON.parse(value):value;return JSON.stringify(Array.isArray(rows)?rows.map((row:any)=>({name:row.name,qty:row.qty})):[])}catch{return '[]'}}
 return {id:order.id,orderNumber:order.orderNumber,pickupNumber:order.pickupNumber,status:order.status,createdAt:order.createdAt,tableNumber:order.tableNumber,note:order.note,platform:order.platform,items:(order.items||[]).map((item:any)=>({id:item.id,productName:item.productName,specName:item.specName,quantity:item.quantity,addons:addons(item.addons)}))}
}
