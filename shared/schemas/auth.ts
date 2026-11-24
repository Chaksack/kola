import { z } from 'zod'
import { USER_ROLES } from '../utils/roles'
import { addressSchema, emailSchema, passwordSchema } from './common'

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(200),
})

export const inviteCreateSchema = z.object({
  email: emailSchema,
  role: z.enum(USER_ROLES).default('member'),
})

export const inviteAcceptSchema = z.object({
  token: z.string().min(20).max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  password: passwordSchema,
})

export const userUpdateSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
})

export const profileUpdateSchema = z
  .object({
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    currentPassword: z.string().max(200).optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine((v) => !v.newPassword || v.currentPassword, {
    message: 'Enter your current password',
    path: ['currentPassword'],
  })

export const apiKeyCreateSchema = z.object({
  title: z.string().trim().min(1).max(100),
  type: z.enum(['publishable', 'secret']),
  salesChannelIds: z.array(z.string()).max(50).optional(),
})

export const apiKeyUpdateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  salesChannelIds: z.array(z.string()).max(50).optional(),
})

export const customerRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(32).optional(),
})

export const customerUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).nullish(),
  phone: z.string().trim().max(32).nullish(),
})

export const customerAddressSchema = addressSchema.extend({
  label: z.string().trim().max(50).nullish(),
  isDefaultShipping: z.boolean().optional(),
  isDefaultBilling: z.boolean().optional(),
})
