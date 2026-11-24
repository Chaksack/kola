import { z } from 'zod'
import { noteSchema } from '#shared/schemas/order'
import * as actions from '../../../../services/order-actions'

export default defineValidatedHandler({ params: z.object({ id: z.string() }), body: noteSchema }, async (event, { params, body }) =>
  runOrderAction(event, params.id, 'note', 'member', (deps) => actions.addNote(deps, params.id, body.message)),
)
