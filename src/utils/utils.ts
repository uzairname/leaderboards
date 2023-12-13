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
