/**
 * Transactional email templates. Email clients don't support CSS custom properties, so the Warm paper
 * palette is inlined here from app/assets/css/tokens.css.
 */
import { formatMoney } from '../../shared/utils/money'
import type { EmailMessage } from '../providers/notification'

const C = { ink: '#26251e', ink2: '#4a4943', ink3: '#6b6a64', paper: '#f7f7f4', putty: '#f2f1ed', rule: '#e2e2df', link: '#c94000' }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:${C.paper};font-family:Inter,system-ui,sans-serif;color:${C.ink};font-size:14px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="font-size:18px;letter-spacing:-0.02em;padding-bottom:24px">Kola Market</td></tr>
<tr><td style="background:${C.putty};border:1px solid ${C.rule};border-radius:4px;padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;font-weight:400;letter-spacing:-0.005em">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding-top:20px;font-size:12px;color:${C.ink3}">Kola Market · 14 Oxford Street, Osu, Accra</td></tr>
</table></td></tr></table></body></html>`
}

export interface OrderEmailData {
  displayId: number
  email: string
  currencyCode: string
  items: { title: string; variantTitle: string | null; quantity: number; total: number }[]
  totals: { itemSubtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; total: number }
  isTaxInclusive: boolean
  shippingAddress: { firstName?: string | null; address1?: string | null; city?: string | null; countryCode?: string | null } | null
  paymentProvider: string | null
  orderUrl: string
}

export function orderConfirmationEmail(o: OrderEmailData): EmailMessage {
  const m = (n: number) => formatMoney(n, o.currencyCode)
  const rows = o.items
    .map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.rule}">${esc(i.title)}<br><span style="color:${C.ink3};font-size:12px">${esc(i.variantTitle)} × ${i.quantity}</span></td><td align="right" style="padding:8px 0;border-bottom:1px solid ${C.rule};font-variant-numeric:tabular-nums">${m(i.total)}</td></tr>`)
    .join('')
  const line = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;color:${strong ? C.ink : C.ink2}">${label}</td><td align="right" style="padding:4px 0;font-variant-numeric:tabular-nums${strong ? ';font-weight:500' : ''}">${value}</td></tr>`
  const cod = o.paymentProvider === 'manual' ? `<p style="margin:16px 0 0;color:${C.ink2}">You chose cash on delivery. Please have ${m(o.totals.total)} ready when your order arrives.</p>` : ''
  const body = `<p style="margin:0 0 16px;color:${C.ink2}">Thanks${o.shippingAddress?.firstName ? `, ${esc(o.shippingAddress.firstName)}` : ''}. We've received your order and will email you when it ships.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
${line('Subtotal', m(o.totals.itemSubtotal))}${o.totals.discountTotal ? line('Discount', `−${m(o.totals.discountTotal)}`) : ''}${line('Shipping', m(o.totals.shippingTotal))}${line(o.isTaxInclusive ? 'Tax (included)' : 'Tax', m(o.totals.taxTotal))}${line('Total', m(o.totals.total), true)}</table>${cod}
<p style="margin:20px 0 0"><a href="${esc(o.orderUrl)}" style="color:${C.link}">View your order</a></p>`
  const text = [`Order #${o.displayId} confirmed`, ...o.items.map((i) => `${i.quantity} × ${i.title} (${i.variantTitle ?? ''}) ${m(i.total)}`), `Total ${m(o.totals.total)}`, o.orderUrl].join('\n')
  return { to: o.email, subject: `Order #${o.displayId} confirmed`, html: layout(`Order #${o.displayId} confirmed`, body), text }
}

export function shippingConfirmationEmail(o: { displayId: number; email: string; tracking: { number: string; carrier: string | null; url: string | null }[]; orderUrl: string }): EmailMessage {
  const track = o.tracking.map((t) => `<li>${esc(t.carrier ?? 'Carrier')}: ${t.url ? `<a href="${esc(t.url)}" style="color:${C.link}">${esc(t.number)}</a>` : esc(t.number)}</li>`).join('')
  const body = `<p style="margin:0 0 12px;color:${C.ink2}">Your order is on its way.</p>${track ? `<ul style="padding-left:18px;margin:0 0 12px">${track}</ul>` : ''}<p style="margin:0"><a href="${esc(o.orderUrl)}" style="color:${C.link}">Track your order</a></p>`
  return { to: o.email, subject: `Order #${o.displayId} has shipped`, html: layout(`Order #${o.displayId} has shipped`, body), text: `Order #${o.displayId} has shipped.\n${o.tracking.map((t) => `${t.carrier ?? ''} ${t.number}`).join('\n')}\n${o.orderUrl}` }
}

export function inviteEmail(i: { email: string; role: string; url: string }): EmailMessage {
  const body = `<p style="margin:0 0 16px;color:${C.ink2}">You've been invited to the Kola Market admin as <strong style="font-weight:500">${esc(i.role)}</strong>. The link expires in 7 days.</p><p style="margin:0"><a href="${esc(i.url)}" style="color:${C.link}">Accept the invite</a></p>`
  return { to: i.email, subject: "You're invited to Kola Market", html: layout('Join the Kola Market team', body), text: `You've been invited to Kola Market as ${i.role}.\n${i.url}` }
}
