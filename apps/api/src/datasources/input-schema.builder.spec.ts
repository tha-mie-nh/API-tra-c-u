import type { InputFieldDef } from '@app/shared';
import { buildInputSchema } from './input-schema.builder';

describe('buildInputSchema', () => {
  it('accepts a valid required string field and rejects a missing one', () => {
    const fields: InputFieldDef[] = [{ name: 'fullName', label: 'Full name', type: 'string', required: true, minLength: 2 }];
    const schema = buildInputSchema(fields);

    expect(schema.safeParse({ fullName: 'Nguyễn Văn A' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ fullName: 'A' }).success).toBe(false); // below minLength
  });

  it('coerces + bounds a number field', () => {
    const fields: InputFieldDef[] = [{ name: 'age', label: 'Age', type: 'number', required: true, min: 0, max: 150 }];
    const schema = buildInputSchema(fields);

    expect(schema.safeParse({ age: '42' }).success).toBe(true);
    expect(schema.safeParse({ age: '200' }).success).toBe(false);
  });

  it('validates an enum field against its declared options only', () => {
    const fields: InputFieldDef[] = [
      { name: 'gender', label: 'Gender', type: 'enum', options: [{ value: 'M', label: 'Nam' }, { value: 'F', label: 'Nữ' }] },
    ];
    const schema = buildInputSchema(fields);

    expect(schema.safeParse({ gender: 'M' }).success).toBe(true);
    expect(schema.safeParse({ gender: 'X' }).success).toBe(false);
  });

  it('validates a date field as YYYY-MM-DD', () => {
    const fields: InputFieldDef[] = [{ name: 'dob', label: 'DOB', type: 'date' }];
    const schema = buildInputSchema(fields);

    expect(schema.safeParse({ dob: '1999-05-12' }).success).toBe(true);
    expect(schema.safeParse({ dob: '12/05/1999' }).success).toBe(false);
  });

  it('enforces a pattern constraint', () => {
    const fields: InputFieldDef[] = [{ name: 'citizenId', label: 'CCCD', type: 'string', pattern: '^[0-9]{12}$' }];
    const schema = buildInputSchema(fields);

    expect(schema.safeParse({ citizenId: '001099001234' }).success).toBe(true);
    expect(schema.safeParse({ citizenId: 'abc' }).success).toBe(false);
  });

  it('enforces atLeastOneOf across otherwise-optional fields', () => {
    const fields: InputFieldDef[] = [
      { name: 'fullName', label: 'Full name', type: 'string' },
      { name: 'dob', label: 'DOB', type: 'date' },
    ];
    const schema = buildInputSchema(fields, ['fullName', 'dob']);

    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ fullName: 'Nguyễn Văn A' }).success).toBe(true);
    expect(schema.safeParse({ dob: '1999-05-12' }).success).toBe(true);
  });

  it('rejects unknown keys not declared in input.fields (strict object)', () => {
    const fields: InputFieldDef[] = [{ name: 'fullName', label: 'Full name', type: 'string' }];
    const schema = buildInputSchema(fields);

    expect(schema.safeParse({ fullName: 'A', unexpected: 'x' }).success).toBe(false);
  });
});
