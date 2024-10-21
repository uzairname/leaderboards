import { UserErrors } from './user-facing-errors'

export function validate(condition: boolean, message?: string): asserts condition {
  if (!condition) {
    throw new UserErrors.ValidationError(message)
  }
}
