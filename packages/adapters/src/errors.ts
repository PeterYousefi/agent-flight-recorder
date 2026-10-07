export class AdapterError extends Error {
  public constructor(
    public readonly code:
      'UNAVAILABLE' | 'CLOSED' | 'INVALID' | 'NOT_FOUND' | 'CHECKSUM_MISMATCH' | 'TOO_LARGE',
    message: string,
  ) {
    super(message)
    this.name = 'AdapterError'
  }
}
