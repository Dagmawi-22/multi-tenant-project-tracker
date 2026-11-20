import 'reflect-metadata';
import { DataSource, EntityManager } from 'typeorm';
import { hashPassword } from '../auth/password';
import { Membership, Organization, Project, Task, User } from '../entities';
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

async function seed(source: DataSource, config: SeedConfig): Promise<void> {
  const { organizationName: ORGANIZATION_NAME } = config;

  await source.transaction(async (manager) => {
    const existing = await manager.findOne(Organization, { where: { name: ORGANIZATION_NAME } });

    if (existing) {
      console.log(`Seed skipped: "${ORGANIZATION_NAME}" already exists (${existing.id})`);
      return;
    }

    const admin = await createUser(manager, config.admin);
    const member = await createUser(manager, config.member);

    const organization = await manager.save(manager.create(Organization, { name: ORGANIZATION_NAME }));

    await manager.save([
      manager.create(Membership, { userId: admin.id, organizationId: organization.id, role: 'admin' }),
      manager.create(Membership, { userId: member.id, organizationId: organization.id, role: 'member' }),
    ]);

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

    console.log(`Seeded organization "${organization.name}" (${organization.id})`);
    console.log(`  admin:  ${config.admin.email}`);
    console.log(`  member: ${config.member.email}`);
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
