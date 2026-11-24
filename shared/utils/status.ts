export type StatusTone = 'ok' | 'warn' | 'info' | 'neutral' | 'danger'

const TONES: Record<string, StatusTone> = {
  // ok
  captured: 'ok',
  delivered: 'ok',
  published: 'ok',
  fulfilled: 'ok',
  completed: 'ok',
  active: 'ok',
  enabled: 'ok',
  paid: 'ok',
  received: 'ok',
  in_stock: 'ok',
  confirmed: 'ok',
  // warn
  awaiting: 'warn',
  not_paid: 'warn',
  authorized: 'warn',
  not_fulfilled: 'warn',
  proposed: 'warn',
  pending: 'warn',
  requested: 'warn',
  requires_action: 'warn',
  low_stock: 'warn',
  scheduled: 'warn',
  // info
  shipped: 'info',
  partially_fulfilled: 'info',
  partially_shipped: 'info',
  partially_captured: 'info',
  partially_refunded: 'info',
  partially_delivered: 'info',
  processing: 'info',
  // neutral
  refunded: 'neutral',
  returned: 'neutral',
  draft: 'neutral',
  disabled: 'neutral',
  archived: 'neutral',
  expired: 'neutral',
  revoked: 'neutral',
  not_tracked: 'neutral',
  // danger
  canceled: 'danger',
  failed: 'danger',
  rejected: 'danger',
  out_of_stock: 'danger',
}

const LABELS: Record<string, string> = {
  not_paid: 'Not paid',
  awaiting: 'Awaiting',
  not_fulfilled: 'Not fulfilled',
  partially_fulfilled: 'Partially fulfilled',
  partially_shipped: 'Partially shipped',
  partially_captured: 'Partially captured',
  partially_refunded: 'Partially refunded',
  partially_delivered: 'Partially delivered',
  requires_action: 'Requires action',
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
  not_tracked: 'Not tracked',
}

export function statusTone(status: string): StatusTone {
  return TONES[status] ?? 'neutral'
}

export function statusLabel(status: string): string {
  if (LABELS[status]) return LABELS[status]
  const s = status.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
