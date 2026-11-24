import { z } from 'zod'
import { cancelSchema } from '#shared/schemas/order'
import * as actions from '../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: cancelSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'cancel', 'admin', (deps) => actions.cancelOrder(deps, params.id, body.reason)),
)
