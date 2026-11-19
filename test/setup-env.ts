import { config as loadEnv } from 'dotenv';

loadEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set: the test suite truncates every table');
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session-secret';
process.env.NODE_ENV = 'test';
