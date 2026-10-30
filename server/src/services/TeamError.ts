export class TeamError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
