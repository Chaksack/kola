import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { id, timestamps, ts, type Metadata } from './_common'

/**
 * Signing secrets are never stored. `secretSalt` + the server key derive the secret
 * (HMAC-SHA256), and `secretHash` lets us identify it. See docs/decisions.md.
 */
export const webhookEndpoint = pgTable('webhook_endpoint', {
  id: id('wh'),
  url: text('url').notNull(),
  description: text('description'),
  events: jsonb('events').$type<string[]>().notNull().default([]),
  secretSalt: text('secret_salt').notNull(),
  secretHash: text('secret_hash').notNull(),
  secretLast4: text('secret_last4').notNull(),
  status: text('status', { enum: ['enabled', 'disabled'] }).notNull().default('enabled'),
  ...timestamps,
})

export const webhookDelivery = pgTable(
  'webhook_delivery',
  {
    id: id('whd'),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    eventName: text('event_name').notNull(),
    payload: jsonb('payload').$type<Metadata>().notNull(),
    status: text('status', { enum: ['pending', 'succeeded', 'failed'] }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at'),
    lastResponseStatus: integer('last_response_status'),
    lastError: text('last_error'),
    deliveredAt: ts('delivered_at'),
    ...timestamps,
  },
  (t) => [index('webhook_delivery_status_idx').on(t.status, t.nextAttemptAt)],
)

export const idempotencyKey = pgTable('idempotency_key', {
  key: text('key').primaryKey(),
  scope: text('scope').notNull(),
  requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status'),
  responseBody: jsonb('response_body').$type<unknown>(),
  lockedAt: ts('locked_at'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditLog = pgTable(
  'audit_log',
  {
    id: id('audit'),
    actorType: text('actor_type', { enum: ['user', 'api_key', 'customer', 'system'] }).notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    data: jsonb('data').$type<Metadata>(),
    ip: text('ip'),
    ...timestamps,
  },
  (t) => [index('audit_log_resource_idx').on(t.resourceType, t.resourceId), index('audit_log_created_idx').on(t.createdAt)],
)

export const notification = pgTable('notification', {
  id: id('noti'),
  to: text('to').notNull(),
  channel: text('channel').notNull().default('email'),
  template: text('template').notNull(),
  providerId: text('provider_id').notNull(),
  status: text('status', { enum: ['sent', 'failed'] }).notNull(),
  resourceId: text('resource_id'),
  error: text('error'),
  ...timestamps,
})

export const rateLimit = pgTable('rate_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
})

export const domainEvent = pgTable(
  'domain_event',
  {
    id: id('evt'),
    name: text('name').notNull(),
    data: jsonb('data').$type<Metadata>().notNull(),
    ...timestamps,
  },
  (t) => [index('domain_event_name_idx').on(t.name)],
)
