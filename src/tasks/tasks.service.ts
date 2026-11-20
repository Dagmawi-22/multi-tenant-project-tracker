import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { Membership, Task, TaskStatus } from '../entities';
import { ProjectsService } from '../projects/projects.service';
import { SaveTaskDto } from './dto/save-task.dto';

export interface TaskFilter {
  status?: TaskStatus;
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasks: Repository<Task>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    private readonly projectsService: ProjectsService,
  ) {}

  async listForProject(organizationId: string, projectId: string, filter: TaskFilter = {}): Promise<Task[]> {
    await this.projectsService.findOne(organizationId, projectId);

    const query = this.tasks
      .createQueryBuilder('task')
      .where('task.project_id = :projectId', { projectId })
      .andWhere('task.organization_id = :organizationId', { organizationId });

    if (filter.status) {
      query.andWhere('task.status = :status', { status: filter.status });
    }

    return query.orderBy('task.created_at', 'ASC').addOrderBy('task.id', 'ASC').getMany();
  }

  async findOne(organizationId: string, taskId: string): Promise<Task> {
    if (!isUUID(taskId)) {
      throw new NotFoundException('Task not found');
    }

    const task = await this.tasks.findOne({ where: { id: taskId, organizationId } });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async create(organizationId: string, projectId: string, dto: SaveTaskDto): Promise<Task> {
    await this.projectsService.findOne(organizationId, projectId);

    const task = this.tasks.create({
      organizationId,
      projectId,
      title: dto.title,
      status: dto.status ?? 'todo',
      estimatedCostEtb: dto.estimatedCostEtb,
      assigneeUserId: await this.resolveAssignee(organizationId, dto.assigneeUserId),
    });

    return this.tasks.save(task);
  }

  async update(organizationId: string, taskId: string, dto: SaveTaskDto): Promise<Task> {
    const task = await this.findOne(organizationId, taskId);

    task.title = dto.title;
    task.status = dto.status ?? task.status;
    task.estimatedCostEtb = dto.estimatedCostEtb;

    if (dto.assigneeUserId !== undefined) {
      task.assigneeUserId = await this.resolveAssignee(organizationId, dto.assigneeUserId);
    }

    return this.tasks.save(task);
  }

  private async resolveAssignee(
    organizationId: string,
    assigneeUserId: string | null | undefined,
  ): Promise<string | null> {
    if (assigneeUserId === undefined || assigneeUserId === null || assigneeUserId === '') {
      return null;
    }

    if (!isUUID(assigneeUserId)) {
      throw new BadRequestException('Assignee must be a member of this organization');
    }

    const membership = await this.memberships.findOne({
      where: { userId: assigneeUserId, organizationId },
    });

    if (!membership) {
      throw new BadRequestException('Assignee must be a member of this organization');
    }

    return assigneeUserId;
  }

  async remove(organizationId: string, taskId: string): Promise<void> {
    const result = await this.tasks.delete({ id: taskId, organizationId });

    if (!result.affected) {
      throw new NotFoundException('Task not found');
    }
  }
}
