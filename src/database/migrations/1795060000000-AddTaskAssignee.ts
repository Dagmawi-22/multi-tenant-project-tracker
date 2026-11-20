import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskAssignee1795060000000 implements MigrationInterface {
  name = 'AddTaskAssignee1795060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tasks
        ADD COLUMN assignee_user_id uuid REFERENCES users (id) ON DELETE SET NULL
    `);

    await queryRunner.query(`CREATE INDEX tasks_assignee_user_id_idx ON tasks (assignee_user_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS tasks_assignee_user_id_idx`);
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS assignee_user_id`);
  }
}
