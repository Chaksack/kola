import { PAYMENT_PROVIDERS } from '#shared/utils/providers'

/** Available providers and whether their credentials are configured. */
export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const cfg = useServerConfig()
  const configured: Record<string, boolean> = {
    paystack: Boolean(cfg.paystackSecretKey),
    'paystack-momo': Boolean(cfg.paystackSecretKey),
    stripe: Boolean(cfg.stripeSecretKey),
    manual: true,
  }
  return { data: Object.values(PAYMENT_PROVIDERS).map((p) => ({ ...p, configured: configured[p.id] ?? false })) }
})
