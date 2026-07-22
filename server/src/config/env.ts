import dotenv from 'dotenv'

dotenv.config()

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

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',

  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET
      if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production')
      }
      return secret || 'dev-only-secret-do-not-use-in-production'
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000',

  indonesia: {
    timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta',
    currency: process.env.DEFAULT_CURRENCY || 'IDR',
    locale: process.env.DEFAULT_LOCALE || 'id',
    ppnRate: parseFloat(process.env.PPN_RATE || '0.11')
  }
}