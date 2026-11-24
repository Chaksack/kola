/** Runtime config values that use "{{VAR}}" env expansion stay literal when VAR is unset. */
export function configValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  return /^\{\{[^{}]*\}\}$/.test(value.trim()) ? '' : value
}
