import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * bridge giao tiếp giữa code BE và db, gọi qua hàm JS singleton
 * Wraps the generated PrismaClient as a Nest-managed singleton so every
 * feature module injects `PrismaService` instead of instantiating its own
 * client. Connects eagerly on module init (fail fast if the DB is down) and
 * disconnects on shutdown to avoid leaking connections in watch mode / tests.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }
}
