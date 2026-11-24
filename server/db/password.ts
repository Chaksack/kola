/**
 * Same scrypt hasher nuxt-auth-utils uses (default options), for scripts that run outside Nitro.
 * Hashes made here verify with `verifyPassword` at runtime.
 */
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'

const hasher = new Hash(new Scrypt({}))

export const hashPasswordStandalone = (plain: string) => hasher.make(plain)
