export async function sequential<T>(promises: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = []
  for (const promise of promises) {
    results.push(await promise())
  }
  return results
}

export function nonNullable<T>(value: T, value_name?: string): NonNullable<T> {
  if (null === value || undefined === value) throw new Error(`${value_name || 'value'} is null or undefined`)
  return value
}

export function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed')
}

export function getEnumValue<T extends Record<string, string | number>>(enum_: T, value: unknown): T[keyof T] | null {
  const keys = Object.keys(enum_) as (keyof T)[]
  for (const key of keys) {
    if (enum_[key] === value) return enum_[key]
  }
  return null
}

export type ModifyType<T, TNew> = Omit<T, keyof TNew> & TNew

export function cloneSimpleObj<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Unflattens a one-dimensional array into a two-dimensional array.
 *
 * @template T - The type of elements in the array.
 * @param arr - The one-dimensional array to unflatten.
 * @param dim_2_size - The size of the inner arrays (second dimension).
 * @param full_rows - If true, drops the last row if it would not be full.
 *                    If false, the last row may be shorter than dim_2_size.
 * @returns {T[][]} A two-dimensional array.
 */
export function unflatten<T>(arr: T[], dim_2_size: number, full_rows: boolean = true): T[][] {
  return Array.from({ length: full_rows ? arr.length / dim_2_size : Math.ceil(arr.length / dim_2_size) }, (_, i) =>
    arr.slice(i * dim_2_size, (i + 1) * dim_2_size),
  )
}

/**
 * @returns The indices of the maximum value in the array.
 */
export function maxIndex(arr: number[]): number[] {
  const max = Math.max(...arr)
  return arr.map((v, i) => (v === max ? i : -1)).filter(i => i !== -1)
}

/**
 * @param snowflake The Discord snowflake to convert.
 * @returns The date the snowflake was created.
 */
export function snowflakeToDate(snowflake: bigint): Date {
  const DISCORD_EPOCH = 1420070400000
  const dateBits = Number(BigInt.asUintN(64, snowflake) >> 22n)
  return new Date(dateBits + DISCORD_EPOCH)
}

export function isInt(value: unknown, nonnegative?: boolean): value is number {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && !(nonnegative && value < 0)
}

/**
 * Parses a string into a non-empty string. Returns undefined if the string is empty or only whitespace.
 */
export function strOrUndefined(value?: string): string | undefined {
  return value?.trim() || undefined
}

/**
 * Parses a string into an integer. Returns null if the string is not a valid integer.
 */
export function intOrNull(value?: string): number | null {
  const int = parseInt(value ?? '')
  return isNaN(int) ? null : int
}

/**
 * Parses a string into an integer. Returns undefined if the string is not a valid integer.
 */
export function intOrUndefined(value?: string): number | undefined {
  const int = parseInt(value ?? '')
  return isNaN(int) ? undefined : int
}

export function truncateString(str: string, max_length: number): string {
  return str.length > max_length ? str.slice(0, max_length - 2) + '..' : str
}

export async function hash(input: object): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(input)) // Convert input to a Uint8Array
  const hashBuffer = await crypto.subtle.digest('SHA-256', data) // Hash the data
  const hashArray = Array.from(new Uint8Array(hashBuffer)) // Convert buffer to byte array
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('') // Convert bytes to hex string
}

export function fillDefaults<T extends object>(object: Partial<T> | undefined, defaults: T): T {
  if (!object) return defaults as T
  return { ...defaults, ...object }
}

export function intToOrdinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}
