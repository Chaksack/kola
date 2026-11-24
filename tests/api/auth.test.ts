import { describe, expect, it } from 'vitest'
import { Client, hasServer } from './client'
import { ADMIN_EMAIL, adminClient, clientWithRole, publishableKey, uniqueEmail } from './helpers'

describe.skipIf(!hasServer)('admin auth', () => {
  it('rejects bad credentials with the standard error shape', async () => {
    const res = await new Client().post('/api/admin/auth/login', { email: ADMIN_EMAIL, password: 'wrong-password' })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ code: 'invalid_credentials', message: 'Email or password is incorrect' })
  })

  it('validates input with zod', async () => {
    const res = await new Client().post('/api/admin/auth/login', { email: 'not-an-email' })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'validation_error' })
  })

  it('signs in the owner and returns the actor', async () => {
    const c = await adminClient()
    const me = await c.get<{ actor: { role: string; email: string } }>('/api/admin/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.actor).toMatchObject({ role: 'owner', email: ADMIN_EMAIL })
  })

  it('requires a session for admin routes', async () => {
    const res = await new Client().get('/api/admin/users')
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'unauthorized' })
  })

  it('blocks cross-origin cookie mutations (CSRF)', async () => {
    const c = await adminClient()
    const res = await c.post('/api/admin/invites', { email: uniqueEmail('csrf'), role: 'member' }, { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'csrf_failed' })
  })

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await new Client().get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ code: 'not_found' })
  })
})

describe.skipIf(!hasServer)('roles', () => {
  it('a member can read users but cannot manage them', async () => {
    const member = await clientWithRole('member')
    expect((await member.get('/api/admin/users')).status).toBe(200)
    expect((await member.post('/api/admin/invites', { email: uniqueEmail('inv'), role: 'member' })).status).toBe(403)
    expect((await member.get('/api/admin/invites')).status).toBe(403)
    const owner = await adminClient()
    const users = await owner.get<{ data: { id: string; role: string }[] }>('/api/admin/users')
    const target = users.body.data.find((u) => u.role === 'owner')!
    expect((await member.patch(`/api/admin/users/${target.id}`, { role: 'member' })).status).toBe(403)
    expect((await member.delete(`/api/admin/users/${target.id}`)).status).toBe(403)
  })

  it('a member cannot create or revoke API keys', async () => {
    const member = await clientWithRole('member')
    expect((await member.post('/api/admin/api-keys', { title: 'nope', type: 'secret' })).status).toBe(403)
    expect((await member.post('/api/admin/api-keys', { title: 'nope', type: 'publishable' })).status).toBe(403)
    const owner = await adminClient()
    const created = await owner.post<{ apiKey: { id: string } }>('/api/admin/api-keys', { title: 'Role test', type: 'publishable' })
    expect(created.status).toBe(200)
    expect((await member.post(`/api/admin/api-keys/${created.body.apiKey.id}/revoke`)).status).toBe(403)
    expect((await owner.post(`/api/admin/api-keys/${created.body.apiKey.id}/revoke`)).status).toBe(200)
  })

  it('an admin cannot promote anyone to owner', async () => {
    const admin = await clientWithRole('admin')
    const res = await admin.post('/api/admin/invites', { email: uniqueEmail('own'), role: 'owner' })
    expect(res.status).toBe(403)
  })
})

describe.skipIf(!hasServer)('secret API keys', () => {
  it('authenticate as Bearer tokens, are stored hashed, and stop working when revoked', async () => {
    const owner = await adminClient()
    const created = await owner.post<{ apiKey: { id: string; redacted: string }; token: string }>('/api/admin/api-keys', { title: 'CI key', type: 'secret' })
    expect(created.status).toBe(200)
    const { token } = created.body
    expect(token).toMatch(/^sk_/)
    expect(created.body.apiKey.redacted.endsWith(token.slice(-4))).toBe(true)

    const listed = await owner.get<{ data: { id: string; token?: string }[] }>('/api/admin/api-keys?type=secret')
    expect(listed.body.data.find((k) => k.id === created.body.apiKey.id)?.token).toBeUndefined()

    const bearer = new Client({ authorization: `Bearer ${token}` })
    expect((await bearer.get('/api/admin/users')).status).toBe(200)
    // Keys act as admin, never owner, and can't mint more secret keys.
    expect((await bearer.post('/api/admin/api-keys', { title: 'x', type: 'secret' })).status).toBe(403)

    await owner.post(`/api/admin/api-keys/${created.body.apiKey.id}/revoke`)
    expect((await bearer.get('/api/admin/users')).status).toBe(401)
  })
})

