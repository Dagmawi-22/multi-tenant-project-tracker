import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../common/decorators/current-user.decorator';
import { CurrentOrg, OrgContext } from '../common/decorators/org-context.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { OrgAdminGuard } from '../common/guards/org-admin.guard';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrgsService } from './orgs.service';

@Controller('api/orgs')
@UseGuards(AuthenticatedGuard)
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  @Get()
  async list(@CurrentUserId() userId: string) {
    const memberships = await this.orgsService.listForUser(userId);

    return memberships.map(({ organization, role }) => ({
      id: organization.id,
      name: organization.name,
      role,
    }));
  }

  @Post()
  async create(@CurrentUserId() userId: string, @Body() dto: CreateOrganizationDto) {
    const organization = await this.orgsService.createForUser(userId, dto.name);

    return { id: organization.id, name: organization.name, role: 'admin' };
  }

  @Get(':orgId')
  async detail(@CurrentOrg() org: OrgContext) {
    const organization = await this.orgsService.findById(org.organizationId);

    return { id: organization.id, name: organization.name, role: org.role };
  }

  @Get(':orgId/members')
  async members(@CurrentOrg() org: OrgContext) {
    const memberships = await this.orgsService.listMembers(org.organizationId);

    return memberships.map((membership) => ({
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
    }));
  }

  @Post(':orgId/members')
  @UseGuards(OrgAdminGuard)
  async addMember(@CurrentOrg() org: OrgContext, @Body() dto: AddMemberDto) {
    const membership = await this.orgsService.addMember(org.organizationId, dto.email, dto.role);

    return { userId: membership.userId, role: membership.role };
  }

  @Delete(':orgId/members/:userId')
  @UseGuards(OrgAdminGuard)
  @HttpCode(204)
  async removeMember(@CurrentOrg() org: OrgContext, @Param('userId') userId: string) {
    await this.orgsService.removeMember(org.organizationId, userId);
  }
}
