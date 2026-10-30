/** Public operating knowledge, never a capability/permission list. Arbitrary
 * native operations remain discoverable; these references only make an internal
 * work order shareable without copying a private manager conversation. */
export const STORE_OPERATIONS_GUIDES = [
 {id:'inventory-check',version:1,objective:'核对目标可见的库存任务、单位、日期、盘点与收发材料；仅向实际库管确认缺口，不补造历史盘点。Tembung 库存联系 Rangga/EMP007，核实当前成员后沟通。'},
 {id:'hygiene-check',version:1,objective:'根据门店现有卫生 SOP 和检查记录安排本班次卫生检查、必要清洁与照片反馈；只对实际完成的项目确认完成。'},
 {id:'staff-training',version:1,objective:'读取目标可见的现有课程和 SOP，组织适合目标员工的练习与培训，记录实际参加、练习和验收证据；课程标题和口头承诺不等于合格。'},
 {id:'customer-service',version:1,objective:'核对目标可见的服务反馈、等待与缺货问题，给员工直白的服务改进步骤，跟进实际处理和顾客反馈。'},
 {id:'product-consistency',version:1,objective:'依据现有配方、正常出品及保养记录核查出品稳定性；不额外制作耗料，不擅自拆机、调参数或改配方。'},
 {id:'staff-operations',version:1,objective:'处理目标可见的排班、出勤和交接事项，避免安排超出职责的工作；员工处罚和超预算事项交店主决定。'},
 {id:'marketing-operations',version:1,objective:'使用已核实的真实商品、价格和现有活动资料完成指定的原生后台操作；保持未发布活动的状态，不虚构促销、券后价或会员权益。'},
 {id:'reply-followup',version:1,objective:'处理所引用的目标可见消息或任务，解释员工不懂的地方，核查资料并推进实际处理。任何时间收到问题都要回复；班次只影响实体工作的安排。'},
] as const
export const storeOperationsGuide=(id:string)=>STORE_OPERATIONS_GUIDES.find(g=>g.id===id)
