// Result pattern for consistent error handling across the application

export type Result<T, E = Error> = {
  success: true
  data: T
} | {
  success: false
  error: E
}

// Create successful result
export function success<T>(data: T): Result<T> {
  return { success: true, data }
}

// Create error result
export function failure<E = Error>(error: E): Result<never, E> {
  return { success: false, error }
}

// Safe async wrapper that catches errors and returns Result
export async function safeAsync<T>(
  operation: () => Promise<T>
): Promise<Result<T, Error>> {
  try {
    const data = await operation()
    return success(data)
  } catch (error) {
    return failure(error instanceof Error ? error : new Error('Unknown error'))
  }
}

// Safe sync wrapper that catches errors and returns Result
export function safe<T>(
  operation: () => T
): Result<T, Error> {
  try {
    const data = operation()
    return success(data)
  } catch (error) {
    return failure(error instanceof Error ? error : new Error('Unknown error'))
  }
}

// Transform result data while preserving error state
export function map<T, U, E>(
  result: Result<T, E>,
  transform: (data: T) => U
): Result<U, E> {
  if (result.success) {
    return success(transform(result.data))
  }
  return result
}

// Transform result data with async operation
export async function mapAsync<T, U, E>(
  result: Result<T, E>,
  transform: (data: T) => Promise<U>
): Promise<Result<U, E>> {
  if (result.success) {
    try {
      const transformed = await transform(result.data)
      return success(transformed)
    } catch (error) {
      return failure(error instanceof Error ? error : new Error('Transform failed')) as Result<never, E>
    }
  }
  return result
}

// Chain operations that return Results
export function flatMap<T, U, E>(
  result: Result<T, E>,
  operation: (data: T) => Result<U, E>
): Result<U, E> {
  if (result.success) {
    return operation(result.data)
  }
  return result
}

// Chain async operations that return Results
export async function flatMapAsync<T, U, E>(
  result: Result<T, E>,
  operation: (data: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  if (result.success) {
    return await operation(result.data)
  }
  return result
}

// Match pattern for handling both success and error cases
export function match<T, U, E>(
  result: Result<T, E>,
  handlers: {
    success: (data: T) => U
    error: (error: E) => U
  }
): U {
  if (result.success) {
    return handlers.success(result.data)
  }
  return handlers.error(result.error)
}

// Combine multiple results into a single result
export function combine<T extends readonly unknown[], E>(
  ...results: { [K in keyof T]: Result<T[K], E> }
): Result<T, E> {
  const data: unknown[] = []
  
  for (const result of results) {
    if (!result.success) {
      return result
    }
    data.push(result.data)
  }
  
  return success(data as T)
}

// Validation helper using Result pattern
export interface ValidationRule<T> {
  validate: (value: T) => boolean
  message: string
}

export function validate<T>(
  value: T,
  rules: ValidationRule<T>[]
): Result<T, string[]> {
  const errors: string[] = []
  
  for (const rule of rules) {
    if (!rule.validate(value)) {
      errors.push(rule.message)
    }
  }
  
  if (errors.length > 0) {
    return failure(errors)
  }
  
  return success(value)
}

// Common validation rules
export const validationRules = {
  required: <T>(message: string = 'This field is required'): ValidationRule<T | null | undefined> => ({
    validate: (value) => value != null && value !== '',
    message
  }),
  
  minLength: (min: number, message?: string): ValidationRule<string> => ({
    validate: (value) => value.length >= min,
    message: message || `Must be at least ${min} characters`
  }),
  
  maxLength: (max: number, message?: string): ValidationRule<string> => ({
    validate: (value) => value.length <= max,
    message: message || `Must be no more than ${max} characters`
  }),
  
  email: (message: string = 'Must be a valid email address'): ValidationRule<string> => ({
    validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message
  }),
  
  positive: (message: string = 'Must be a positive number'): ValidationRule<number> => ({
    validate: (value) => value > 0,
    message
  }),
  
  range: (min: number, max: number, message?: string): ValidationRule<number> => ({
    validate: (value) => value >= min && value <= max,
    message: message || `Must be between ${min} and ${max}`
  })
}

// Async validation
export async function validateAsync<T>(
  value: T,
  rules: Array<{
    validate: (value: T) => Promise<boolean>
    message: string
  }>
): Promise<Result<T, string[]>> {
  const errors: string[] = []
  
  for (const rule of rules) {
    try {
      const isValid = await rule.validate(value)
      if (!isValid) {
        errors.push(rule.message)
      }
    } catch {
      errors.push('Validation error occurred')
    }
  }
  
  if (errors.length > 0) {
    return failure(errors)
  }
  
  return success(value)
}