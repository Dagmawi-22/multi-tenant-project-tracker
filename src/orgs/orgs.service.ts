import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Membership, MembershipRole, Organization, User } from '../entities';

@Injectable()
export class OrgsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async listForUser(userId: string): Promise<Array<{ organization: Organization; role: MembershipRole }>> {
    const memberships = await this.memberships.find({
      where: { userId },
      relations: { organization: true },
      order: { createdAt: 'ASC' },
    });

    return memberships.map((membership) => ({
      organization: membership.organization,
      role: membership.role,
    }));
  }

  async createForUser(userId: string, name: string): Promise<Organization> {
    return this.dataSource.transaction(async (manager) => {
      const organization = await manager.save(manager.create(Organization, { name }));

      await manager.save(
        manager.create(Membership, {
          userId,
          organizationId: organization.id,
          role: 'admin',
        }),
      );

      return organization;
    });
  }

  async findById(organizationId: string): Promise<Organization> {
    const organization = await this.organizations.findOne({ where: { id: organizationId } });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async listMembers(organizationId: string): Promise<Membership[]> {
    return this.memberships.find({
      where: { organizationId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  async addMember(organizationId: string, email: string, role: MembershipRole): Promise<Membership> {
    const user = await this.users
      .createQueryBuilder('user')
      .where('lower(user.email) = lower(:email)', { email })
      .getOne();

    if (!user) {
      throw new BadRequestException('No registered user with that email address');
    }

    const existing = await this.memberships.findOne({
      where: { userId: user.id, organizationId },
    });

    if (existing) {
      throw new ConflictException('That user is already a member of this organization');
    }

    return this.memberships.save(this.memberships.create({ userId: user.id, organizationId, role }));
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    const membership = await this.memberships.findOne({ where: { organizationId, userId } });

    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    if (membership.role === 'admin') {
      const adminCount = await this.memberships.count({ where: { organizationId, role: 'admin' } });

      if (adminCount <= 1) {
        throw new BadRequestException('An organization must keep at least one admin');
      }
    }

    await this.memberships.delete({ organizationId, userId });
  }
}
