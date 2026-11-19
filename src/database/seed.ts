import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { hashPassword } from '../auth/password';
import { Membership, Organization, Project, Task, User } from '../entities';
import dataSource from './data-source';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';

const ADMIN = { name: 'Hanna Bekele', email: 'hanna@addisbuild.et' };
const MEMBER = { name: 'Yonas Girma', email: 'yonas@addisbuild.et' };
const ORGANIZATION_NAME = 'Addis Build Collective';
const PROJECT_NAME = 'Bole Office Fit-out';

async function seed(source: DataSource): Promise<void> {
  await source.transaction(async (manager) => {
    const existing = await manager.findOne(Organization, { where: { name: ORGANIZATION_NAME } });

    if (existing) {
      console.log(`Seed skipped: "${ORGANIZATION_NAME}" already exists (${existing.id})`);
      return;
    }

    const passwordHash = await hashPassword(SEED_PASSWORD);

    const admin = await manager.save(manager.create(User, { ...ADMIN, passwordHash }));
    const member = await manager.save(manager.create(User, { ...MEMBER, passwordHash }));

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
    console.log(`  admin:  ${ADMIN.email}`);
    console.log(`  member: ${MEMBER.email}`);
    console.log(`  project: ${project.name} with 4 tasks`);
  });
}

async function main(): Promise<void> {
  const source = await dataSource.initialize();

  try {
    await seed(source);
  } finally {
    await source.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
