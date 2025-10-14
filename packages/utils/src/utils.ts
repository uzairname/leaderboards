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
 * Determines whether two arrays are equal in terms of length and content.
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}


/**
 * Groups items from a record that are considered equal by a callback function.
 *
 * @param record - The input object with numeric keys, e.g., { 1: 'a', 2: 'b', 3: 'a' }.
 * @param isEqual - A callback function that returns true if two values are equal.
 * @returns A Map where each key is an array of original keys and each value
 * is the shared value for those keys.
 */
export function groupEqualValues<T>(
  record: Record<number, T>,
  isEqual: (a: T, b: T) => boolean
): Map<number[], T> {
  const groupedMap = new Map<number[], T>();

  // Iterate over each key-value pair in the input record.
  for (const keyStr in record) {
    // Ensure we only process the object's own properties.
    if (Object.prototype.hasOwnProperty.call(record, keyStr)) {
      const key = parseInt(keyStr, 10);
      const value = record[key];
      let foundGroup = false;

      // Check if a group for an equal value already exists in our map.
      for (const [keys, existingValue] of groupedMap.entries()) {
        if (isEqual(value, existingValue)) {
          // If found, add the current key to that group's key array.
          keys.push(key);
          foundGroup = true;
          break; // Exit the inner loop once a group is found.
        }
      }

      // If no matching group was found, create a new one.
      if (!foundGroup) {
        groupedMap.set([key], value);
      }
    }
  }

  return groupedMap;
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
  return str.length > max_length ? str.slice(0, max_length - 1) + '…' : str
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

/**
 * Finds the indices of the first element in a 2D array that satisfies the predicate.
 * @param {T[][]} array The 2D array to search within.
 * @param {(element: T, rowIndex: number, colIndex: number) => boolean} predicate A function that returns true for the desired element. It receives the element, its row index, and its column index.
 * @returns {[number, number] | null} A tuple [rowIndex, colIndex] if found, otherwise null.
 */
export function findDoubleIndex<T>(
  array: T[][],
  predicate: (element: T, rowIndex: number, colIndex: number) => boolean,
): [number, number] | null {
  for (let i = 0; i < array.length; i++) {
    for (let j = 0; j < array[i].length; j++) {
      // Execute the callback for the current element
      if (predicate(array[i][j], i, j)) {
        // If the predicate returns true, we found our match
        return [i, j]
      }
    }
  }

  // No element satisfied the predicate
  return null
}

/**
 * Converts an HSV color to a hexadecimal string.
 * @param h - The hue of the color (0-360 degrees).
 * @param s - The saturation of the color (0-1).
 * @param v - The value (brightness) of the color (0-1).
 */
export function colorHSVToHex(h: number, s: number, v: number): string {
  const r = Math.round(v * (1 + s * (Math.cos((h * Math.PI) / 180) - 1)))
  const g = Math.round(v * (1 + s * (Math.cos(((h + 120) * Math.PI) / 180) - 1)))
  const b = Math.round(v * (1 + s * (Math.cos(((h + 240) * Math.PI) / 180) - 1)))

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * Sorts two arrays based on the values of the first array. The second array
 * is rearranged to maintain the correspondence of elements with the first array.
 *
 * @template T - The type of elements in the first array.
 * @template U - The type of elements in the second array.
 * @param arrayA - The array whose values determine the sorting order.
 * @param arrayB - The array to be rearranged to match the sorted order of `arrayA`.
 * @returns A tuple containing the sorted versions of `arrayA` and `arrayB`.
 *
 * @example
 * ```typescript
 * const arrayA = [3, 1, 2];
 * const arrayB = ['three', 'one', 'two'];
 * const [sortedA, sortedB] = sortArraysByFirst(arrayA, arrayB);
 * console.log(sortedA); // [1, 2, 3]
 * console.log(sortedB); // ['one', 'two', 'three']
 * ```
 */
export function sortArraysByFirst<T, U>(arrayA: T[], arrayB: U[]): [T[], U[]] {
  // Create array of indices [0, 1, 2, ...]
  const indices = arrayA.map((_, index) => index)

  // Sort indices based on arrayA values
  indices.sort((i, j) => {
    if (arrayA[i] < arrayA[j]) return -1
    if (arrayA[i] > arrayA[j]) return 1
    return 0
  })

  // Apply the permutation to both arrays
  const sortedA = indices.map(i => arrayA[i])
  const sortedB = indices.map(i => arrayB[i])

  return [sortedA, sortedB]
}

export async function awaitWithTimeout<T>(promise: Promise<T>, callback: () => void, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | number | undefined
  let callbackExecuted = false

  // Create a timeout promise that executes the callback
  const timeoutPromise = new Promise<never>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      if (!callbackExecuted) {
        callbackExecuted = true
        callback()
      }
      // Don't resolve or reject - we want to continue waiting for the original promise
    }, timeoutMs)
  })

  try {
    // Race between the timeout and the original promise
    await Promise.race([promise, timeoutPromise])
  } catch {
    // If promise rejects before timeout, we still want to clear timeout
    // and not execute callback
  }

  // Clear the timeout if promise resolved/rejected before timeout
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId)
  }

  // Always return the result of the original promise
  return promise
}

