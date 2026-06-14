import { Request, Response } from 'express'

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    code: 404,
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  })
}