import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvitations1795050000000 implements MigrationInterface {
  name = 'AddInvitations1795050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
        email text NOT NULL,
        role text NOT NULL,
        token_hash text NOT NULL,
        invited_by_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT invitations_role_check CHECK (role IN ('admin', 'member')),
        CONSTRAINT invitations_token_hash_key UNIQUE (token_hash)
      )
    `);

    await queryRunner.query(`CREATE INDEX invitations_organization_id_idx ON invitations (organization_id)`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX invitations_pending_email_key
        ON invitations (organization_id, lower(email))
        WHERE accepted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS invitations`);
  }
}
