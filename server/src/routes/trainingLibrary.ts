// @ts-ignore - multer types not available
import multer from 'multer'
import { VIDEO_LIMIT, saveVideo, ownedVideo, referencedVideos, videoRoot } from '../services/TrainingVideoStore'
import { Router, Response } from 'express'
import { authenticate, AuthRequest, authorize } from '../middlewares/auth'
import * as library from '../services/TrainingLibraryStore'

export const trainingLibraryRouter = Router()
trainingLibraryRouter.use(authenticate, (req: AuthRequest, res, next) => {
  const storeId = req.user!.storeId
  if (!storeId || [req.query.storeId, req.body?.storeId].some(id => id !== undefined && id !== storeId)) return res.status(403).json({ code: 403, message: 'TRAINING_STORE_MISMATCH' })
  res.setHeader('Cache-Control', 'no-store')
  next()
})
const run = (fn: (req: AuthRequest) => Promise<any>) => async (req: AuthRequest, res: Response) => {
  try { res.json({ code: 200, data: await fn(req) }) }
  catch (error) {
    const status = error instanceof library.TrainingLibraryError ? error.status : 500
    res.status(status).json({ code: status, message: error instanceof library.TrainingLibraryError ? error.message : 'TRAINING_LIBRARY_UNAVAILABLE', limits: library.LIBRARY_LIMITS })
  }
}
trainingLibraryRouter.get('/', run(req => library.readTrainingLibrary(req.user!)))
trainingLibraryRouter.get('/edit', authorize('admin'), run(req => library.editTrainingLibrary(req.user!)))
trainingLibraryRouter.get('/history', authorize('admin'), run(req => library.trainingHistory(req.user!, req.query.limit === undefined ? 20 : Number(req.query.limit), typeof req.query.cursor === 'string' ? req.query.cursor : undefined)))
trainingLibraryRouter.get('/history/:id', authorize('admin'), run(req => library.getTrainingRevision(req.user!, req.params.id)))
trainingLibraryRouter.put('/draft', authorize('admin'), run(req => library.writeTrainingLibrary(req.user!, 'save', req.body)))
trainingLibraryRouter.post('/restore/:id', authorize('admin'), run(req => library.writeTrainingLibrary(req.user!, 'restore', req.body, req.params.id)))
trainingLibraryRouter.post('/publish', authorize('admin'), run(req => library.writeTrainingLibrary(req.user!, 'publish', req.body)))

const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: VIDEO_LIMIT, files: 1, fields: 0 } }).single('video')
trainingLibraryRouter.post('/videos', authorize('admin'), (req: AuthRequest, res, next) => {
  videoUpload(req, res, (error: { code?: string } | null) => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ code: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, message: 'TRAINING_VIDEO_UPLOAD_INVALID', maxBytes: VIDEO_LIMIT })
    next()
  })
}, async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: 'TRAINING_VIDEO_REQUIRED' })
  try { const video = await saveVideo(req.user!, req.file.buffer, req.file.originalname, req.file.mimetype); res.json({ code: 200, data: video }) }
  catch (error) { const invalid = error instanceof Error && error.message.startsWith('TRAINING_VIDEO_'); res.status(invalid ? 400 : 500).json({ code: invalid ? 400 : 500, message: invalid ? (error as Error).message : 'TRAINING_VIDEO_UNAVAILABLE' }) }
})
trainingLibraryRouter.get('/videos/:id', async (req: AuthRequest, res) => {
  try {
    const video = await ownedVideo(req.user!, req.params.id)
    if (!video) return res.status(404).json({ code: 404, message: 'TRAINING_VIDEO_NOT_FOUND' })
    if (req.user!.role !== 'admin') {
      const published = await library.readTrainingLibrary(req.user!)
      if (!referencedVideos(published).includes(video.id)) return res.status(404).json({ code: 404, message: 'TRAINING_VIDEO_NOT_FOUND' })
    }
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.sendFile(video.id + '.mp4', { root: videoRoot(), dotfiles: 'allow', acceptRanges: true, cacheControl: false }, error => {
      if (error && !res.headersSent) { const status = 'status' in error && error.status === 416 ? 416 : 404; res.status(status).json({ code: status, message: status === 416 ? 'TRAINING_VIDEO_RANGE_INVALID' : 'TRAINING_VIDEO_NOT_FOUND' }) }
    })
  } catch { if (!res.headersSent) res.status(500).json({ code: 500, message: 'TRAINING_VIDEO_UNAVAILABLE' }) }
})
