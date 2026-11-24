import { z } from 'zod'
import { returnCreateSchema } from '#shared/schemas/order'
import * as actions from '../../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: returnCreateSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'return', 'member', (deps) => actions.requestReturn(deps, params.id, body)),
)
