import { dataUrlStorage, vercelBlobStorage, type StorageProvider } from '../providers/storage'

export function useFileStorage(): StorageProvider {
  const { blobReadWriteToken, allowDataUrlUploads } = useServerConfig()
  if (blobReadWriteToken) return vercelBlobStorage(blobReadWriteToken)
  if (import.meta.dev || allowDataUrlUploads) return dataUrlStorage()
  throw apiError(503, 'storage_not_configured', 'File storage is not configured (set BLOB_READ_WRITE_TOKEN)')
}

const SIGNATURES: { type: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/gif', ext: 'gif', test: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  { type: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { type: 'image/avif', ext: 'avif', test: (b) => b.subarray(4, 12).toString('ascii') === 'ftypavif' },
]

/** Identify an image by its magic bytes, never by the client-supplied content type or file name. */
export function sniffImage(data: Buffer): { type: string; ext: string } | null {
  const hit = SIGNATURES.find((s) => s.test(data))
  return hit ? { type: hit.type, ext: hit.ext } : null
}
