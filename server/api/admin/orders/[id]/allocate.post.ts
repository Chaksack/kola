import { z } from 'zod'
import * as actions from '../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }) }, async (event, { params }) =>
  runOrderAction(event, params.id, 'allocate', 'member', (deps) => actions.allocateStock(deps, params.id)),
)
