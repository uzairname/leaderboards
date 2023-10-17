/**
 * This cache is stored in a worker's isolate's global context
 */

class Cache {
  private _cache: Record<string, unknown> = {}

  get(key: string): unknown {
    return this._cache[key]
  }

  set(key: string, value: unknown): void {
    this._cache[key] = value
  }

  delete(key: string): void {
    delete this._cache[key]
  }
}

export const cache = new Cache()
