import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OrgMemberGuard } from '../src/common/guards/org-member.guard';
import { Membership } from '../src/entities';

const ORG_ID = '2c93986e-c452-4e12-87c3-e890c3d75fea';
const USER_ID = '416ab446-8a5f-4a0e-9d1e-2b1f0c3d4e5a';
const MISSING_ORG_ID = '00000000-0000-4000-8000-000000000000';

type FakeRequest = {
  params: Record<string, string>;
  session?: { userId?: string };
  orgContext?: { organizationId: string; role: string };
};

function contextFor(request: FakeRequest) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function guardReturning(membership: Partial<Membership> | null) {
  const findOne = jest.fn().mockResolvedValue(membership);
  const guard = new OrgMemberGuard({ findOne } as unknown as Repository<Membership>);

  return { guard, findOne };
}

describe('OrgMemberGuard', () => {
  it('ignores routes that carry no organization id', async () => {
    const { guard, findOne } = guardReturning(null);
    const request: FakeRequest = { params: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('protects a tenant route even though no controller declares it', async () => {
    const { guard } = guardReturning(null);
    const request: FakeRequest = { params: { orgId: ORG_ID }, session: { userId: USER_ID } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an anonymous request to a tenant route', async () => {
    const { guard, findOne } = guardReturning({ role: 'member' });
    const request: FakeRequest = { params: { orgId: ORG_ID } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('gives a non-member the same answer as a missing organization', async () => {
    const { guard } = guardReturning(null);
    const nonMember: FakeRequest = { params: { orgId: ORG_ID }, session: { userId: USER_ID } };
    const missing: FakeRequest = { params: { orgId: MISSING_ORG_ID }, session: { userId: USER_ID } };

    const first = await guard.canActivate(contextFor(nonMember)).catch((error: Error) => error);
    const second = await guard.canActivate(contextFor(missing)).catch((error: Error) => error);

    expect((first as NotFoundException).getStatus()).toBe(404);
    expect((second as NotFoundException).getStatus()).toBe(404);
    expect((first as Error).message).toBe((second as Error).message);
  });

  it('rejects a malformed organization id without querying', async () => {
    const { guard, findOne } = guardReturning({ role: 'admin' });
    const request: FakeRequest = { params: { orgId: 'not-a-uuid' }, session: { userId: USER_ID } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(NotFoundException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('attaches the proven organization context for downstream guards', async () => {
    const { guard, findOne } = guardReturning({ role: 'admin' });
    const request: FakeRequest = { params: { orgId: ORG_ID }, session: { userId: USER_ID } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(findOne).toHaveBeenCalledWith({ where: { userId: USER_ID, organizationId: ORG_ID } });
    expect(request.orgContext).toEqual({ organizationId: ORG_ID, role: 'admin' });
  });
});
