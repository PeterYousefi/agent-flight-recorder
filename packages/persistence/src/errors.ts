export class PersistenceError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_RECORD',
    message: string,
  ) {
    super(message)
    this.name = 'PersistenceError'
  }
}
