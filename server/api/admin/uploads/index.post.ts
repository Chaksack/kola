import { DATA_URL_MAX_BYTES } from '../../../providers/storage'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_FILES = 10

export default defineApiHandler(async (event) => {
  const actor = await requireAdmin(event)
  const length = Number(getHeader(event, 'content-length') ?? 0)
  if (length > MAX_BYTES * MAX_FILES + 64 * 1024) throw apiError(413, 'payload_too_large', 'Upload is too large')
  const parts = (await readMultipartFormData(event)) ?? []
  const files = parts.filter((p) => p.name === 'files' && p.filename)
  if (!files.length) throw badRequest('Attach one or more images in the "files" field')
  if (files.length > MAX_FILES) throw badRequest(`Upload at most ${MAX_FILES} files at once`)

  const storage = useStorage()
  const limit = storage.id === 'data-url' ? DATA_URL_MAX_BYTES : MAX_BYTES
  const uploaded = []
  for (const f of files) {
    if (f.data.byteLength > limit) throw apiError(413, 'payload_too_large', `${f.filename} is larger than ${Math.round(limit / 1024 / 1024)}MB`)
    const kind = sniffImage(f.data)
    if (!kind) throw apiError(415, 'unsupported_media_type', `${f.filename} is not a JPEG, PNG, WebP, AVIF or GIF image`)
    const base = (f.filename ?? 'image').replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase().slice(0, 60) || 'image'
    uploaded.push(await storage.put(`products/${base}.${kind.ext}`, f.data, kind.type))
  }
  await audit(event, actor, 'upload.created', 'file', null, { count: uploaded.length, provider: storage.id })
  return { files: uploaded.map(({ url, size, contentType }) => ({ url, size, contentType })) }
})
