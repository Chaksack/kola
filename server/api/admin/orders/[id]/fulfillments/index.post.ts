import { z } from 'zod'
import { fulfillmentCreateSchema } from '#shared/schemas/order'
import * as actions from '../../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: fulfillmentCreateSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'fulfill', 'member', (deps) => actions.createFulfillment(deps, params.id, body)),
)
