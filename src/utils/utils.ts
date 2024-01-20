export function nonNullable<T>(value: T, value_name?: string): NonNullable<T> {
  if (value === null || value === undefined)
    throw new Error(`${value_name || 'value'} is null or undefined`)
  return value
}

export function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message)
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

export type ModifyType<T, K extends keyof T, U> = Omit<T, K> & {
  [P in K]: U
}

export function cloneSimpleObj<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}
export function unflatten<T>(arr: T[], dim_2_size: number, full_rows = true): T[][] {
  return Array.from(
    { length: full_rows ? arr.length / dim_2_size : Math.ceil(arr.length / dim_2_size) },
    (_, i) => arr.slice(i * dim_2_size, (i + 1) * dim_2_size),
  )
}

// if greatest element is repeated, return undefined
export function maxIndex(arr: number[]): number {
  if (arr.length === 0) return -1
  let max = arr[0]
  let max_index = 0
  let max_repeated = false
  for (let i = 1; i < arr.length; i++) {
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