describe.skipIf(!hasServer)('invites', () => {
  it('invite → lookup → accept creates a user once', async () => {
    const owner = await adminClient()
    const email = uniqueEmail('invitee')
    const inv = await owner.post<{ url: string }>('/api/admin/invites', { email, role: 'member' })
    expect(inv.status).toBe(200)
    const token = new URL(inv.body.url).searchParams.get('token')!
    const lookup = await new Client().get<{ invite: { email: string } }>(`/api/admin/invites/lookup?token=${encodeURIComponent(token)}`)
    expect(lookup.body.invite.email).toBe(email)

    const invitee = new Client()
    const accepted = await invitee.post('/api/admin/invites/accept', { token, firstName: 'New', password: 'a-strong-password' })
    expect(accepted.status).toBe(200)
    expect((await invitee.get('/api/admin/auth/me')).status).toBe(200)
    const again = await new Client().post('/api/admin/invites/accept', { token, firstName: 'Again', password: 'a-strong-password' })
    expect(again.status).toBe(404)
  })
})

describe.skipIf(!hasServer)('customers', () => {
  it('store routes require a publishable key', async () => {
    const res = await new Client().post('/api/store/auth/login', { email: 'x@example.com', password: 'whatever' })
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'publishable_key_required' })
  })

  it('register → me → addresses → logout → login', async () => {
    const pk = await publishableKey()
    const c = new Client({ 'x-publishable-api-key': pk })
    const email = uniqueEmail()
    const reg = await c.post('/api/store/customers', { email, password: 'customer-pass-1', firstName: 'Akos' })
    expect(reg.status).toBe(200)
    const dup = await new Client({ 'x-publishable-api-key': pk }).post('/api/store/customers', { email, password: 'customer-pass-1', firstName: 'Akos' })
    expect(dup.status).toBe(409)

    const addr = await c.post<{ address: { id: string } }>('/api/store/customers/me/addresses', { address1: '1 Test St', city: 'Accra', countryCode: 'GH', isDefaultShipping: true })
    expect(addr.status).toBe(200)
    const me = await c.get<{ customer: { email: string; addresses: { countryCode: string }[] } }>('/api/store/customers/me')
    expect(me.body.customer.email).toBe(email)
    expect(me.body.customer.addresses[0]?.countryCode).toBe('gh')

    await c.post('/api/store/auth/logout')
    expect((await c.get('/api/store/customers/me')).status).toBe(401)
    expect((await c.post('/api/store/auth/login', { email, password: 'customer-pass-1' })).status).toBe(200)
    expect((await c.get('/api/store/customers/me')).status).toBe(200)
  })

  it('a customer session cannot reach admin routes', async () => {
    const pk = await publishableKey()
    const c = new Client({ 'x-publishable-api-key': pk })
    await c.post('/api/store/customers', { email: uniqueEmail(), password: 'customer-pass-1', firstName: 'Kofi' })
    expect((await c.get('/api/admin/users')).status).toBe(401)
  })
})

describe.skipIf(!hasServer)('rate limiting', () => {
  it('locks out repeated failed logins with 429 and Retry-After', async () => {
    const c = new Client()
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      statuses.push((await c.post('/api/admin/auth/login', { email: 'nobody@kola.test', password: 'wrong' })).status)
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true)
    const last = await c.post('/api/admin/auth/login', { email: 'nobody@kola.test', password: 'wrong' })
    expect(last.status).toBe(429)
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0)
  })
})
