/** Only the rejected order transaction may certify this domain refusal as rolled back. */
export class OrderBusinessRejection extends Error {
  rolledBack = false
  constructor(public readonly code: 'INVENTORY_INSUFFICIENT', details: string) { super(details) }
}
