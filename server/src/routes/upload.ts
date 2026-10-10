import { Router } from 'express'
// @ts-ignore - multer types not available
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { randomUUID as uuidv4 } from 'crypto'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'

const router = Router()

// Ensure upload directories exist
const uploadRoot = process.env.UPLOADS_PATH || path.resolve(__dirname, '../../uploads')
const dirs = ['products', 'receipts', 'attachments', 'avatars', 'dualScreen', 'tvMusic'].map(dir => path.join(uploadRoot, dir))
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
})

// Configure multer for different file types
const createStorage = (subDir: string) => multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(uploadRoot, subDir))
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const filename = `${uuidv4()}${ext}`
    cb(null, filename)
  }
})

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf'
  ]

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP and PDF are allowed.'))
  }
}

// Video filter for dualScreen uploads
const videoFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/ogg'
  ]

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, MP4, WebM and OGG are allowed.'))
  }
}

const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB
  files: 5
}

// Upload middleware factories
const uploadProduct = multer({
  storage: createStorage('products'),
  fileFilter,
  limits
})

const uploadReceipt = multer({
  storage: createStorage('receipts'),
  fileFilter,
  limits
})

const uploadAttachment = multer({
  storage: createStorage('attachments'),
  fileFilter,
  limits: { ...limits, files: 10 }
})

const uploadAvatar = multer({
  storage: createStorage('avatars'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only images are allowed for avatars'))
    }
  },
  limits: { ...limits, files: 1 }
})

const uploadDualScreen = multer({
  storage: createStorage('dualScreen'),
  fileFilter: videoFilter,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 } // 50MB max, 10 files
})

// Store managers upload tracks; unsupported files never enter the playlist.
const uploadTvMusic = multer({
  storage: createStorage('tvMusic'),
  fileFilter: (_req: any, file: any, cb: any) => {
    const extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac']
    const mimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac']
    cb(extensions.includes(path.extname(file.originalname).toLowerCase()) && mimes.includes(file.mimetype) ? null : new Error('Use MP3, WAV, OGG, M4A or AAC audio files'), true)
  },
  limits: { fileSize: 30 * 1024 * 1024, files: 10 }
}).array('files', 10)
router.post('/tvMusic', authenticate, authorize('admin', 'manager'), (req: AuthRequest, res) => {
  uploadTvMusic(req, res, (error: any) => {
    if (error) return res.status(400).json({ code: 400, message: error.message })
    const files = (req.files || []) as any[]
    if (!files.length) return res.status(400).json({ code: 400, message: 'Select an audio file' })
    res.json({ code: 200, data: { files: files.map(file => ({ url: '/uploads/tvMusic/' + file.filename, title: file.originalname })) } })
  })
})

// POST /api/upload/product - Upload product image
router.post('/product', authenticate, uploadProduct.array('images', 5), (req: AuthRequest, res) => {
  try {
    const files = req.files as any[]
    const urls = files.map(file => `/uploads/products/${file.filename}`)

    res.json({
      code: 200,
      message: 'Images uploaded successfully',
      data: { urls, filenames: files.map(f => f.filename) },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Upload product image error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Upload failed' })
  }
})

// POST /api/upload/receipt - Upload receipt image
router.post('/receipt', authenticate, uploadReceipt.array('receipts', 5), (req: AuthRequest, res) => {
  try {
    const files = req.files as any[]
    const urls = files.map(file => `/uploads/receipts/${file.filename}`)

    res.json({
      code: 200,
      message: 'Receipts uploaded successfully',
      data: { urls, filenames: files.map(f => f.filename) },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Upload receipt error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Upload failed' })
  }
})

// POST /api/upload/attachment - Upload general attachment
router.post('/attachment', authenticate, uploadAttachment.array('files', 10), (req: AuthRequest, res) => {
  try {
    const files = req.files as any[]
    const urls = files.map(file => `/uploads/attachments/${file.filename}`)

    res.json({
      code: 200,
      message: 'Files uploaded successfully',
      data: { urls, filenames: files.map(f => f.filename) },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Upload attachment error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Upload failed' })
  }
})

// POST /api/upload/avatar - Upload avatar image
router.post('/avatar', authenticate, uploadAvatar.single('avatar'), (req: AuthRequest, res) => {
  try {
    const file = req.file as any
    if (!file) {
      return res.status(400).json({ code: 400, message: 'No file uploaded' })
    }

    const url = `/uploads/avatars/${file.filename}`

    res.json({
      code: 200,
      message: 'Avatar uploaded successfully',
      data: { url, filename: file.filename },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Upload avatar error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Upload failed' })
  }
})

// POST /api/upload/dualScreen - Upload dual screen images/videos
router.post('/dualScreen', authenticate, uploadDualScreen.array('files', 10), (req: AuthRequest, res) => {
  try {
    const files = req.files as any[]
    const urls = files.map(file => `/uploads/dualScreen/${file.filename}`)
    const fileInfos = files.map(file => ({
      url: `/uploads/dualScreen/${file.filename}`,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      isVideo: file.mimetype.startsWith('video/')
    }))

    res.json({
      code: 200,
      message: 'Files uploaded successfully',
      data: { urls, files: fileInfos },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Upload dualScreen error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Upload failed' })
  }
})

// DELETE /api/upload/:type/:filename - Delete uploaded file
router.delete('/:type/:filename', authenticate, (req: AuthRequest, res) => {
  try {
    const { type, filename } = req.params
    const allowedTypes = ['products', 'receipts', 'attachments', 'avatars', 'dualScreen']

    if (!allowedTypes.includes(type) || filename !== path.basename(filename) || filename.includes('\\') || filename.startsWith('.')) {
      return res.status(400).json({ code: 400, message: 'Invalid file type' })
    }

    const filepath = path.join('uploads', type, filename)

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ code: 404, message: 'File not found' })
    }

    fs.unlinkSync(filepath)

    res.json({
      code: 200,
      message: 'File deleted successfully',
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Delete file error:', error)
    res.status(500).json({ code: 500, message: 'Delete failed' })
  }
})

export { router as uploadRouter }