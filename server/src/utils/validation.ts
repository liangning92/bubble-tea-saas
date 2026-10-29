import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'
import { zodToJsonSchema } from 'zod-to-json-schema'

/** Describe schemas already enforced inside a native service without parsing or
 * stripping the request a second time. Shared by HTTP and Agent discovery. */
export function describeNativeBody(schema:z.ZodSchema) {
  return Object.assign((_req:Request,_res:Response,next:NextFunction)=>next(),{backendRequestContract:{body:zodToJsonSchema(schema)}})
}

export function validateBody(schema: z.ZodSchema) {
  const handler = (req: Request, res: Response, next: NextFunction) => {
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
  return Object.assign(handler, {backendRequestContract:{body:zodToJsonSchema(schema)}})
}

export function validateQuery(schema: z.ZodSchema) {
  const handler = (req: Request, res: Response, next: NextFunction) => {
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
  return Object.assign(handler, {backendRequestContract:{query:zodToJsonSchema(schema)}})
}
