import { Request } from 'express';
import { User } from '../entities';

export function establishSession(request: Request, user: User): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((regenerateError) => {
      if (regenerateError) {
        reject(regenerateError);
        return;
      }

      request.session.userId = user.id;
      request.session.userName = user.name;

      request.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });
}

export function destroySession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}
