// Session shape for nuxt-auth-utils. Admin users and customers share one sealed cookie
// but are distinguished by `actor`; server helpers check it on every request.
declare module '#auth-utils' {
  interface User {
    actor: 'admin' | 'customer'
    id: string
    email: string
    name: string | null
    /** Admin users only. */
    role?: 'owner' | 'admin' | 'member'
  }
}

export {}
