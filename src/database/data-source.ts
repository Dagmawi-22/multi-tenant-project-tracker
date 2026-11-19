import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Invitation, Membership, Organization, Project, Task, User } from '../entities';

loadEnv();

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error('DIRECT_DATABASE_URL or DATABASE_URL must be set');
}

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url,
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
  entities: [User, Organization, Membership, Project, Task, Invitation],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'schema_migrations',
  synchronize: false,
  logging: ['error', 'warn'],
};

export default new DataSource(dataSourceOptions);
