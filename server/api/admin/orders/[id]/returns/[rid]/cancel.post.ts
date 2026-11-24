import { z } from 'zod'
import * as actions from '../../../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string(), rid: z.string() }) }, async (event, { params }) =>
  runOrderAction(event, params.id, 'cancel_return', 'member', (deps) => actions.cancelReturn(deps, params.id, params.rid)),
)
