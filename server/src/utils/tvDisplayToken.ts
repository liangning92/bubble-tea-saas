import jwt from 'jsonwebtoken'
import { config } from '../config/env'
export function verifyTvDisplayToken(token: string): string {
  const decoded = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload
  if(decoded.purpose !== 'tv-display' || typeof decoded.storeId !== 'string' || !decoded.storeId) throw new Error('Invalid display scope')
  return decoded.storeId
}
