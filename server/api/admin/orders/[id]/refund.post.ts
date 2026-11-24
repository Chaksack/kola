import { z } from 'zod'
import { refundSchema } from '#shared/schemas/order'
import * as actions from '../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: refundSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'refund', 'admin', (deps) => actions.refundPayment(deps, params.id, body.amount, { reason: body.reason, note: body.note })),
)
