import { Router } from 'express'
// @ts-ignore - multer types not available
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate, AuthRequest } from '../middlewares/auth'

const router = Router()

// Ensure upload directories exist
const dirs = ['uploads/products', 'uploads/receipts', 'uploads/attachments', 'uploads/avatars']
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
})

// Configure multer for different file types
const createStorage = (subDir: string) => multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, `uploads/${subDir}/`)
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

// DELETE /api/upload/:type/:filename - Delete uploaded file
router.delete('/:type/:filename', authenticate, (req: AuthRequest, res) => {
  try {
    const { type, filename } = req.params
    const allowedTypes = ['products', 'receipts', 'attachments', 'avatars']

    if (!allowedTypes.includes(type)) {
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