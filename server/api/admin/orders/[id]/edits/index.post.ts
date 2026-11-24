import { z } from 'zod'
import { editSchema } from '#shared/schemas/order'
import * as actions from '../../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: editSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'edit', 'admin', (deps) => actions.proposeEdit(deps, params.id, body.actions, body.note)),
)
