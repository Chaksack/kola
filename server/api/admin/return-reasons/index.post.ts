import { z } from 'zod'
import { returnReason } from '../../../db/schema'

export default defineValidatedHandler({ body: z.object({ label: z.string().trim().min(1).max(100), description: z.string().trim().max(500).nullish() }) }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  const value = body.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const [row] = await useDb().insert(returnReason).values({ value, label: body.label, description: body.description ?? null }).onConflictDoUpdate({ target: returnReason.value, set: { label: body.label, deletedAt: null } }).returning()
  await audit(event, actor, 'return_reason.created', 'return_reason', row!.id)
  return { reason: row }
})
