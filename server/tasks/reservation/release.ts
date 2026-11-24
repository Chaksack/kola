import { releaseStaleReservations } from '../../services/maintenance'

export default defineTask({
  meta: { name: 'reservation:release', description: 'Release checkout reservations that expired' },
  async run() {
    return { result: await releaseStaleReservations(useDb()) }
  },
})
