import { HttpException, HttpStatus } from '@nestjs/common';

export function httpExceptionMessage(exception: unknown, fallbackStatus = HttpStatus.INTERNAL_SERVER_ERROR): string {
  if (exception instanceof HttpException) {
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return payload;
    }

    const message = (payload as { message?: string | string[] }).message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (typeof message === 'string') {
      return message;
    }
  }

  return fallbackStatus === HttpStatus.NOT_FOUND ? 'Not found.' : 'Something went wrong.';
}
