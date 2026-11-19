import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { hashPassword } from '../auth/password';
import { Invitation, Membership, MembershipRole, Organization, User } from '../entities';
import { MailService } from '../mail/mail.service';

const INVITATION_LIFETIME_DAYS = 7;

export type InviteOutcome = 'added' | 'emailed' | 'created_without_email';

export interface InviteResult {
  outcome: InviteOutcome;
  acceptUrl?: string;
}

export interface AcceptDetails {
  name?: string;
  password?: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Invitation)
    private readonly invitations: Repository<Invitation>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    private readonly mailService: MailService,
  ) {}

  async invite(
    organizationId: string,
    invitedByUserId: string,
    email: string,
    role: MembershipRole,
    baseUrl: string,
  ): Promise<InviteResult> {
    const existingUser = await this.findUserByEmail(email);

    if (existingUser) {
      const alreadyMember = await this.memberships.findOne({
        where: { userId: existingUser.id, organizationId },
      });

      if (alreadyMember) {
        throw new ConflictException('That user is already a member of this organization');
      }

      await this.memberships.save(
        this.memberships.create({ userId: existingUser.id, organizationId, role }),
      );

      return { outcome: 'added' };
    }

    const [organization, inviter] = await Promise.all([
      this.organizations.findOne({ where: { id: organizationId } }),
      this.users.findOne({ where: { id: invitedByUserId } }),
    ]);

    if (!organization || !inviter) {
      throw new NotFoundException('Organization not found');
    }

    await this.invitations.delete({ organizationId, email, acceptedAt: IsNull() });

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

    await this.invitations.save(
      this.invitations.create({
        organizationId,
        email,
        role,
        tokenHash: hashToken(token),
        invitedByUserId,
        expiresAt,
      }),
    );

    const acceptUrl = `${baseUrl}/invitations/accept?token=${token}`;

    const sent = await this.mailService.sendInvitation({
      organizationName: organization.name,
      inviterName: inviter.name,
      role,
      acceptUrl,
      expiresAt,
      recipientEmail: email,
    });

    return sent ? { outcome: 'emailed' } : { outcome: 'created_without_email', acceptUrl };
  }

  async findValidByToken(token: string): Promise<Invitation> {
    const invitation = await this.invitations.findOne({
      where: {
        tokenHash: hashToken(token),
        acceptedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: { organization: true, invitedBy: true },
    });

    if (!invitation) {
      throw new NotFoundException('This invitation link is invalid, already used, or expired');
    }

    return invitation;
  }

  async accept(token: string, details: AcceptDetails): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const invitation = await manager.findOne(Invitation, {
        where: {
          tokenHash: hashToken(token),
          acceptedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!invitation) {
        throw new NotFoundException('This invitation link is invalid, already used, or expired');
      }

      let user = await manager
        .createQueryBuilder(User, 'user')
        .where('lower(user.email) = lower(:email)', { email: invitation.email })
        .getOne();

      if (!user) {
        const name = (details.name ?? '').trim();
        const password = details.password ?? '';

        if (name.length < 2) {
          throw new BadRequestException('Name must be at least 2 characters');
        }

        if (password.length < 8) {
          throw new BadRequestException('Password must be at least 8 characters');
        }

        user = await manager.save(
          manager.create(User, {
            name,
            email: invitation.email,
            passwordHash: await hashPassword(password),
          }),
        );
      }

      const existingMembership = await manager.findOne(Membership, {
        where: { userId: user.id, organizationId: invitation.organizationId },
      });

      if (!existingMembership) {
        await manager.save(
          manager.create(Membership, {
            userId: user.id,
            organizationId: invitation.organizationId,
            role: invitation.role,
          }),
        );
      }

      invitation.acceptedAt = new Date();
      await manager.save(invitation);

      return user;
    });
  }

  listPending(organizationId: string): Promise<Invitation[]> {
    return this.invitations.find({
      where: { organizationId, acceptedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  async revoke(organizationId: string, invitationId: string): Promise<void> {
    const result = await this.invitations.delete({ id: invitationId, organizationId });

    if (!result.affected) {
      throw new NotFoundException('Invitation not found');
    }
  }

  private findUserByEmail(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .where('lower(user.email) = lower(:email)', { email })
      .getOne();
  }
}
