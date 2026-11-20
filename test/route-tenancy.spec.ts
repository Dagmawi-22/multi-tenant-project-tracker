import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

const TENANT_PARAM = ':orgId';

const ROUTES_OUTSIDE_ANY_ORGANIZATION = new Set([
  'GET /',
  'GET /healthz',
  'GET /login',
  'POST /login',
  'GET /register',
  'POST /register',
  'POST /logout',
  'GET /orgs',
  'POST /orgs',
  'GET /invitations/accept',
  'POST /invitations/accept',
  'GET /api/auth/me',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/register',
  'GET /api/orgs',
  'POST /api/orgs',
]);

const UNRECOGNISED_TENANT_PARAMS = /:(organizationId|organisationId|tenantId|companyId|workspaceId|accountId)\b/;

describe('route tenancy', () => {
  let app: INestApplication;
  let routes: string[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const discovery = app.get(DiscoveryService);

    routes = discovery.getControllers().flatMap((wrapper) => {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | undefined;

      if (!controller) {
        return [];
      }

      const base = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? '';
      const prototype = controller.prototype as Record<string, unknown>;

      return Object.getOwnPropertyNames(prototype)
        .filter((key) => key !== 'constructor')
        .flatMap((key) => {
          const handler = prototype[key] as object;
          const suffix = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;

          if (suffix === undefined) {
            return [];
          }

          const verb = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
          const path = `/${[base, suffix].filter((part) => part && part !== '/').join('/')}`.replace(/\/+/g, '/');

          return [`${verb} ${path}`];
        });
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('finds the routes to inspect', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('scopes every route to an organization unless it is listed as deliberately global', () => {
    const unscoped = routes
      .filter((route) => !route.includes(TENANT_PARAM))
      .filter((route) => !ROUTES_OUTSIDE_ANY_ORGANIZATION.has(route))
      .sort();

    expect(unscoped).toEqual([]);
  });

  it('keeps no stale entries in the deliberately global list', () => {
    const stale = [...ROUTES_OUTSIDE_ANY_ORGANIZATION].filter((route) => !routes.includes(route)).sort();

    expect(stale).toEqual([]);
  });

  it('never names the tenant parameter something the global guard would not recognise', () => {
    const unrecognised = routes.filter((route) => UNRECOGNISED_TENANT_PARAMS.test(route)).sort();

    expect(unrecognised).toEqual([]);
  });
});
