'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.nonNullable = nonNullable
exports.assert = assert
exports.getEnumValue = getEnumValue
exports.cloneSimpleObj = cloneSimpleObj
exports.unflatten = unflatten
exports.maxIndex = maxIndex
exports.snowflakeToDate = snowflakeToDate
exports.isInt = isInt
function nonNullable(value, value_name) {
  if (value === null || value === undefined)
    throw new Error(''.concat(value_name || 'value', ' is null or undefined'))
  return value
}
function assert(condition, message) {
  if (!condition)
    throw new Error(message !== null && message !== void 0 ? message : 'Assertion failed')
}
function getEnumValue(enum_, value) {
  var keys = Object.keys(enum_)
  for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
    var key = keys_1[_i]
    if (enum_[key] === value) return enum_[key]
  }
  return null
}
function cloneSimpleObj(obj) {
  return JSON.parse(JSON.stringify(obj))
}
/**
 * Unflattens a one-dimensional array into a two-dimensional array.
 *
 * @template T - The type of elements in the array.
 * @param arr - The one-dimensional array to unflatten.
 * @param dim_2_size - The size of the inner arrays (second dimension).
 * @param full_rows - If true, ensures all inner arrays are of equal length.
 *                    If false, the last inner array may be shorter.
 * @returns {T[][]} A two-dimensional array.
 */
function unflatten(arr, dim_2_size, full_rows) {
  if (full_rows === void 0) {
    full_rows = true
  }
  return Array.from(
    { length: full_rows ? arr.length / dim_2_size : Math.ceil(arr.length / dim_2_size) },
    function (_, i) {
      return arr.slice(i * dim_2_size, (i + 1) * dim_2_size)
    },
  )
}
/**
 * @returns The index of the maximum value in the array.
 * If there are multiple maximum values or the array is empty, returns -1.
 */
function maxIndex(arr) {
  var max = -Infinity
  var max_index = -1
  var max_repeated = false
  for (var i = 0; i < arr.length; i++) {
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
function snowflakeToDate(snowflake) {
  var DISCORD_EPOCH = 1420070400000
  var dateBits = Number(BigInt.asUintN(64, snowflake) >> 22n)
  return new Date(dateBits + DISCORD_EPOCH)
}
function isInt(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value
}
