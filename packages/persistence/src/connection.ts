import { PrismaClient } from '@prisma/client'
import { PostgresExecutionStore, type PersistenceObserver } from './repositories.js'
import type { ExecutionStore } from '@afr/domain'
export interface DatabaseConnection {
  readonly store: ExecutionStore
  readonly healthCheck: () => Promise<boolean>
  readonly close: () => Promise<void>
}
export function connectPostgres(
  url: string,
  observer: PersistenceObserver = {},
): DatabaseConnection {
  const client = new PrismaClient({ datasources: { db: { url } } })
  return {
    store: new PostgresExecutionStore(client, observer),
    healthCheck: async () => {
      try {
        await client.$queryRaw`SELECT 1`
        return true
      } catch {
        return false
      }
    },
    close: () => client.$disconnect(),
  }
}
