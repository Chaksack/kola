import { expireCarts, releaseStaleReservations } from '../../services/maintenance'

export default defineApiHandler((event) =>
  runCronJob(event, 'cart-expiry', async () => {
    const carts = await expireCarts(useDb())
    const reservations = await releaseStaleReservations(useDb())
    return { ...carts, ...reservations }
  }),
)
