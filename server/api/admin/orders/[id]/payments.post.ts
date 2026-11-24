import { z } from 'zod'
import { recordPaymentSchema } from '#shared/schemas/order'
import * as actions from '../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: recordPaymentSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'record_payment', 'admin', (deps) => actions.recordPayment(deps, params.id, body.amount, body.note)),
)
