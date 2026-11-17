import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from './secret-crypto.util';

/**
 * API key của từng nguồn dữ liệu do admin nhập trên giao diện. Lưu mã hóa trong Postgres, giải mã MỘT lần lúc khởi động
 * và giữ trong bộ nhớ (resolver đọc đồng bộ khi dựng snapshot). Giá trị không bao giờ ra khỏi tiến trình API.
 *
 * Quy trình ghi của admin: `stage()` (chỉ bộ nhớ, để dry-run validate thấy key) -> `persist()` (ghi DB) ->
 * nếu validate lỗi thì `unstage()` trả về trạng thái cũ.
 */
@Injectable()
export class DatasourceSecretStore {
  private readonly logger = new Logger(DatasourceSecretStore.name);
  private readonly values = new Map<string, string>();

  constructor(
    private readonly prisma: Pick<PrismaService, 'datasourceSecret'>,
    private readonly masterKey: Buffer | null,
  ) {}

  /** Có khóa chủ thì mới lưu được key mới. */
  get canStore(): boolean {
    return this.masterKey !== null;
  }

  /** Đọc toàn bộ từ DB. Lỗi (bảng chưa migrate, sai khóa chủ) không làm sập app: chỉ cảnh báo và bỏ qua dòng đó. */
  async load(): Promise<void> {
    let rows: { datasourceCode: string; encryptedValue: string }[] = [];
    try {
      rows = await this.prisma.datasourceSecret.findMany();
    } catch (err) {
      this.logger.warn(`Không đọc được bảng datasource_secrets (đã chạy migration chưa?): ${(err as Error).message}`);
      return;
    }
    if (rows.length > 0 && !this.masterKey) {
      this.logger.warn(`Có ${rows.length} API key lưu trong DB nhưng SECRETS_ENCRYPTION_KEY chưa đặt: các nguồn đó sẽ không có key.`);
      return;
    }
    for (const row of rows) {
      try {
        this.values.set(row.datasourceCode, decryptSecret(row.encryptedValue, this.masterKey as Buffer, row.datasourceCode));
      } catch {
        this.logger.error(`Không giải mã được API key của "${row.datasourceCode}" (sai SECRETS_ENCRYPTION_KEY hoặc dữ liệu hỏng).`);
      }
    }
    this.logger.log(`Đã nạp ${this.values.size} API key mã hóa từ DB.`);
  }

  get(code: string): string | undefined {
    return this.values.get(code);
  }

  has(code: string): boolean {
    return this.values.has(code);
  }

  /** Đặt tạm trong bộ nhớ; trả hàm hoàn tác. Ném 422 nếu chưa có khóa chủ. */
  stage(code: string, value: string): () => void {
    if (!this.masterKey) {
      throw new UnprocessableEntityException({
        code: 'SECRETS_ENCRYPTION_KEY_MISSING',
        message: 'Chưa đặt SECRETS_ENCRYPTION_KEY trong .env.prod nên chưa lưu được API key trên giao diện. Dùng biến môi trường (*_API_KEY) hoặc đặt khóa chủ rồi `docker compose up -d`.',
      });
    }
    const previous = this.values.get(code);
    this.values.set(code, value);
    return () => (previous === undefined ? this.values.delete(code) : this.values.set(code, previous));
  }

  /** Xóa tạm trong bộ nhớ; trả hàm hoàn tác. */
  stageRemoval(code: string): () => void {
    const previous = this.values.get(code);
    this.values.delete(code);
    return () => {
      if (previous !== undefined) this.values.set(code, previous);
    };
  }

  /** Ghi giá trị đang có trong bộ nhớ của `code` xuống DB (hoặc xóa dòng nếu đã bị gỡ). */
  async persist(code: string, updatedBy: string | null): Promise<void> {
    const value = this.values.get(code);
    if (value === undefined) {
      await this.prisma.datasourceSecret.deleteMany({ where: { datasourceCode: code } });
      return;
    }
    const encryptedValue = encryptSecret(value, this.masterKey as Buffer, code);
    await this.prisma.datasourceSecret.upsert({
      where: { datasourceCode: code },
      create: { datasourceCode: code, encryptedValue, updatedBy },
      update: { encryptedValue, updatedBy },
    });
  }
}
