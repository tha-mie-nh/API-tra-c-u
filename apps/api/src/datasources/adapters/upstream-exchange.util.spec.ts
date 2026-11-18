import { REDACTED, redactHeaders } from './upstream-exchange.util';

describe('redactHeaders', () => {
  it.each(['Authorization', 'X-Api-Key', 'X-Access-Key', 'Access-Key', 'x-access-key', 'X-Secret-Key', 'Key', 'X-Auth-Token', 'Cookie', 'Set-Cookie', 'X-Signature', 'X-Session-Id', 'Password', 'X-Credential'])(
    'che giá trị header bí mật: %s',
    (name) => {
      expect(redactHeaders({ [name]: 'my-secret-key' })[name]).toBe(REDACTED);
    },
  );

  it.each(['content-type', 'accept', 'x-request-id', 'user-agent', 'x-request-type'])('giữ nguyên header thường: %s', (name) => {
    expect(redactHeaders({ [name]: 'v' })[name]).toBe('v');
  });

  it('che thêm header khai riêng làm xác thực dù tên không có từ khóa nào (không phân biệt hoa thường)', () => {
    const out = redactHeaders({ 'X-Custom-Pass': 'abc', 'content-type': 'application/json' }, ['x-custom-pass']);
    expect(out['X-Custom-Pass']).toBe(REDACTED);
    expect(out['content-type']).toBe('application/json');
  });
});