export const ansicolors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
}

export const ansistyles = {
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',
}

export function addStyle(message: string, color: keyof typeof ansicolors, style?: keyof typeof ansistyles): string {
  const colorCode = ansicolors[color]
  const styleCode = style ? ansistyles[style] : ''
  return `${styleCode}${colorCode}${message}${ansicolors.reset}`
}

export function log(message: string, color: keyof typeof ansicolors, style?: keyof typeof ansistyles) {
  const styledMessage = addStyle(message, color, style)
  console.log(styledMessage)
}

/**
 * Parses any hex code contained in the string and returns it as a number.
 * Returns null if no valid hex code is found.
 */
export function parseColor(str: string): number | null {
  const match = str.match(/#?([0-9a-f]{6})/i)
  if (!match) return null
  if (match[1].length !== 6) return null
  return parseInt(match[1], 16)
}
export function listToString(list: string[], conjunction: 'and' | 'or' = 'and') {
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} ${conjunction} ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, ${conjunction} ${list[list.length - 1]}`
}

export function safeStringify(value: any): string {
  try {
    return JSON.stringify(value)
  } catch {
    return `[Obj]`
  }
}


/**
 * Removes any non-alphanumeric characters, converts to lowercase, and replaces spaces with underscores.
 * @param str The input string to clean.
 * @returns The cleaned string.
 */
export function cleanString(str: string): string {
  return str
    .trim()
    .replace(/[^a-z0-9_ ]/gi, '') // allow underscores
    .toLowerCase()
    .replace(/ +/g, '_')
}

// export function safeStringify(value: any, visited = new WeakSet()): string {
//   // Handle primitive types
//   if (value === null) return 'null'
//   if (value === undefined) return 'undefined'
//   if (typeof value === 'bigint') return value.toString() + 'n'
//   if (typeof value === 'function') return '[Function]'
//   if (typeof value === 'symbol') return value.toString()
//   if (typeof value === 'string') return JSON.stringify(value)
//   if (typeof value === 'number' || typeof value === 'boolean') return String(value)

//   // Handle special object types
//   if (value instanceof Date) return `"${value.toISOString()}"`
//   if (value instanceof RegExp) return `"${value.toString()}"`
//   if (value instanceof Error) return `"[Error: ${value.message}]"`

//   // Handle objects and arrays with circular reference protection
//   if (typeof value === 'object') {
//     // Check for circular references
//     if (visited.has(value)) {
//       return '"[Circular]"'
//     }
//     visited.add(value)

//     try {
//       if (Array.isArray(value)) {
//         const items = value.map(item => safeStringify(item, visited))
//         visited.delete(value)
//         return `[${items.join(',')}]`
//       } else {
//         const entries = Object.entries(value).map(([key, val]) => `"${key}":${safeStringify(val, visited)}`)
//         visited.delete(value)
//         return `{${entries.join(',')}}`
//       }
//     } catch (error) {
//       visited.delete(value)
//       return '"[Object]"'
//     }
//   }

//   return String(value)
// }
