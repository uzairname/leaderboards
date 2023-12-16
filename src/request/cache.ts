/**
 * This cache is stored in a worker's isolate's global context
 */
class Cache {
  private cache: Record<string, unknown> = {}

  get(key: string): unknown {
    return this.cache[key]
  }

  set(key: string, value: unknown): void {
    this.cache[key] = value
  }

  delete(key: string): void {
    delete this.cache[key]
  }
}

// export const cache = new Cache()
export const cache: Record<string, unknown> = {}
