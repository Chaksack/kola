import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { giftCardUpdateSchema } from '#shared/schemas/marketing'
import { giftCard } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: giftCardUpdateSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const [current] = await useDb().select().from(giftCard).where(eq(giftCard.id, params.id))
  if (!current) throw notFound('Gift card')
  if (body.balance !== undefined && body.balance > current.value) throw badRequest('Balance can’t exceed the card’s value')
  const [row] = await useDb().update(giftCard).set({ isDisabled: body.isDisabled, balance: body.balance, endsAt: body.endsAt === undefined ? undefined : body.endsAt }).where(eq(giftCard.id, params.id)).returning()
  await audit(event, actor, 'gift_card.updated', 'gift_card', params.id, { isDisabled: body.isDisabled, balance: body.balance })
  return { giftCard: { ...row!, code: undefined, codeLast4: row!.code.slice(-4) } }
})
