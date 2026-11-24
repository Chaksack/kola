export default defineTask({
  meta: { name: 'webhook:retry', description: 'Deliver due webhook retries' },
  async run() {
    return { result: await deliverDueWebhooks(100) }
  },
})
