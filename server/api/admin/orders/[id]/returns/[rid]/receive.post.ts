import { z } from 'zod'
import { returnReceiveSchema } from '#shared/schemas/order'
import * as actions from '../../../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string(), rid: z.string() }), body: returnReceiveSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'receive_return', 'member', (deps) => actions.receiveReturn(deps, params.id, params.rid, body)),
)
