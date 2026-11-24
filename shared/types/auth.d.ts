// Session shape for nuxt-auth-utils. One sealed cookie holds both actors under separate keys,
// so an admin can browse the storefront as a customer without being logged out of the admin.
// Only public identifiers go here: the session JSON is readable via /api/_auth/session.
import type { UserRole } from '../utils/roles'

declare module '#auth-utils' {
  interface UserSession {
    admin?: {
      id: string
      email: string
      name: string | null
      role: UserRole
    }
    customer?: {
      id: string
      email: string
      name: string | null
    }
  }
}

export {}
