import { z } from 'zod'
import * as actions from '../../../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string(), fid: z.string() }) }, async (event, { params }) =>
  runOrderAction(event, params.id, 'cancel_fulfillment', 'member', (deps) => actions.cancelFulfillment(deps, params.id, params.fid)),
)
