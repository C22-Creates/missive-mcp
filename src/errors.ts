/**
 * Typed error classes for Missive API responses
 */

export class MissiveAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'MissiveAPIError';
  }
}

export class AuthError extends MissiveAPIError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

export class RateLimitError extends MissiveAPIError {
  constructor(
    message = 'Rate limit exceeded',
    public readonly retryAfter?: number
  ) {
    super(message, 429, 'RATE_LIMITED');
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends MissiveAPIError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
