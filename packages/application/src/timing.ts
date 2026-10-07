export class ProviderDeadlineError extends Error {}
export interface ProviderTiming {
  run<T>(work: () => Promise<T>, timeoutMs: number): Promise<T>
}
export const systemTiming: ProviderTiming = {
  async run<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new ProviderDeadlineError('Provider deadline exceeded')),
            timeoutMs,
          )
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  },
}
