import { z } from 'zod'
import { exchangeCreateSchema } from '#shared/schemas/order'
import * as actions from '../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: exchangeCreateSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'exchange', 'admin', (deps) => actions.createExchange(deps, params.id, body)),
)
