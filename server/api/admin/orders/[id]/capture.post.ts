import { z } from 'zod'
import { captureSchema } from '#shared/schemas/order'
import * as actions from '../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: captureSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'capture', 'member', (deps) => actions.capturePayment(deps, params.id, body.amount)),
)
