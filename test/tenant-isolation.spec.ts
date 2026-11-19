import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

describe('tenant isolation', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: unknown;

  let alice: request.Agent;
  let bob: request.Agent;
  let orgA: { id: string };
  let orgB: { id: string };
  let projectA: { id: string };
  let taskA: { id: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE users, organizations, memberships, projects, tasks, invitations, user_sessions CASCADE');

    server = app.getHttpServer();

    alice = request.agent(server as never);
    bob = request.agent(server as never);

    await alice
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'Password123!' })
      .expect(201);

    orgA = (await alice.post('/api/orgs').send({ name: 'Org A' }).expect(201)).body;

    projectA = (
      await alice
        .post(`/api/orgs/${orgA.id}/projects`)
        .send({ name: 'Project A', description: 'secret', budgetEtb: '100000.00' })
        .expect(201)
    ).body;

    taskA = (
      await alice
        .post(`/api/orgs/${orgA.id}/projects/${projectA.id}/tasks`)
        .send({ title: 'Task A', status: 'todo', estimatedCostEtb: '2500.00' })
        .expect(201)
    ).body;

    await bob
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'bob@example.com', password: 'Password123!' })
      .expect(201);

    orgB = (await bob.post('/api/orgs').send({ name: 'Org B' }).expect(201)).body;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists only the organizations the user belongs to', async () => {
    const response = await bob.get('/api/orgs').expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(orgB.id);
  });

  it('hides another organization behind a 404', async () => {
    await bob.get(`/api/orgs/${orgA.id}`).expect(404);
  });

  it('refuses to list another organization projects', async () => {
    await bob.get(`/api/orgs/${orgA.id}/projects`).expect(404);
  });

  it('refuses to read another organization project directly', async () => {
    await bob.get(`/api/orgs/${orgA.id}/projects/${projectA.id}`).expect(404);
  });

  it('refuses to read another organization project through its own organization', async () => {
    await bob.get(`/api/orgs/${orgB.id}/projects/${projectA.id}`).expect(404);
  });

  it('refuses to list tasks of another organization project', async () => {
    await bob.get(`/api/orgs/${orgB.id}/projects/${projectA.id}/tasks`).expect(404);
  });

  it('refuses to create a task inside another organization project', async () => {
    await bob
      .post(`/api/orgs/${orgB.id}/projects/${projectA.id}/tasks`)
      .send({ title: 'Injected', estimatedCostEtb: '1.00' })
      .expect(404);
  });

  it('refuses to update another organization task', async () => {
    await bob
      .patch(`/api/orgs/${orgB.id}/projects/${projectA.id}/tasks/${taskA.id}`)
      .send({ title: 'Hijacked', estimatedCostEtb: '1.00' })
      .expect(404);
  });

  it('refuses to delete another organization task', async () => {
    await bob.delete(`/api/orgs/${orgB.id}/projects/${projectA.id}/tasks/${taskA.id}`).expect(404);
  });

  it('leaves the original organization data untouched', async () => {
    const response = await alice.get(`/api/orgs/${orgA.id}/projects/${projectA.id}`).expect(200);

    expect(response.body.name).toBe('Project A');
    expect(response.body.spentEtb).toBe('2500.00');
  });

  it('rejects anonymous requests', async () => {
    await request(server as never)
      .get('/api/orgs')
      .expect(401);
  });
});

describe('role enforcement', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: unknown;

  let owner: request.Agent;
  let helper: request.Agent;
  let org: { id: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE users, organizations, memberships, projects, tasks, invitations, user_sessions CASCADE');

    server = app.getHttpServer();

    owner = request.agent(server as never);
    helper = request.agent(server as never);

    await owner
      .post('/api/auth/register')
      .send({ name: 'Owner', email: 'owner@example.com', password: 'Password123!' })
      .expect(201);

    await helper
      .post('/api/auth/register')
      .send({ name: 'Helper', email: 'helper@example.com', password: 'Password123!' })
      .expect(201);

    org = (await owner.post('/api/orgs').send({ name: 'Shared Org' }).expect(201)).body;

    await owner
      .post(`/api/orgs/${org.id}/members`)
      .send({ email: 'helper@example.com', role: 'member' })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lets a member read the organization projects', async () => {
    await helper.get(`/api/orgs/${org.id}/projects`).expect(200);
  });

  it('stops a member from creating a project', async () => {
    await helper
      .post(`/api/orgs/${org.id}/projects`)
      .send({ name: 'Unauthorized', budgetEtb: '1.00' })
      .expect(403);
  });

  it('stops a member from adding another member', async () => {
    await helper
      .post(`/api/orgs/${org.id}/members`)
      .send({ email: 'owner@example.com', role: 'admin' })
      .expect(403);
  });

  it('lets a member create a task', async () => {
    const project = (
      await owner
        .post(`/api/orgs/${org.id}/projects`)
        .send({ name: 'Team Project', budgetEtb: '5000.00' })
        .expect(201)
    ).body;

    await helper
      .post(`/api/orgs/${org.id}/projects/${project.id}/tasks`)
      .send({ title: 'Member task', estimatedCostEtb: '100.00' })
      .expect(201);
  });
});
