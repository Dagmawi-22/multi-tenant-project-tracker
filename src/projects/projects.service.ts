import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { Project } from '../entities';
import { SaveProjectDto } from './dto/save-project.dto';

export interface ProjectWithSpend {
  id: string;
  name: string;
  description: string;
  budgetEtb: string;
  spentEtb: string;
  taskCount: number;
  createdAt: Date;
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
  ) {}

  async listWithSpend(organizationId: string): Promise<ProjectWithSpend[]> {
    const rows = await this.projects
      .createQueryBuilder('project')
      .leftJoin(
        'tasks',
        'task',
        'task.project_id = project.id AND task.organization_id = project.organization_id',
      )
      .select('project.id', 'id')
      .addSelect('project.name', 'name')
      .addSelect('project.description', 'description')
      .addSelect('project.budget_etb', 'budgetEtb')
      .addSelect('project.created_at', 'createdAt')
      .addSelect('COALESCE(SUM(task.estimated_cost_etb), 0)', 'spentEtb')
      .addSelect('COUNT(task.id)', 'taskCount')
      .where('project.organization_id = :organizationId', { organizationId })
      .groupBy('project.id')
      .orderBy('project.created_at', 'ASC')
      .getRawMany();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      budgetEtb: row.budgetEtb,
      spentEtb: row.spentEtb,
      taskCount: Number(row.taskCount),
      createdAt: row.createdAt,
    }));
  }

  async findOne(organizationId: string, projectId: string): Promise<Project> {
    if (!isUUID(projectId)) {
      throw new NotFoundException('Project not found');
    }

    const project = await this.projects.findOne({
      where: { id: projectId, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async spendFor(organizationId: string, projectId: string): Promise<string> {
    const row = await this.projects
      .createQueryBuilder('project')
      .leftJoin(
        'tasks',
        'task',
        'task.project_id = project.id AND task.organization_id = project.organization_id',
      )
      .select('COALESCE(SUM(task.estimated_cost_etb), 0)', 'spentEtb')
      .where('project.id = :projectId', { projectId })
      .andWhere('project.organization_id = :organizationId', { organizationId })
      .getRawOne();

    return row?.spentEtb ?? '0';
  }

  async create(organizationId: string, dto: SaveProjectDto): Promise<Project> {
    const project = this.projects.create({
      organizationId,
      name: dto.name,
      description: dto.description ?? '',
      budgetEtb: dto.budgetEtb,
    });

    return this.projects.save(project);
  }

  async update(organizationId: string, projectId: string, dto: SaveProjectDto): Promise<Project> {
    const project = await this.findOne(organizationId, projectId);

    project.name = dto.name;
    project.description = dto.description ?? '';
    project.budgetEtb = dto.budgetEtb;

    return this.projects.save(project);
  }

  async updateBudget(organizationId: string, projectId: string, budgetEtb: string): Promise<Project> {
    const project = await this.findOne(organizationId, projectId);

    project.budgetEtb = budgetEtb;

    return this.projects.save(project);
  }

  async remove(organizationId: string, projectId: string): Promise<void> {
    const result = await this.projects.delete({ id: projectId, organizationId });

    if (!result.affected) {
      throw new NotFoundException('Project not found');
    }
  }
}
