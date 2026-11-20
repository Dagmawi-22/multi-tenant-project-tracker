import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

describe('task priority', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: unknown;

  let owner: request.Agent;
  let outsider: request.Agent;
  let org: { id: string };
  let otherOrg: { id: string };
  let project: { id: string };

  const tasksUrl = () => `/api/orgs/${org.id}/projects/${project.id}/tasks`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.query(
      'TRUNCATE users, organizations, memberships, projects, tasks, invitations, user_sessions CASCADE',
    );

    server = app.getHttpServer();
    owner = request.agent(server as never);
    outsider = request.agent(server as never);

    await owner
      .post('/api/auth/register')
      .send({ name: 'Priya', email: 'priya@example.com', password: 'Password123!' })
      .expect(201);

    org = (await owner.post('/api/orgs').send({ name: 'Priority Org' }).expect(201)).body;

    project = (
      await owner
        .post(`/api/orgs/${org.id}/projects`)
        .send({ name: 'Priority Project', budgetEtb: '90000.00' })
        .expect(201)
    ).body;

    await owner.post(tasksUrl()).send({ title: 'Low task', priority: 'low', estimatedCostEtb: '10.00' }).expect(201);
    await owner.post(tasksUrl()).send({ title: 'High task', priority: 'high', estimatedCostEtb: '20.00' }).expect(201);
    await owner.post(tasksUrl()).send({ title: 'Default task', estimatedCostEtb: '30.00' }).expect(201);

    await outsider
      .post('/api/auth/register')
      .send({ name: 'Nadia', email: 'nadia@example.com', password: 'Password123!' })
      .expect(201);

    otherOrg = (await outsider.post('/api/orgs').send({ name: 'Other Org' }).expect(201)).body;

    const otherProject = (
      await outsider
        .post(`/api/orgs/${otherOrg.id}/projects`)
        .send({ name: 'Other Project', budgetEtb: '1000.00' })
        .expect(201)
    ).body;

    await outsider
      .post(`/api/orgs/${otherOrg.id}/projects/${otherProject.id}/tasks`)
      .send({ title: 'Other org high task', priority: 'high', estimatedCostEtb: '40.00' })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('defaults an unspecified priority to medium', async () => {
    const tasks = (await owner.get(tasksUrl()).expect(200)).body;
    const created = tasks.find((task: { title: string }) => task.title === 'Default task');

    expect(created.priority).toBe('medium');
  });

  it('filters tasks by priority', async () => {
    const high = (await owner.get(`${tasksUrl()}?priority=high`).expect(200)).body;

    expect(high.map((task: { title: string }) => task.title)).toEqual(['High task']);

    const low = (await owner.get(`${tasksUrl()}?priority=low`).expect(200)).body;

    expect(low.map((task: { title: string }) => task.title)).toEqual(['Low task']);
  });

  it('returns every task when no priority is given', async () => {
    const tasks = (await owner.get(tasksUrl()).expect(200)).body;

    expect(tasks).toHaveLength(3);
  });

  it('rejects a priority outside the allowed set', async () => {
    await owner
      .post(tasksUrl())
      .send({ title: 'Bad priority', priority: 'urgent', estimatedCostEtb: '5.00' })
      .expect(400);
  });

  it('lets a task change priority', async () => {
    const tasks = (await owner.get(`${tasksUrl()}?priority=low`).expect(200)).body;

    await owner
      .patch(`${tasksUrl()}/${tasks[0].id}`)
      .send({ title: 'Low task', priority: 'high', estimatedCostEtb: '10.00' })
      .expect(200);

    const high = (await owner.get(`${tasksUrl()}?priority=high`).expect(200)).body;

    expect(high.map((task: { title: string }) => task.title).sort()).toEqual(['High task', 'Low task']);
  });

  it('never leaks another organization tasks through the priority filter', async () => {
    await outsider.get(`${tasksUrl()}?priority=high`).expect(404);

    const mine = (await owner.get(`${tasksUrl()}?priority=high`).expect(200)).body;

    expect(mine.every((task: { title: string }) => task.title !== 'Other org high task')).toBe(true);
  });
});
