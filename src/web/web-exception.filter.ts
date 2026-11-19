import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { httpExceptionMessage } from '../common/http-message';

@Catch()
export class WebExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WebExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status === HttpStatus.UNAUTHORIZED) {
      response.redirect('/login');
      return;
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception);
    }

    response.status(status).render('error', {
      title: `Error ${status}`,
      status,
      message: httpExceptionMessage(exception, status),
    });
  }
}
