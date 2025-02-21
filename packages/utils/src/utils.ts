export async function sequential<T>(promises: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = []
  for (const promise of promises) {
    results.push(await promise())
  }
  return results
}

export function nonNullable<T>(value: T, value_name?: string): NonNullable<T> {
  if (value === null || value === undefined)
    throw new Error(`${value_name || 'value'} is null or undefined`)
  return value
}

export function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed')
}

export function getEnumValue<T extends Record<string, string | number>>(
  enum_: T,
  value: unknown,
): T[keyof T] | null {
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
  return Array.from(
    { length: full_rows ? arr.length / dim_2_size : Math.ceil(arr.length / dim_2_size) },
    (_, i) => arr.slice(i * dim_2_size, (i + 1) * dim_2_size),
  )
}

/**
 * @returns The index of the maximum value in the array.
 * If there are multiple maximum values or the array is empty, returns -1.
 */
export function maxIndex(arr: number[]): number {
  let max = -Infinity
  let max_index = -1
  let max_repeated = false
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i]
      max_index = i
      max_repeated = false
    } else if (arr[i] === max) {
      max_repeated = true
    }
  }
  return max_repeated ? -1 : max_index
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

export function strOrUndefined(value?: string): string | undefined {
  return value?.trim() || undefined
}

export function intOrUndefined(value?: string): number | undefined {
  const int = parseInt(value ?? '')
  return isNaN(int) ? undefined : int
}
export function truncateString(str: string, max_length: number): string {
  return str.length > max_length ? str.slice(0, max_length - 2) + '..' : str
}
