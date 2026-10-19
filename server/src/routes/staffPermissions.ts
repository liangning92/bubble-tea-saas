import {hasManagementAccess} from '../utils/managementAccess'
import {Router} from 'express'
import {authenticate,AuthRequest} from '../middlewares/auth'
import {assignedStaffAccess,getStaffAccessSettings,saveStaffAccessSettings,StaffAccessError} from '../services/StaffPermissionService'
import {settingsV2,previewV2,activateV2,saveDraftV2,userAccessV2,AccessV2Error,ownerStore} from '../services/StaffPermissionV2Service'
import {createActionApproval,approveAction,rejectAction,listApprovals,readActionApproval,approversFor,setApprovalPin} from '../services/StaffActionApprovalService'
import prisma from '../config/database'
import {z} from 'zod'
const router=Router()
function failure(res:any,e:any){if(e?.message==='ADMIN_APPROVAL_REQUIRED')return res.status(403).json({code:403,message:e.message});const status=e instanceof StaffAccessError||e instanceof AccessV2Error?e.status:e instanceof z.ZodError?400:500;res.status(status).json({code:status,message:e instanceof StaffAccessError||e instanceof AccessV2Error?e.message:e instanceof z.ZodError?'STAFF_ACCESS_INPUT_INVALID':'STAFF_ACCESS_SAVE_FAILED'})}
const handler=(fn:(req:AuthRequest)=>Promise<any>)=>async(req:AuthRequest,res:any)=>{try{res.json({code:200,data:await fn(req)})}catch(e){failure(res,e)}}
router.get('/me',authenticate,handler(async req=>({role:req.user!.accessRole||null,systemRole:req.user!.role,managementAccess:hasManagementAccess(req.user!.role,req.user!.accessRole)})))
router.get('/stores',authenticate,handler(async req=>{if(req.user!.role!=='admin')throw new AccessV2Error('STAFF_ACCESS_ADMIN_REQUIRED',403);return prisma.store.findMany({select:{id:true,name:true},orderBy:{name:'asc'}})}))
router.get('/',authenticate,handler(req=>req.query.version==='2'?settingsV2(req.user!,req.query.storeId):getStaffAccessSettings(req.user!)))
router.put('/',authenticate,handler(req=>req.body.version===2?saveDraftV2(req.user!,req.query.storeId,req.body):saveStaffAccessSettings(req.user!,req.body)))
router.post('/preview',authenticate,handler(req=>previewV2(req.user!,req.query.storeId,req.body)))
router.post('/activate',authenticate,handler(req=>activateV2(req.user!,req.query.storeId,req.body)))
router.post('/approval-pin',authenticate,handler(req=>{const b=z.object({pin:z.string(),password:z.string().min(1)}).parse(req.body);return setApprovalPin(req.user!,b.pin,b.password)}))
router.get('/approvers',authenticate,handler(req=>approversFor(req.user!,z.enum(['orders.refund','members.balance','orders.discount']).parse(req.query.action))))
function approvalActor(req:AuthRequest){if(req.user!.role==='admin')return{...req.user!,storeId:ownerStore(req.user!,req.query.storeId)};return req.user!}
router.get('/approvals',authenticate,handler(req=>listApprovals(approvalActor(req))))
router.get('/approvals/:id',authenticate,handler(req=>readActionApproval(approvalActor(req),req.params.id)))
router.post('/approvals',authenticate,handler(req=>createActionApproval(approvalActor(req),req.body)))
router.post('/approvals/:id/approve',authenticate,handler(req=>approveAction(approvalActor(req),req.params.id,undefined,z.object({verifiedPrepared:z.boolean().optional(),verifiedUnprepared:z.boolean().optional()}).parse(req.body))))
router.post('/approvals/:id/reject',authenticate,handler(req=>rejectAction(approvalActor(req),req.params.id)))
router.post('/approvals/:id/onsite',authenticate,handler(req=>approveAction(approvalActor(req),req.params.id,z.object({approverId:z.string(),pin:z.string()}).parse(req.body) as {approverId:string;pin:string},z.object({verifiedPrepared:z.boolean().optional(),verifiedUnprepared:z.boolean().optional()}).parse(req.body))))
export {router as staffPermissionsRouter}
