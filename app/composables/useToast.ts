export interface ToastItem {
  id: number
  message: string
  tone: 'ok' | 'danger' | 'warn' | 'neutral'
}

let seq = 0

export function useToast() {
  const toasts = useState<ToastItem[]>('ui-toasts', () => [])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function push(message: string, tone: ToastItem['tone'] = 'ok', ttl = 4000) {
    const id = ++seq
    toasts.value = [...toasts.value, { id, message, tone }]
    if (import.meta.client) setTimeout(() => dismiss(id), ttl)
    return id
  }

  return {
    toasts,
    dismiss,
    success: (m: string) => push(m, 'ok'),
    error: (m: string) => push(m, 'danger', 6000),
    info: (m: string) => push(m, 'neutral'),
    push,
  }
}
