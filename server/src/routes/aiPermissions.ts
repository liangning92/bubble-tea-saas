import { Router } from 'express'
import { authenticate, AuthRequest } from '../middlewares/auth'
import { getAiPolicy, saveAiPolicy, rejectAiExecution } from '../services/AiPermissionService'
const router=Router()
router.use(authenticate)
router.get('/permissions/:storeId',async(req:AuthRequest,res)=>{
 try {res.json({code:200,data:await getAiPolicy(req.user!,req.params.storeId),modelConnected:false,executionAvailable:false})}
 catch {res.status(403).json({code:403,message:'AI_POLICY_ACCESS_DENIED'})}
})
router.put('/permissions/:storeId',async(req:AuthRequest,res)=>{
 try {res.json({code:200,data:await saveAiPolicy(req.user!,req.params.storeId,req.body),modelConnected:false,executionAvailable:false})}
 catch(error) {const denied=error instanceof Error&&error.message==='AI_POLICY_ACCESS_DENIED';res.status(denied?403:400).json({code:denied?403:400,message:denied?'AI_POLICY_ACCESS_DENIED':'INVALID_AI_POLICY'})}
})
router.post('/execute',(_req,res)=>{try{rejectAiExecution()}catch{res.status(403).json({code:403,message:'AI_EXECUTION_NOT_AVAILABLE'})}})
export {router as aiPermissionsRouter}
