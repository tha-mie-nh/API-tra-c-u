import { randomBytes } from 'node:crypto';
import { DatasourceSecretStore } from './datasource-secret-store.service';

/** Test helper: store thật (mã hóa thật) nhưng "bảng" là một Map trong bộ nhớ. Truyền `key = null` để mô phỏng chưa có khóa chủ. */
export function buildInMemorySecretStore(key: Buffer | null = randomBytes(32)) {
  const rows = new Map<string, { datasourceCode: string; encryptedValue: string; updatedBy: string | null }>();
  const prisma = {
    datasourceSecret: {
      findMany: async () => Array.from(rows.values()),
      deleteMany: async ({ where }: { where: { datasourceCode: string } }) => void rows.delete(where.datasourceCode),
      upsert: async ({ create, update, where }: { create: never; update: object; where: { datasourceCode: string } }) =>
        void rows.set(where.datasourceCode, { ...(rows.get(where.datasourceCode) ?? (create as object)), ...update } as never),
    },
  };
  return { store: new DatasourceSecretStore(prisma as never, key), rows, key };
}
