/**
 * Map with optional secondary key
 */
export class CacheMap<K, V, K2 extends string | number | undefined = undefined> extends Map<K, V> {
  constructor(
    public name?: string,
    private log?: (msg: string) => void,
    options: { log_hits?: boolean; log_misses?: boolean } = {},
  ) {
    super()
    this.log_hits = options.log_hits ?? true
    this.log_misses = options.log_misses ?? true
  }
  private readonly log_hits: boolean
  private readonly log_misses: boolean

  toString() {
    // list the keys in the map. If the value is a CacheMap, list the keys in that as well
    return `[CacheMap ${this.name}: ${Array.from(this.entries())
      .map(([key, value]): string => {
        if (value instanceof CacheMap) {
          return `${key}: ${value.toString()}`
        } else {
          return `${key}: ${value}`
        }
      })
      .join(', ')}]`
  }

  /**
   * Get value with optional secondary key
   */
  get(key: K, key2?: K2): V | undefined {
    const value = super.get(key)
    if (value) {
      if (key2) {
        if (!(value instanceof CacheMap)) return
        const value2 = value.get(key2)
        if (value2) {
          this.name && this.log && this.log_hits && this.log(`Cache hit for ${this.name} ${key} ${key2}`)
          return value2
        } else {
          this.name && this.log && this.log_misses && this.log(`Cache miss for ${this.name} ${key} ${key2}`)
          return
        }
      } else {
        // this.name && this.log && this.log(`Cache hit for ${this.name} ${key}`)
        return value
      }
    } else {
      this.name && this.log && this.log_misses && this.log(`Cache miss for ${this.name} ${key}`)
    }
  }

  set(key: K, value: V, key2?: K2): this {
    if (key2) {
      let inner_cachemap = super.get(key) as CacheMap<K2, V> | undefined
      if (!(inner_cachemap instanceof CacheMap)) {
        inner_cachemap = new CacheMap<K2, V>()
      }
      inner_cachemap.set(key2, value)

      super.set(key, inner_cachemap as V)
    } else {
      super.set(key, value)
    }

    return this
  }

  delete(key: K, key2?: K2): boolean {
    if (key2) {
      const innerCache = super.get(key)
      if (innerCache instanceof CacheMap) {
        const deleted = innerCache.delete(key2)
        // If the inner cache is now empty, remove the outer key as well
        if (innerCache.size === 0) {
          super.delete(key)
        }
        return deleted
      } else {
        return false
      }
    } else {
      return super.delete(key)
    }
  }

  has(key: K, key2?: K2): boolean {
    if (key2) {
      const innerCache = super.get(key)
      return innerCache instanceof CacheMap && innerCache.has(key2)
    } else {
      return super.has(key)
    }
  }
}
