import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskPriority1795070000000 implements MigrationInterface {
  name = 'AddTaskPriority1795070000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks ADD COLUMN priority text`);

    await queryRunner.query(`UPDATE tasks SET priority = 'medium' WHERE priority IS NULL`);

    await queryRunner.query(`ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'medium'`);
    await queryRunner.query(`ALTER TABLE tasks ALTER COLUMN priority SET NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE tasks
        ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'medium', 'high'))
    `);

    await queryRunner.query(`CREATE INDEX tasks_organization_id_priority_idx ON tasks (organization_id, priority)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS tasks_organization_id_priority_idx`);
    await queryRunner.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check`);
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS priority`);
  }
}
