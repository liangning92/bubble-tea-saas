import { NextFunction, Response } from 'express'
import { AuthRequest } from './auth'
import prisma from '../config/database'

// Training management is scoped to the current store, just like its list API.
export async function trainingStaffAccess(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params.staffId || req.body?.staffId
    if (typeof id !== 'string' || !id) return res.status(400).json({ code: 400, message: 'Staff required' })
    const staff = await prisma.staff.findFirst({ where: { id, storeId: req.user!.storeId }, select: { id: true } })
    if (!staff) return res.status(404).json({ code: 404, message: 'Staff not found' })
    if (!['admin', 'manager'].includes(req.user!.role) && staff.id !== req.user!.staffId) return res.status(403).json({ code: 403, message: 'Access denied' })
    next()
  } catch (error) { next(error) }
}

export async function trainingRecordAccess(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const record = await prisma.training.findFirst({ where: { id: req.params.id, storeId: req.user!.storeId, staff: { storeId: req.user!.storeId } }, select: { id: true } })
    if (!record) return res.status(404).json({ code: 404, message: 'Training not found' })
    next()
  } catch (error) { next(error) }
}
