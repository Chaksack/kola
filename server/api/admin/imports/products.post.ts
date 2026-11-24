import { z } from 'zod'
import { withTx } from '../../../db/client'
import { importProductGroup } from '../../../services/csv-io'

/** One chunk of a product import: up to 50 products, each as its rows (one row per variant). */
const schema = z.object({
  products: z.array(z.array(z.record(z.string(), z.string().max(20_000))).min(1).max(200)).min(1).max(50),
  dryRun: z.boolean().default(false),
})

export default defineValidatedHandler({ body: schema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const currencies = await storeCurrencies()
  const url = useServerConfig().databaseUrl
  const results = []
  for (const rows of body.products) results.push(await importProductGroup(useDb(), (fn) => withTx(url, fn), rows, currencies, body.dryRun))
  if (!body.dryRun) await audit(event, actor, 'import.products', 'product', null, { created: results.filter((r) => r.action === 'created').length, updated: results.filter((r) => r.action === 'updated').length, errors: results.filter((r) => r.action === 'error').length })
  return { results }
})
