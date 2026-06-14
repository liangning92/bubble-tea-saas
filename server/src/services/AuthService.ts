import prisma from '../config/database'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config/env'

export interface LoginData {
  phone: string
  password: string
}

export interface RegisterData {
  phone: string
  password: string
  name: string
  storeId: string
  role?: string
}

export interface AuthResult {
  token: string
  user: {
    id: string
    phone: string
    name: string
    role: string
    storeId: string
    staff: any
  }
}

// Login
export async function login(data: LoginData) {
  const { phone, password } = data

  // Find user
  const user = await prisma.user.findUnique({
    where: { phone },
    include: {
      staff: {
        include: { store: true }
      }
    }
  })

  if (!user) {
    throw new Error('Invalid phone or password')
  }

  // Verify password
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    throw new Error('Invalid phone or password')
  }

  // Check if staff is active
  if (user.staff && user.staff.status !== 'active') {
    throw new Error('Account is deactivated')
  }

  // Generate JWT
  const token = jwt.sign(
    {
      id: user.id,
      phone: user.phone,
      role: user.role as string,
      storeId: user.staff?.storeId || '',
      staffId: user.staff?.id || ''
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  )

  return {
    token,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.staff?.name || user.phone,
      role: user.role,
      storeId: user.staff?.storeId || '',
      staff: user.staff ? {
        id: user.staff.id,
        name: user.staff.name,
        position: user.staff.position
      } : null
    }
  }
}

// Register
export async function register(data: RegisterData) {
  const { phone, password, name, storeId, role = 'cashier' } = data

  // Check if phone exists
  const existing = await prisma.user.findUnique({
    where: { phone }
  })

  if (existing) {
    throw new Error('Phone number already registered')
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10)

  // Create user and staff in transaction
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        phone,
        password: hashedPassword,
        role
      }
    })

    const staff = await tx.staff.create({
      data: {
        userId: user.id,
        storeId,
        name,
        employeeNumber: `EMP${Date.now().toString().slice(-6)}`,
        position: role === 'admin' ? 'Manager' : 'Cashier',
        status: 'active'
      }
    })

    return { user, staff }
  })

  // Generate token
  const token = jwt.sign(
    {
      id: result.user.id,
      phone: result.user.phone,
      role: result.user.role as string,
      storeId,
      staffId: result.staff.id
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  )

  return {
    token,
    user: {
      id: result.user.id,
      phone: result.user.phone,
      name: result.staff.name,
      role: result.user.role,
      storeId,
      staff: {
        id: result.staff.id,
        name: result.staff.name,
        position: result.staff.position
      }
    }
  }
}

// Get current user
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      staff: {
        include: { store: true }
      }
    }
  })

  if (!user) {
    throw new Error('User not found')
  }

  return {
    id: user.id,
    phone: user.phone,
    name: user.staff?.name || user.phone,
    role: user.role,
    storeId: user.staff?.storeId || '',
    staff: user.staff ? {
      id: user.staff.id,
      name: user.staff.name,
      position: user.staff.position
    } : null
  }
}

// Change password
export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user) {
    throw new Error('User not found')
  }

  // Verify old password
  const valid = await bcrypt.compare(oldPassword, user.password)
  if (!valid) {
    throw new Error('Current password is incorrect')
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  })

  return { success: true }
}

// Reset password (admin function)
export async function resetPassword(userId: string, newPassword: string) {
  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  })

  return { success: true }
}

// Refresh token
export async function refreshToken(token: string) {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { staff: true }
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Generate new token
    const newToken = jwt.sign(
      {
        id: user.id,
        phone: user.phone,
        role: user.role as string,
        storeId: user.staff?.storeId || '',
        staffId: user.staff?.id || ''
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    )

    return { token: newToken }
  } catch (error) {
    throw new Error('Invalid token')
  }
}