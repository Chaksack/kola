import { describe, expect, it } from 'vitest'
import { buildOpenApi } from '../../server/openapi/spec'

describe('openapi', () => {
  it('builds a 3.1 document with schemas derived from zod', () => {
    const doc = buildOpenApi('https://kola.example')
    expect(doc.openapi).toBe('3.1.0')
    const create = doc.paths['/api/admin/products']!.post as { requestBody: { content: { 'application/json': { schema: { properties: Record<string, unknown> } } } } }
    expect(Object.keys(create.requestBody.content['application/json'].schema.properties)).toEqual(expect.arrayContaining(['title', 'variants', 'options']))
    const complete = doc.paths['/api/store/carts/{id}/complete']!.post as { parameters: { name: string }[] }
    expect(complete.parameters.map((p) => p.name)).toEqual(expect.arrayContaining(['id', 'x-publishable-api-key', 'Idempotency-Key']))
    expect(Object.keys(doc.paths).length).toBeGreaterThan(50)
  })
})
