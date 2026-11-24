import type { H3Event } from 'h3'
import { auditLog } from '../db/schema'
import type { AdminActor } from './auth'

/** Append to the audit log. Never pass secrets or passwords in `data`. */
export async function audit(
  event: H3Event,
  actor: AdminActor | { type: 'customer' | 'system'; id: string | null },
  action: string,
  resourceType: string,
  resourceId: string | null,
  data?: Record<string, unknown>,
) {
  await useDb()
    .insert(auditLog)
    .values({
      actorType: actor.type,
      actorId: actor.id,
      action,
      resourceType,
      resourceId,
      data,
      ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
    })
}
