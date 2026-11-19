import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userName?: string;
    flash?: { type: 'success' | 'error'; message: string };
  }
}

declare global {
  namespace Express {
    interface Request {
      orgContext?: {
        organizationId: string;
        role: 'admin' | 'member';
      };
    }
  }
}
