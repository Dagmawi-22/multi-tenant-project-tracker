import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentOrg, OrgContext } from '../common/decorators/org-context.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { OrgAdminGuard } from '../common/guards/org-admin.guard';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { SaveProjectDto } from './dto/save-project.dto';
import { ProjectsService } from './projects.service';

@Controller('api/orgs/:orgId/projects')
@UseGuards(AuthenticatedGuard, OrgMemberGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(@CurrentOrg() org: OrgContext) {
    return this.projectsService.listWithSpend(org.organizationId);
  }

  @Get(':projectId')
  async detail(@CurrentOrg() org: OrgContext, @Param('projectId') projectId: string) {
    const project = await this.projectsService.findOne(org.organizationId, projectId);
    const spentEtb = await this.projectsService.spendFor(org.organizationId, projectId);

    return { ...project, spentEtb };
  }

  @Post()
  @UseGuards(OrgAdminGuard)
  create(@CurrentOrg() org: OrgContext, @Body() dto: SaveProjectDto) {
    return this.projectsService.create(org.organizationId, dto);
  }

  @Put(':projectId')
  @UseGuards(OrgAdminGuard)
  update(@CurrentOrg() org: OrgContext, @Param('projectId') projectId: string, @Body() dto: SaveProjectDto) {
    return this.projectsService.update(org.organizationId, projectId, dto);
  }

  @Delete(':projectId')
  @UseGuards(OrgAdminGuard)
  @HttpCode(204)
  async remove(@CurrentOrg() org: OrgContext, @Param('projectId') projectId: string) {
    await this.projectsService.remove(org.organizationId, projectId);
  }
}
