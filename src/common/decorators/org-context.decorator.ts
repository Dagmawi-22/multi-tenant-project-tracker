import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { MembershipRole } from '../../entities';

export interface OrgContext {
  organizationId: string;
  role: MembershipRole;
}

export const CurrentOrg = createParamDecorator((_data: unknown, context: ExecutionContext): OrgContext => {
  const request = context.switchToHttp().getRequest<Request>();
  return request.orgContext as OrgContext;
});
