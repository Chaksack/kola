import { expireCarts, releaseStaleReservations } from '../../services/maintenance'

export default defineTask({
  meta: { name: 'cart:expiry', description: 'Delete expired carts and release stale reservations' },
  async run() {
    return { result: { ...(await expireCarts(useDb())), ...(await releaseStaleReservations(useDb())) } }
  },
})
