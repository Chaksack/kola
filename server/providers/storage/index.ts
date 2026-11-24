import { put, del } from '@vercel/blob'

export interface StoredFile {
  url: string
  pathname: string
  size: number
  contentType: string
}

export interface StorageProvider {
  id: string
  put(pathname: string, data: Buffer, contentType: string): Promise<StoredFile>
  delete(url: string): Promise<void>
}

export function vercelBlobStorage(token: string): StorageProvider {
  return {
    id: 'vercel-blob',
    async put(pathname, data, contentType) {
      const res = await put(pathname, data, { access: 'public', contentType, token, addRandomSuffix: true })
      return { url: res.url, pathname: res.pathname, size: data.byteLength, contentType }
    },
    async delete(url) {
      await del(url, { token })
    },
  }
}

/**
 * Development-only fallback when BLOB_READ_WRITE_TOKEN is unset: returns a data: URL so uploads work
 * without any filesystem writes. Capped small because the URL is stored in the database.
 */
export const DATA_URL_MAX_BYTES = 1024 * 1024

export function dataUrlStorage(): StorageProvider {
  return {
    id: 'data-url',
    async put(pathname, data, contentType) {
      return { url: `data:${contentType};base64,${data.toString('base64')}`, pathname, size: data.byteLength, contentType }
    },
    async delete() {},
  }
}
