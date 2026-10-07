import { config } from '../config/env'

// This application selects PostgreSQL via postgres(ql): and SQLite via file:.
// Prisma SQLite does not accept `mode`; its native LIKE folds ASCII only.
export function containsText(value: string, databaseUrl: string = config.databaseUrl) {
  return /^postgres(?:ql)?:/i.test(databaseUrl)
    ? { contains: value, mode: 'insensitive' as const }
    : { contains: value }
}
