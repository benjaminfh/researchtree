// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export type ErrorDetails = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ErrorDetails;

  constructor(status: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: ErrorDetails): ApiError {
  return new ApiError(400, 'BAD_REQUEST', message, details);
}

export function unauthorized(message = 'Unauthorized', details?: ErrorDetails): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message, details);
}

export function forbidden(message = 'Forbidden', details?: ErrorDetails): ApiError {
  return new ApiError(403, 'FORBIDDEN', message, details);
}

export function notFound(message: string): ApiError {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function internalError(message = 'Internal Server Error', details?: ErrorDetails): ApiError {
  return new ApiError(500, 'INTERNAL_ERROR', message, details);
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null
        }
      },
      { status: error.status }
    );
  }

  console.error('[API] Unhandled error', error);
  return Response.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error'
      }
    },
    { status: 500 }
  );
}
