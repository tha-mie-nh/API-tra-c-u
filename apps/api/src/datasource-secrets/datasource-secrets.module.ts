import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DatasourceSecretStore } from './datasource-secret-store.service';
import { parseMasterKey } from './secret-crypto.util';

/**
 * Provider bất đồng bộ: Nest chờ `load()` xong rồi mới tạo `DatasourceConfigLoaderService`, nên snapshot lúc khởi động
 * đã thấy các API key lưu trong DB (resolver đọc đồng bộ).
 */
@Global()
@Module({
  providers: [
    {
      provide: DatasourceSecretStore,
      inject: [PrismaService, ConfigService],
      useFactory: async (prisma: PrismaService, config: ConfigService) => {
        const store = new DatasourceSecretStore(prisma, parseMasterKey(config.get<string>('SECRETS_ENCRYPTION_KEY')));
        await store.load();
        return store;
      },
    },
  ],
  exports: [DatasourceSecretStore],
})
export class DatasourceSecretsModule {}
