import { z } from 'zod'
import { shipSchema } from '#shared/schemas/order'
import * as actions from '../../../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string(), fid: z.string() }), body: shipSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'ship', 'member', (deps) => actions.shipFulfillment(deps, params.id, params.fid, body.tracking.map((x) => ({ number: x.number, carrier: x.carrier, url: x.url || null })))),
)
