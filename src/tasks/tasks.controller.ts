import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentOrg, OrgContext } from '../common/decorators/org-context.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { TaskStatus } from '../entities';
import { SaveTaskDto } from './dto/save-task.dto';
import { TasksService } from './tasks.service';

@Controller('api/orgs/:orgId/projects/:projectId/tasks')
@UseGuards(AuthenticatedGuard, OrgMemberGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(
    @CurrentOrg() org: OrgContext,
    @Param('projectId') projectId: string,
    @Query('status') status?: TaskStatus,
  ) {
    return this.tasksService.listForProject(org.organizationId, projectId, { status });
  }

  @Post()
  create(@CurrentOrg() org: OrgContext, @Param('projectId') projectId: string, @Body() dto: SaveTaskDto) {
    return this.tasksService.create(org.organizationId, projectId, dto);
  }

  @Patch(':taskId')
  update(@CurrentOrg() org: OrgContext, @Param('taskId') taskId: string, @Body() dto: SaveTaskDto) {
    return this.tasksService.update(org.organizationId, taskId, dto);
  }

  @Delete(':taskId')
  @HttpCode(204)
  async remove(@CurrentOrg() org: OrgContext, @Param('taskId') taskId: string) {
    await this.tasksService.remove(org.organizationId, taskId);
  }
}
