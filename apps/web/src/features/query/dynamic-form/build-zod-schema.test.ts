import { describe, it, expect } from 'vitest';
import type { InputFieldDef } from '@shared/index';
import { buildZodSchema } from './build-zod-schema';

// Two structurally different field sets, mirroring config/config.json's
// CITIZEN_BASIC (all-optional + atLeastOneOf) and CITIZEN_EXTENDED
// (required + regex pattern) shapes — exercises every rule this builder
// mirrors from apps/api/src/datasources/input-schema.builder.ts.
const atLeastOneOfFields: InputFieldDef[] = [
  { name: 'fullName', label: 'Họ và tên', type: 'string', required: false, minLength: 2, maxLength: 100 },
  {
    name: 'gender',
    label: 'Giới tính',
    type: 'enum',
    required: false,
    options: [
      { value: 'M', label: 'Nam' },
      { value: 'F', label: 'Nữ' },
    ],
  },
];

const requiredPatternFields: InputFieldDef[] = [
  { name: 'citizenId', label: 'Số CCCD', type: 'string', required: true, pattern: '^[0-9]{12}$' },
  { name: 'occupation', label: 'Nghề nghiệp', type: 'string', required: false, maxLength: 100 },
];

describe('buildZodSchema — atLeastOneOf field set', () => {
  const schema = buildZodSchema(atLeastOneOfFields, ['fullName', 'gender']);

  it('rejects an empty submission (atLeastOneOf unmet)', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('rejects a value shorter than minLength', () => {
    const result = schema.safeParse({ fullName: 'A' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown enum value', () => {
    const result = schema.safeParse({ gender: 'X' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid single field satisfying atLeastOneOf', () => {
    const result = schema.safeParse({ fullName: 'Nguyen Van A', gender: '' });
    expect(result.success).toBe(true);
  });
});

describe('buildZodSchema — required + pattern field set', () => {
  const schema = buildZodSchema(requiredPatternFields);

  it('rejects a missing required field', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('rejects a value that does not match the pattern', () => {
    expect(schema.safeParse({ citizenId: '123' }).success).toBe(false);
  });

  it('accepts a value matching the pattern, with the optional field left blank', () => {
    const result = schema.safeParse({ citizenId: '123456789012', occupation: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ citizenId: '123456789012', occupation: undefined });
    }
  });
});
