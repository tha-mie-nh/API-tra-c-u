import { UnprocessableEntityException } from '@nestjs/common';

export interface SplitApiKeyFields {
  /** Body đã bỏ `apiKey`/`clearApiKey` (hai trường này KHÔNG thuộc config.json, AJV sẽ từ chối nếu để lại). */
  rest: unknown;
  /** API key mới (chỉ ghi, không bao giờ đọc ngược). `undefined` = không đổi key. */
  apiKey: string | undefined;
  clearApiKey: boolean;
}

/** Tách trường chỉ-ghi `apiKey` (và cờ `clearApiKey`) ra khỏi body trước khi dựng entry cho config.json. */
export function splitApiKeyFields(body: unknown): SplitApiKeyFields {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { rest: body, apiKey: undefined, clearApiKey: false };
  }
  const { apiKey, clearApiKey, ...rest } = body as Record<string, unknown>;
  if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.trim().length === 0 || apiKey.length > 4096)) {
    throw new UnprocessableEntityException({
      code: 'DATASOURCE_CONFIG_INVALID',
      message: 'Datasource config is invalid',
      details: [{ path: 'apiKey', message: 'apiKey phải là chuỗi không rỗng (tối đa 4096 ký tự)' }],
    });
  }
  return { rest, apiKey: apiKey === undefined ? undefined : (apiKey as string).trim(), clearApiKey: clearApiKey === true };
}
