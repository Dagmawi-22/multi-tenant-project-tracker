import { Body, Controller, Get, HttpException, Param, Post, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { destroySession, establishSession } from '../auth/session.helpers';
import { CurrentOrg, OrgContext } from '../common/decorators/org-context.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { OrgAdminGuard } from '../common/guards/org-admin.guard';
import { OrgMemberGuard } from '../common/guards/org-member.guard';
import { httpExceptionMessage } from '../common/http-message';
import { InvitationsService } from '../invitations/invitations.service';
import { budgetSummary } from '../common/money';
import { TaskStatus } from '../entities';
import { OrgsService } from '../orgs/orgs.service';
import { ProjectsService } from '../projects/projects.service';
import { TasksService } from '../tasks/tasks.service';
import { popFlash, setFlash } from './flash';
import { optionalText, requireEmail, requireMoney, requireOneOf, requireText } from './form';
import { WebExceptionFilter } from './web-exception.filter';

const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

type Attempt<T> = { ok: true; value: T } | { ok: false };

@Controller()
@UseFilters(WebExceptionFilter)
export class WebController {
  constructor(
    private readonly authService: AuthService,
    private readonly orgsService: OrgsService,
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
    private readonly invitationsService: InvitationsService,
  ) {}

  @Get()
  index(@Req() request: Request, @Res() response: Response): void {
    response.redirect(request.session.userId ? '/orgs' : '/login');
  }

  @Get('login')
  loginPage(@Req() request: Request, @Res() response: Response): void {
    if (request.session.userId) {
      response.redirect('/orgs');
      return;
    }

    response.render('login', { title: 'Sign in' });
  }

  @Post('login')
  async login(@Req() request: Request, @Res() response: Response, @Body() body: Record<string, string>): Promise<void> {
    try {
      const user = await this.authService.validate(String(body.email ?? ''), String(body.password ?? ''));
      await establishSession(request, user);
      response.redirect('/orgs');
    } catch {
      response.status(401).render('login', {
        title: 'Sign in',
        error: 'Invalid email or password',
        email: body.email,
      });
    }
  }

  @Get('register')
  registerPage(@Req() request: Request, @Res() response: Response): void {
    if (request.session.userId) {
      response.redirect('/orgs');
      return;
    }

    response.render('register', { title: 'Create account' });
  }

  @Post('register')
  async register(@Req() request: Request, @Res() response: Response, @Body() body: Record<string, string>): Promise<void> {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');

    if (name.length < 2 || password.length < 8) {
      response.status(400).render('register', {
        title: 'Create account',
        error: 'Name must be at least 2 characters and password at least 8 characters',
        name,
        email,
      });
      return;
    }

    try {
      const user = await this.authService.register({ name, email, password });
      await establishSession(request, user);
      response.redirect('/orgs');
    } catch {
      response.status(409).render('register', {
        title: 'Create account',
        error: 'An account with that email already exists',
        name,
        email,
      });
    }
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res() response: Response): Promise<void> {
    await destroySession(request);
    response.redirect('/login');
  }

  @Get('orgs')
  @UseGuards(AuthenticatedGuard)
  async orgsPage(@Req() request: Request, @Res() response: Response): Promise<void> {
    const memberships = await this.orgsService.listForUser(request.session.userId as string);

    response.render('orgs', {
      ...this.baseLocals(request),
      title: 'Organizations',
      organizations: memberships.map(({ organization, role }) => ({
        id: organization.id,
        name: organization.name,
        role,
        isAdmin: role === 'admin',
      })),
    });
  }

  @Post('orgs')
  @UseGuards(AuthenticatedGuard)
  async createOrg(@Req() request: Request, @Res() response: Response, @Body() body: Record<string, string>): Promise<void> {
    const result = await this.attempt(request, async () => {
      const name = requireText(body.name, 'Organization name', 120);
      return this.orgsService.createForUser(request.session.userId as string, name);
    });

    if (!result.ok) {
      response.redirect('/orgs');
      return;
    }

    setFlash(request, 'success', `Created ${result.value.name}`);
    response.redirect(`/orgs/${result.value.id}`);
  }

  @Get('orgs/:orgId')
  @UseGuards(AuthenticatedGuard, OrgMemberGuard)
  async orgPage(@Req() request: Request, @Res() response: Response, @CurrentOrg() org: OrgContext): Promise<void> {
    const [organization, projects, members, invitations] = await Promise.all([
      this.orgsService.findById(org.organizationId),
      this.projectsService.listWithSpend(org.organizationId),
      this.orgsService.listMembers(org.organizationId),
      this.invitationsService.listPending(org.organizationId),
    ]);

    const adminCount = members.filter((membership) => membership.role === 'admin').length;

    response.render('org', {
      ...this.baseLocals(request),
      title: organization.name,
      currentOrg: organization,
      organization,
      isAdmin: org.role === 'admin',
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        taskCount: project.taskCount,
        ...budgetSummary(project.budgetEtb, project.spentEtb),
      })),
      pendingInvitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      })),
      members: members.map((membership) => ({
        userId: membership.userId,
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role,
        isAdmin: membership.role === 'admin',
        isLastAdmin: membership.role === 'admin' && adminCount <= 1,
      })),
    });
  }

  @Post('orgs/:orgId/invitations')
  @UseGuards(AuthenticatedGuard, OrgMemberGuard, OrgAdminGuard)
  async invite(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentOrg() org: OrgContext,
    @Body() body: Record<string, string>,
  ): Promise<void> {
    const result = await this.attempt(request, async () => {
      const email = requireEmail(body.email);
      const role = requireOneOf(body.role, ['admin', 'member'] as const, 'Role');

      return this.invitationsService.invite(
        org.organizationId,
        request.session.userId as string,
        email,
        role,
        this.baseUrl(request),
      );
    });

    if (result.ok) {
      if (result.value.outcome === 'added') {
        setFlash(request, 'success', `${body.email} was already registered and has been added`);
      } else if (result.value.outcome === 'emailed') {
        setFlash(request, 'success', `Invitation sent to ${body.email}`);
      } else {
        setFlash(request, 'error', `Email is not configured. Invitation link: ${result.value.acceptUrl}`);
      }
    }

    response.redirect(`/orgs/${org.organizationId}`);
  }

  @Post('orgs/:orgId/invitations/:invitationId/delete')
  @UseGuards(AuthenticatedGuard, OrgMemberGuard, OrgAdminGuard)
  async revokeInvitation(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentOrg() org: OrgContext,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    const result = await this.attempt(request, () =>
      this.invitationsService.revoke(org.organizationId, invitationId),
    );

    if (result.ok) {
      setFlash(request, 'success', 'Invitation revoked');
    }

    response.redirect(`/orgs/${org.organizationId}`);
  }

  @Get('invitations/accept')
  async acceptPage(
    @Req() request: Request,
    @Res() response: Response,
    @Query('token') token: string,
  ): Promise<void> {
    const invitation = await this.invitationsService.findValidByToken(String(token ?? ''));
    const existingUser = await this.authService.findByEmail(invitation.email);

    response.render('accept', {
      ...this.baseLocals(request),
      title: `Join ${invitation.organization.name}`,
      token,
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.organization.name,
      inviterName: invitation.invitedBy.name,
      needsAccount: !existingUser,
      signedInAsInvitee: Boolean(existingUser) && request.session.userId === existingUser?.id,
    });
  }

  @Post('invitations/accept')
  async acceptInvitation(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: Record<string, string>,
  ): Promise<void> {
    const token = String(body.token ?? '');
    const invitation = await this.invitationsService.findValidByToken(token);
    const existingUser = await this.authService.findByEmail(invitation.email);

    if (existingUser && request.session.userId !== existingUser.id) {
      setFlash(request, 'error', `Sign in as ${invitation.email} to accept this invitation`);
      response.redirect('/login');
      return;
    }

    const result = await this.attempt(request, () =>
      this.invitationsService.accept(token, { name: body.name, password: body.password }),
    );

    if (!result.ok) {
      response.redirect(`/invitations/accept?token=${encodeURIComponent(token)}`);
      return;
    }

    if (!existingUser) {
      await establishSession(request, result.value);
    }

    setFlash(request, 'success', `You have joined ${invitation.organization.name}`);
    response.redirect(`/orgs/${invitation.organizationId}`);
  }

  @Post('orgs/:orgId/members/:userId/delete')
  @UseGuards(AuthenticatedGuard, OrgMemberGuard, OrgAdminGuard)
  async removeMember(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentOrg() org: OrgContext,
    @Param('userId') userId: string,
  ): Promise<void> {
    const result = await this.attempt(request, () => this.orgsService.removeMember(org.organizationId, userId));

    if (result.ok) {
      setFlash(request, 'success', 'Member removed');
    }

    response.redirect(`/orgs/${org.organizationId}`);
  }

  @Post('orgs/:orgId/projects')
  @UseGuards(AuthenticatedGuard, OrgMemberGuard, OrgAdminGuard)
  async createProject(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentOrg() org: OrgContext,
    @Body() body: Record<string, string>,
  ): Promise<void> {
    const result = await this.attempt(request, async () =>
      this.projectsService.create(org.organizationId, {
        name: requireText(body.name, 'Project name', 160),
        description: optionalText(body.description),
        budgetEtb: requireMoney(body.budgetEtb, 'Budget'),
      }),
    );

    if (result.ok) {
      setFlash(request, 'success', `Project "${result.value.name}" created`);
    }

    response.redirect(`/orgs/${org.organizationId}`);
  }

  @Get('orgs/:orgId/projects/:projectId')
  @UseGuards(AuthenticatedGuard, OrgMemberGuard)
  async projectPage(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentOrg() org: OrgContext,
    @Param('projectId') projectId: string,
  ): Promise<void> {
    const organization = await this.orgsService.findById(org.organizationId);
    const project = await this.projectsService.findOne(org.organizationId, projectId);
    const spentEtb = await this.projectsService.spendFor(org.organizationId, projectId);
    const tasks = await this.tasksService.listForProject(org.organizationId, projectId);

    response.render('project', {
      ...this.baseLocals(request),
      title: project.name,
      currentOrg: organization,
      organization,
      isAdmin: org.role === 'admin',
      project,
      ...budgetSummary(project.budgetEtb, spentEtb),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        estimatedCostEtb: task.estimatedCostEtb,
        isTodo: task.status === 'todo',
        isInProgress: task.status === 'in_progress',
        isDone: task.status === 'done',
      })),
    });
  }

  @Post('orgs/:orgId/projects/:projectId/tasks')
  @UseGuards(AuthenticatedGuard, OrgMemberGuard)
  async createTask(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentOrg() org: OrgContext,
    @Param('projectId') projectId: string,
    @Body() body: Record<string, string>,
  ): Promise<void> {
    const result = await this.attempt(request, async () =>
      this.tasksService.create(org.organizationId, projectId, {
        title: requireText(body.title, 'Task title', 200),
        status: requireOneOf<TaskStatus>(body.status ?? 'todo', TASK_STATUSES, 'Status'),
        estimatedCostEtb: requireMoney(body.estimatedCostEtb, 'Estimated cost'),
      }),
    );

    if (result.ok) {
      setFlash(request, 'success', 'Task added');
    }

    response.redirect(`/orgs/${org.organizationId}/projects/${projectId}`);
  }

  @Post('orgs/:orgId/projects/:projectId/tasks/:taskId')
  @UseGuards(AuthenticatedGuard, OrgMemberGuard)
  async updateTask(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentOrg() org: OrgContext,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: Record<string, string>,
  ): Promise<void> {
    const result = await this.attempt(request, async () =>
      this.tasksService.update(org.organizationId, taskId, {
        title: requireText(body.title, 'Task title', 200),
        status: requireOneOf<TaskStatus>(body.status ?? 'todo', TASK_STATUSES, 'Status'),
        estimatedCostEtb: requireMoney(body.estimatedCostEtb, 'Estimated cost'),
      }),
    );

    if (result.ok) {
      setFlash(request, 'success', 'Task saved');
    }

    response.redirect(`/orgs/${org.organizationId}/projects/${projectId}`);
  }

  @Post('orgs/:orgId/projects/:projectId/tasks/:taskId/delete')
  @UseGuards(AuthenticatedGuard, OrgMemberGuard)
  async deleteTask(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentOrg() org: OrgContext,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<void> {
    const result = await this.attempt(request, () => this.tasksService.remove(org.organizationId, taskId));

    if (result.ok) {
      setFlash(request, 'success', 'Task deleted');
    }

    response.redirect(`/orgs/${org.organizationId}/projects/${projectId}`);
  }

  private baseUrl(request: Request): string {
    const configured = process.env.APP_URL;

    if (configured) {
      return configured.replace(/\/$/, '');
    }

    return `${request.protocol}://${request.get('host')}`;
  }

  private async attempt<T>(request: Request, action: () => Promise<T>): Promise<Attempt<T>> {
    try {
      return { ok: true, value: await action() };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        setFlash(request, 'error', httpExceptionMessage(error, error.getStatus()));
        return { ok: false };
      }

      throw error;
    }
  }

  private baseLocals(request: Request): Record<string, unknown> {
    const flash = popFlash(request);

    if (!request.session.userId) {
      return { flash };
    }

    return {
      flash,
      currentUser: { id: request.session.userId, name: request.session.userName },
    };
  }
}
