export function assertValue<T>(value: T, value_name?: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined)
    throw new Error(`${value_name || 'value'} is null or undefined`)
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

export function clone_json<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}
