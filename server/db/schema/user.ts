import { pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps, ts } from './_common'

export const USER_ROLES = ['owner', 'admin', 'member'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const user = pgTable('user', {
  id: id('user'),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  role: text('role', { enum: USER_ROLES }).notNull().default('member'),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  lastLoginAt: ts('last_login_at'),
  ...timestamps,
})

export const invite = pgTable('invite', {
  id: id('invite'),
  email: text('email').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull().default('member'),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by'),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  ...timestamps,
})
