import dotenv from 'dotenv'
import { randomBytes } from 'crypto'

// Only load .env in development mode, not production
if (process.env.NODE_ENV !== 'production') {
  dotenv.config()
}

interface Config {
  nodeEnv: string
  port: number
  databaseUrl: string
  jwt: {
    secret: string
    expiresIn: string
  }
  corsOrigin: string
  indonesia: {
    timezone: string
    currency: string
    locale: string
    ppnRate: number
  }
}

const jwtSecret = process.env.JWT_SECRET
if (process.env.NODE_ENV === 'production' && (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32)) {
  throw new Error('JWT_SECRET must be configured in production with at least 32 bytes')
}

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',

  jwt: {
    secret: jwtSecret || randomBytes(32).toString('hex'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  corsOrigin: (() => {
    const origin = process.env.CORS_ORIGIN
    if (!origin) {
      // Desktop packaged app: fork() doesn't pass CORS_ORIGIN, use localhost fallback
      console.warn('[env] CORS_ORIGIN not set, using localhost fallback (safe for local desktop app)')
      return 'http://localhost:5173,http://localhost:3000'
    }
    return origin
  })(),

  indonesia: {
    timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta',
    currency: process.env.DEFAULT_CURRENCY || 'IDR',
    locale: process.env.DEFAULT_LOCALE || 'id',
    ppnRate: parseFloat(process.env.PPN_RATE || '0.11')
  }
}
