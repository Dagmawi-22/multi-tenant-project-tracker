import 'reflect-metadata';
import { DataSource, EntityManager } from 'typeorm';
import { hashPassword } from '../auth/password';
import { Membership, MembershipRole, Organization, Project, Task, User } from '../entities';
import dataSource from './data-source';

const DEV_PASSWORD = 'Password123!';
const PROJECT_NAME = 'Bole Office Fit-out';

type SeedAccount = { name: string; email: string; password: string };
type SeedConfig = { admin: SeedAccount; member: SeedAccount; organizationName: string };

function text(name: string, fallback: string): string {
  const value = process.env[name]?.trim();

  return value ? value : fallback;
}

function secret(name: string): string {
  const value = (process.env[name] ?? process.env.SEED_PASSWORD)?.trim();

  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Set ${name} (or SEED_PASSWORD) before seeding outside development`);
  }

  console.warn(`${name} is not set; using the development password "${DEV_PASSWORD}"`);

  return DEV_PASSWORD;
}

function resolveConfig(): SeedConfig {
  return {
    admin: {
      name: text('SEED_ADMIN_NAME', 'Hanna Bekele'),
      email: text('SEED_ADMIN_EMAIL', 'hanna@addisbuild.et'),
      password: secret('SEED_ADMIN_PASSWORD'),
    },
    member: {
      name: text('SEED_MEMBER_NAME', 'Yonas Girma'),
      email: text('SEED_MEMBER_EMAIL', 'yonas@addisbuild.et'),
      password: secret('SEED_MEMBER_PASSWORD'),
    },
    organizationName: text('SEED_ORG_NAME', 'Addis Build Collective'),
  };
}

async function createUser(manager: EntityManager, account: SeedAccount): Promise<User> {
  return manager.save(
    manager.create(User, {
      name: account.name,
      email: account.email,
      passwordHash: await hashPassword(account.password),
    }),
  );
}

async function ensureUser(
  manager: EntityManager,
  account: SeedAccount,
): Promise<{ user: User; created: boolean }> {
  const existing = await manager.findOne(User, { where: { email: account.email } });

  if (existing) {
    return { user: existing, created: false };
  }

  return { user: await createUser(manager, account), created: true };
}

async function ensureMembership(
  manager: EntityManager,
  userId: string,
  organizationId: string,
  role: MembershipRole,
): Promise<void> {
  const existing = await manager.findOne(Membership, { where: { userId, organizationId } });

  if (!existing) {
    await manager.save(manager.create(Membership, { userId, organizationId, role }));
    return;
  }

  if (existing.role !== role) {
    existing.role = role;
    await manager.save(existing);
  }
}

function describe(account: SeedAccount, created: boolean): string {
  return created ? `${account.email} (created)` : `${account.email} (already existed, password unchanged)`;
}

async function seed(source: DataSource, config: SeedConfig): Promise<void> {
  await source.transaction(async (manager) => {
    const found = await manager.findOne(Organization, { where: { name: config.organizationName } });
    const organization =
      found ?? (await manager.save(manager.create(Organization, { name: config.organizationName })));

    const admin = await ensureUser(manager, config.admin);
    const member = await ensureUser(manager, config.member);

    await ensureMembership(manager, admin.user.id, organization.id, 'admin');
    await ensureMembership(manager, member.user.id, organization.id, 'member');

    console.log(`Organization "${organization.name}" (${organization.id}) ${found ? 'reused' : 'created'}`);
    console.log(`  admin:  ${describe(config.admin, admin.created)}`);
    console.log(`  member: ${describe(config.member, member.created)}`);

    const projects = await manager.count(Project, { where: { organizationId: organization.id } });

    if (projects > 0) {
      console.log(`  sample project skipped: the organization already has ${projects} project(s)`);
      return;
    }

    const project = await manager.save(
      manager.create(Project, {
        organizationId: organization.id,
        name: PROJECT_NAME,
        description: 'Interior fit-out for the Bole branch office, including furniture and network cabling.',
        budgetEtb: '450000.00',
      }),
    );

    await manager.save([
      manager.create(Task, {
        organizationId: organization.id,
        projectId: project.id,
        title: 'Site survey and measurements',
        status: 'done',
        estimatedCostEtb: '18500.00',
      }),
      manager.create(Task, {
        organizationId: organization.id,
        projectId: project.id,
        title: 'Partition walls and glazing',
        status: 'in_progress',
        estimatedCostEtb: '162000.00',
      }),
      manager.create(Task, {
        organizationId: organization.id,
        projectId: project.id,
        title: 'Network and electrical cabling',
        status: 'todo',
        estimatedCostEtb: '94750.00',
      }),
      manager.create(Task, {
        organizationId: organization.id,
        projectId: project.id,
        title: 'Furniture procurement and installation',
        status: 'todo',
        estimatedCostEtb: '121300.00',
      }),
    ]);

    console.log(`  project: ${project.name} with 4 tasks`);
  });
}

async function main(): Promise<void> {
  const config = resolveConfig();
  const source = await dataSource.initialize();

  try {
    await seed(source, config);
  } finally {
    await source.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
