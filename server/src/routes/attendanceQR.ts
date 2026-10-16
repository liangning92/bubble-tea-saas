import { createEmployeeAttendance } from '../services/EmployeeAttendanceService'
import { Router } from 'express'
import { authenticate, AuthRequest } from '../middlewares/auth'
import { prisma } from '../config/database'
import { attendanceQR, onlineAttendanceQR, attendanceQRBundle, verifyOnlineAttendanceQR, ATTENDANCE_QR_WINDOW } from '../services/AttendanceQRService'
import { authorize } from '../middlewares/auth'

const router = Router()

// Generate QR code payload for POS
router.post('/generate', authenticate, authorize('admin','manager','cashier'), async (req: AuthRequest, res) => {
  try {
    const { posId } = req.body

    if (typeof posId!=='string'||!posId||posId.length>100) {
      return res.status(400).json({ code: 400, message: 'POS ID is required' })
    }

    // Get store info
    const store = await prisma.store.findFirst({
      where: { id: req.user!.storeId }
    })

    if (!store) {
      return res.status(404).json({ code: 404, message: 'Store not found' })
    }

    const rotating = req.body.formatVersion === 2
    const timestamp = rotating ? Math.floor(Date.now()/ATTENDANCE_QR_WINDOW)*ATTENDANCE_QR_WINDOW : Date.now()
    const qrData = rotating ? attendanceQR(req.user!.storeId, posId, timestamp) : onlineAttendanceQR(req.user!.storeId, posId, timestamp)

    res.json({
      code: 200,
      data: {
        qrData,
        storeName: store.name,
        posId,
        expiresAt: timestamp + ATTENDANCE_QR_WINDOW,
        refreshInterval: ATTENDANCE_QR_WINDOW
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Generate QR error:', error)
    res.status(500).json({ code: 500, message: 'Failed to generate QR code' })
  }
})

// Only a store POS operator receives future codes; employee phones receive hashes only.
router.post('/offline-prepare', authenticate, authorize('admin','manager','cashier'), async(req:AuthRequest,res)=>{
 try {
  const posId=req.user!.storeId
  const store=await prisma.store.findUnique({where:{id:req.user!.storeId},select:{name:true}})
  if(!store)return res.status(404).json({code:404,message:'Store not found'})
  return res.json({code:200,data:{...attendanceQRBundle(req.user!.storeId,posId),storeName:store.name}})
 } catch { return res.status(500).json({code:500,message:'Offline attendance preparation failed'}) }
})

// Verify QR code and check in
router.post('/verify', authenticate, async (req: AuthRequest, res) => {
  try {
    const { qrData, type } = req.body

    if (!qrData) {
      return res.status(400).json({ code: 400, message: 'QR data is required' })
    }

    let payload: ReturnType<typeof verifyOnlineAttendanceQR>
    try { payload=verifyOnlineAttendanceQR(qrData,req.user!.storeId) }
    catch { return res.status(400).json({code:400,message:'Invalid or expired QR code. Scan the current POS code.'}) }
    const {s:storeId,p:posId,t:qrTimestamp}=payload

    // Get store info for response
    const store = await prisma.store.findFirst({
      where: { id: storeId }
    })

    // Find staff
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const nowDate = new Date()

    if (type === 'check_in') {
      const status = 'normal' // authoritative shift snapshot computed in the transaction
      const attendance = await createEmployeeAttendance({
        data: {
          staffId: staff.id,
          checkInTime: nowDate,
          status,
          gpsLocation: `POS:${posId}`, // Mark as QR-based check-in with POS ID
          note: `QR Check-in at POS ${posId}`
        }
      }.data, storeId)

      res.status(201).json({
        code: 201,
        data: {
          ...attendance,
          storeName: store?.name,
          posId,
          checkInMethod: 'qr'
        },
        timestamp: new Date().toISOString()
      })
    } else if (type === 'check_out') {
      if (!req.body.attendanceId) {
        return res.status(400).json({ code: 400, message: 'Attendance ID is required for check-out' })
      }

      const attendance = await prisma.attendance.findFirst({
        where: {
          id: req.body.attendanceId,
          staffId: staff.id
        }
      })

      if (!attendance) {
        return res.status(404).json({ code: 404, message: 'No active check-in found' })
      }

      if (attendance.checkOutTime) return res.json({code:200,data:attendance,alreadyRecorded:true})
      const updated = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOutTime: nowDate,
          gpsLocation: `POS:${posId}`,
          note: `QR Check-out at POS ${posId}`
        }
      })

      res.json({
        code: 200,
        data: {
          ...updated,
          storeName: store?.name,
          posId,
          checkOutMethod: 'qr'
        },
        timestamp: new Date().toISOString()
      })
    } else {
      // Just verify without action - return store info
      res.json({
        code: 200,
        data: {
          valid: true,
          storeName: store?.name,
          storeId,
          posId,
          timestamp: new Date(qrTimestamp).toISOString()
        },
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('Verify QR error:', error)
    res.status(500).json({ code: 500, message: 'Failed to verify QR code' })
  }
})

export { router as attendanceQRRouter }
