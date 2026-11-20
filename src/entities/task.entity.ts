import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from './project.entity';

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

@Entity('tasks')
@Index(['projectId'])
@Index(['organizationId'])
@Index(['assigneeUserId'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', default: 'todo' })
  status!: TaskStatus;

  @Column({ type: 'text', default: 'medium' })
  priority!: TaskPriority;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'estimated_cost_etb', default: 0 })
  estimatedCostEtb!: string;

  @Column({ type: 'uuid', name: 'assignee_user_id', nullable: true })
  assigneeUserId!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Project, (project) => project.tasks, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'project_id', referencedColumnName: 'id' },
    { name: 'organization_id', referencedColumnName: 'organizationId' },
  ])
  project!: Project;
}
