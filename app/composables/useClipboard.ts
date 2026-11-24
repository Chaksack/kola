export function useClipboard() {
  const toast = useToast()
  return async function copy(text: string, label = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label)
    } catch {
      toast.error('Copy failed. Select the text and copy it manually.')
    }
  }
}
