import { idParamSchema } from '#shared/schemas/common'
import { getPriceList } from '../../../services/promotion-admin'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requireAdmin(event)
  return { priceList: await getPriceList(useDb(), params.id) }
})
