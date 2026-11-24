import { buildOpenApi } from '../openapi/spec'

/** OpenAPI 3.1 document for the whole API. */
export default defineApiHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300')
  return buildOpenApi(useServerConfig().storeUrl)
})
