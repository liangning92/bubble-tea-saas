import { randomBytes } from 'crypto'

/** Independent bearer code: cryptographically random, uppercase and easy to photograph. */
export function generateCouponCode(): string {
  return 'YOUME-' + randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g)!.join('-')
}
