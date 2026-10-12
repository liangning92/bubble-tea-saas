export class ReceiptLogoConflict extends Error {}

const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

// Once a receipt logo belongs to Receipt Settings, stale store/global writers
// cannot change it. Legacy clients may still save unrelated receipt settings.
export function prepareReceiptLogoConfig(previous: unknown, incoming: unknown): unknown {
  if (!object(previous) || previous.logoPurpose !== 'receipt') return incoming
  if (!object(incoming)) throw new ReceiptLogoConflict('Refresh Receipt Settings before changing its logo.')
  if (incoming.logoPurpose !== 'receipt') {
    if ('storeLogo' in incoming && incoming.storeLogo !== previous.storeLogo) {
      throw new ReceiptLogoConflict('Refresh Receipt Settings before changing its logo.')
    }
    return { ...previous, ...incoming, logoPurpose: 'receipt', storeLogo: previous.storeLogo, logoSources: previous.logoSources, logoVariant: previous.logoVariant }
  }
  return { ...previous, ...incoming, logoPurpose: 'receipt' }
}
