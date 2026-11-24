import { releaseStaleReservations } from '../../services/maintenance'

export default defineApiHandler((event) => runCronJob(event, 'reservation-release', () => releaseStaleReservations(useDb())))
