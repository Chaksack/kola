export default defineApiHandler((event) => runCronJob(event, 'webhook-retry', () => deliverDueWebhooks(100)))
