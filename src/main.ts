import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { join } from 'node:path';
import { AppModule } from './app.module';

loadEnv();

export function buildSessionMiddleware() {
  const PgSession = connectPgSimple(session);
  const connectionString = process.env.DATABASE_URL as string;
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  return session({
    store: new PgSession({
      conObject: {
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      },
      tableName: 'user_sessions',
    }),
    name: 'tracker.sid',
    secret: process.env.SESSION_SECRET as string,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });
}

export function configureApp(app: NestExpressApplication): void {
  app.set('trust proxy', 1);
  app.use(buildSessionMiddleware());
  app.setBaseViewsDir(join(__dirname, 'views'));
  app.setViewEngine('hbs');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
}

async function bootstrap(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

if (require.main === module) {
  void bootstrap();
}
