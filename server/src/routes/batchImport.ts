import {Router} from 'express'
import {authenticate,authorize,AuthRequest} from '../middlewares/auth'
import {batchSchema,batchImport} from '../services/BatchImportService'
const router=Router()
router.post('/',authenticate,authorize('admin','manager'),async(req:AuthRequest,res,next)=>{try{const input=batchSchema.parse(req.body);res.json({code:200,data:await batchImport(req.user!.storeId,req.user!.staffId||req.user!.id,input)})}catch(e){next(e)}})
export {router as batchImportRouter}
