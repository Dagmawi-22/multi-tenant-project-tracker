import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1795046400000 implements MigrationInterface {
  name = 'InitialSchema1795046400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        name text NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email))`);

    await queryRunner.query(`
      CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE memberships (
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
        role text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT memberships_pkey PRIMARY KEY (user_id, organization_id),
        CONSTRAINT memberships_role_check CHECK (role IN ('admin', 'member'))
      )
    `);
    await queryRunner.query(`CREATE INDEX memberships_organization_id_idx ON memberships (organization_id)`);

    await queryRunner.query(`
      CREATE TABLE projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        budget_etb numeric(14,2) NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT projects_id_organization_id_key UNIQUE (id, organization_id),
        CONSTRAINT projects_budget_etb_check CHECK (budget_etb >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX projects_organization_id_idx ON projects (organization_id)`);

    await queryRunner.query(`
      CREATE TABLE tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL,
        organization_id uuid NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'todo',
        estimated_cost_etb numeric(14,2) NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tasks_project_organization_fkey
          FOREIGN KEY (project_id, organization_id)
          REFERENCES projects (id, organization_id) ON DELETE CASCADE,
        CONSTRAINT tasks_status_check CHECK (status IN ('todo', 'in_progress', 'done')),
        CONSTRAINT tasks_estimated_cost_etb_check CHECK (estimated_cost_etb >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX tasks_project_id_idx ON tasks (project_id)`);
    await queryRunner.query(`CREATE INDEX tasks_organization_id_idx ON tasks (organization_id)`);

    await queryRunner.query(`
      CREATE TABLE user_sessions (
        sid varchar NOT NULL PRIMARY KEY,
        sess json NOT NULL,
        expire timestamp(6) NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX user_sessions_expire_idx ON user_sessions (expire)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS tasks`);
    await queryRunner.query(`DROP TABLE IF EXISTS projects`);
    await queryRunner.query(`DROP TABLE IF EXISTS memberships`);
    await queryRunner.query(`DROP TABLE IF EXISTS organizations`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
