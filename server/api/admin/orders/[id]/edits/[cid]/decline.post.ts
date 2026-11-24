import { z } from 'zod'
import * as actions from '../../../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string(), cid: z.string() }) }, async (event, { params }) =>
  runOrderAction(event, params.id, 'edit_decline', 'admin', (deps) => actions.declineEdit(deps, params.id, params.cid)),
)
