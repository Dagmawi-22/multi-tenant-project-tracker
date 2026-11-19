import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { Membership } from '../../entities';

@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.session?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const organizationId = String(request.params.orgId ?? '');

    if (!isUUID(organizationId)) {
      throw new NotFoundException('Organization not found');
    }

    const membership = await this.memberships.findOne({
      where: { userId, organizationId },
    });

    if (!membership) {
      throw new NotFoundException('Organization not found');
    }

    request.orgContext = { organizationId, role: membership.role };

    return true;
  }
}
