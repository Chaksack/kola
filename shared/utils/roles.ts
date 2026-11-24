export const USER_ROLES = ['owner', 'admin', 'member'] as const
export type UserRole = (typeof USER_ROLES)[number]

const RANK: Record<UserRole, number> = { member: 1, admin: 2, owner: 3 }

/** True when `role` is at least `min` (owner > admin > member). */
export function hasRole(role: UserRole, min: UserRole): boolean {
  return RANK[role] >= RANK[min]
}

/**
 * Who may assign which role. Owners can do anything; admins manage members and other admins
 * but can't create or modify owners; members manage nobody.
 */
export function canAssignRole(actor: UserRole, target: UserRole): boolean {
  if (actor === 'owner') return true
  if (actor === 'admin') return target !== 'owner'
  return false
}
