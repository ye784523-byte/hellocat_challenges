export class AppError extends Error {
  constructor(message, { userMessage = message, code = 'APP_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.userMessage = userMessage;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, { userMessage: message, code: 'VALIDATION_ERROR', ...options });
    this.name = 'ValidationError';
  }
}

export class PermissionError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, { userMessage: message, code: 'PERMISSION_ERROR' });
    this.name = 'PermissionError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.') {
    super(message, { userMessage: message, code: 'NOT_FOUND' });
    this.name = 'NotFoundError';
  }
}

export function toUserMessage(error) {
  if (error instanceof AppError) return error.userMessage;
  return 'An unexpected internal error occurred. The incident has been logged.';
}
