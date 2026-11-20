import { Request, Response } from 'express';

export type FlashType = 'success' | 'error';

export interface Flash {
  type: FlashType;
  message: string;
}

export function setFlash(request: Request, type: FlashType, message: string): void {
  request.session.flash = { type, message };
}

export function popFlash(request: Request): Flash | undefined {
  const flash = request.session.flash;

  if (flash) {
    delete request.session.flash;
  }

  return flash;
}

export function redirectWith(request: Request, response: Response, url: string): void {
  request.session.save(() => response.redirect(url));
}
