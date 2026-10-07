export class AdapterError extends Error {
  public constructor(
    public readonly code: 'CLOSED' | 'INVALID' | 'NOT_FOUND' | 'CHECKSUM_MISMATCH' | 'TOO_LARGE',
    message: string,
  ) {
    super(message)
    this.name = 'AdapterError'
  }
}
