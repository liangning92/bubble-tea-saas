import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body)
      if (!result.success) {
        return res.status(400).json({
          code: 400,
          message: 'Validation failed',
          errors: result.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        })
      }
      req.body = result.data
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query)
      if (!result.success) {
        return res.status(400).json({
          code: 400,
          message: 'Validation failed',
          errors: result.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        })
      }
      req.query = result.data
      next()
    } catch (error) {
      next(error)
    }
  }
}