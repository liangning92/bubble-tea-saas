/** SQLite does not accept Prisma's PostgreSQL-only QueryMode argument. */
export function containsFilter(value: string, databaseUrl = process.env.DATABASE_URL || 'file:./dev.db') {
  return databaseUrl.startsWith('file:')
    ? { contains: value }
    : { contains: value, mode: 'insensitive' as const }
}
