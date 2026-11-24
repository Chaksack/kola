let dummyHash: Promise<string> | null = null

/**
 * Verify a password against a hash, or against a dummy hash when the account doesn't exist, so
 * response time doesn't reveal which emails are registered.
 */
export async function verifyPasswordConstantTime(hash: string | null | undefined, plain: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= hashPassword('kola-dummy-password-for-timing')
    await verifyPassword(await dummyHash, plain)
    return false
  }
  return verifyPassword(hash, plain)
}
