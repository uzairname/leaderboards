import { UserErrors } from './UserError'

export function validate(condition: boolean, message?: string): asserts condition {
  if (!condition) {
    throw new UserErrors.ValidationError(message)
  }
}
