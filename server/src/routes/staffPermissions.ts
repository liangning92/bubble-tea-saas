import { Router } from 'express'
import { authenticate, AuthRequest } from '../middlewares/auth'
import { assignedStaffAccess, getStaffAccessSettings, saveStaffAccessSettings, StaffAccessError } from '../services/StaffPermissionService'
import { z } from 'zod'
const router=Router()
router.use(authenticate)
function failure(res:any,error:any){const status=error instanceof StaffAccessError?error.status:error instanceof z.ZodError?400:500;res.status(status).json({code:status,message:error instanceof StaffAccessError?error.message:'STAFF_ACCESS_SAVE_FAILED'})}
router.get('/me',async(req:AuthRequest,res)=>{try{res.json({code:200,data:{role:await assignedStaffAccess(req.user!),systemRole:req.user!.role}})}catch(e){failure(res,e)}})
router.get('/',async(req:AuthRequest,res)=>{try{res.json({code:200,data:await getStaffAccessSettings(req.user!)})}catch(e){failure(res,e)}})
router.put('/',async(req:AuthRequest,res)=>{try{res.json({code:200,data:await saveStaffAccessSettings(req.user!,req.body)})}catch(e){failure(res,e)}})
export {router as staffPermissionsRouter}
