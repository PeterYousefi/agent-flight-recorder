export class ApplicationError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_REQUEST' | 'PROVIDER_UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'ApplicationError'
  }
}
