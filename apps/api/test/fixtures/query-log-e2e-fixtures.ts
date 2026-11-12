import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { PermissionKind, QueryStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

export const E2E_PASSWORD = 'HistoryE2E#Passw0rd123';

export interface E2eUser {
  id: string;
  username: string;
  token: string;
}

export async function bootApp(): Promise<{ app: INestApplication<App>; prisma: PrismaService }> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Creates a role with the given permission codes (FEATURE perms are upserted so an un-reseeded DB still works) and a logged-in user. */
export async function createRoleUser(
  app: INestApplication<App>,
  prisma: PrismaService,
  tag: string,
  permissionCodes: string[],
): Promise<E2eUser & { roleId: string }> {
  const role = await prisma.role.create({ data: { code: `E2E_${tag}`, name: `E2E ${tag}` } });
  for (const code of permissionCodes) {
    const perm = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, name: code, kind: PermissionKind.FEATURE },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
  }
  const username = `e2e_${tag}`.toLowerCase();
  const passwordHash = await argon2.hash(E2E_PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.create({ data: { username, fullName: `E2E ${tag}`, passwordHash } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password: E2E_PASSWORD });
  return { id: user.id, username, token: res.body.accessToken as string, roleId: role.id };
}

export async function cleanupUsers(prisma: PrismaService, users: { id: string; username: string; roleId: string }[]): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.role.deleteMany({ where: { id: { in: users.map((u) => u.roleId) } } });
}

export interface RowInput {
  at: string;
  status?: 'success' | 'failed' | 'denied';
  userId?: string | null;
  username?: string;
  code: string;
  params?: Record<string, unknown>;
  summary?: string;
  statusCode?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  recordCount?: number | null;
  durationMs?: number | null;
  upstreamRequestId?: string | null;
  ip?: string | null;
}

export function toQueryLogData(r: RowInput) {
  return {
    userId: r.userId ?? null,
    usernameSnapshot: r.username ?? 'e2e_row_user',
    datasourceCode: r.code,
    queryParams: (r.params ?? {}) as object,
    querySummary: r.summary ?? null,
    status: QueryStatus[(r.status ?? 'success').toUpperCase() as keyof typeof QueryStatus],
    statusCode: r.statusCode ?? null,
    errorCode: r.errorCode ?? null,
    errorMessage: r.errorMessage ?? null,
    recordCount: r.recordCount ?? null,
    durationMs: r.durationMs ?? null,
    upstreamRequestId: r.upstreamRequestId ?? null,
    ip: r.ip ?? null,
    createdAt: new Date(r.at),
  };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
