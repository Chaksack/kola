import { Resend } from 'resend'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface NotificationProvider {
  id: string
  send(msg: EmailMessage): Promise<{ id: string | null }>
}

export function resendProvider(apiKey: string, from: string): NotificationProvider {
  const client = new Resend(apiKey)
  return {
    id: 'resend',
    async send(msg) {
      const { data, error } = await client.emails.send({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text })
      if (error) throw new Error(error.message)
      return { id: data?.id ?? null }
    },
  }
}

/** Development fallback: logs the subject and recipient (never the body, which may hold links). */
export function consoleProvider(): NotificationProvider {
  return {
    id: 'console',
    async send(msg) {
      console.info(`[email] to=${msg.to} subject="${msg.subject}"`)
      return { id: null }
    },
  }
}
