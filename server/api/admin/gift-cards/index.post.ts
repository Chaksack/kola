import { randomBytes } from 'node:crypto'
import { giftCardInputSchema } from '#shared/schemas/marketing'
import { giftCard } from '../../../db/schema'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateCode(): string {
  const bytes = randomBytes(12)
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length])
  return `KOLA-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

export default defineValidatedHandler({ body: giftCardInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  const code = body.code ?? generateCode()
  const [row] = await useDb().insert(giftCard).values({ code, value: body.value, balance: body.value, currencyCode: body.currencyCode, regionId: body.regionId ?? null, endsAt: body.endsAt ?? null }).onConflictDoNothing().returning()
  if (!row) throw conflict('That code is already in use')
  await audit(event, actor, 'gift_card.created', 'gift_card', row.id, { value: body.value, currencyCode: body.currencyCode })
  // The full code is returned once, at creation.
  return { giftCard: row }
})
