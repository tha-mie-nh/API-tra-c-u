import type { UpstreamExchange } from '../datasources/adapters/datasource-adapter.interface';

const MAX_DETAIL_CHARS = 300;
/** Các khóa hay dùng để chứa câu thông báo lỗi trong phản hồi JSON của API đối tác, theo thứ tự ưu tiên. */
const MESSAGE_KEYS = ['message', 'error_description', 'errorMessage', 'detail', 'title', 'msg', 'description', 'error'];

function cut(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_DETAIL_CHARS ? `${oneLine.slice(0, MAX_DETAIL_CHARS)}…` : oneLine;
}

/** Rút câu lỗi từ phản hồi lỗi của đối tác: chuỗi -> chính nó; JSON -> giá trị của khóa quen thuộc (message, detail, error...), không có thì cả JSON rút gọn. */
export function summarizeUpstreamErrorBody(body: unknown): string | null {
  if (body === null || body === undefined || body === '') return null;
  if (typeof body === 'string') return cut(body.replace(/<[^>]+>/g, ' ')) || null; // trang lỗi HTML: bỏ thẻ
  if (typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of MESSAGE_KEYS) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return cut(value);
      if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).message === 'string') return cut((value as { message: string }).message);
    }
    return cut(JSON.stringify(body));
  }
  return cut(String(body));
}

/**
 * Câu mô tả CHÍNH XÁC điều đã xảy ra với lời gọi sang đối tác, để lưu vào lịch sử tra cứu (không gửi về trình duyệt):
 *   - đối tác có trả lời lỗi  -> "Đối tác trả lỗi HTTP 401: Invalid access key"
 *   - không kết nối được      -> "Không kết nối được tới đối tác: connect ECONNREFUSED 10.0.0.5:8080"
 *   - quá thời gian           -> "Đối tác không phản hồi: <lý do>"
 * `null` khi không có thông tin để nói chính xác hơn (caller dùng câu chung).
 */
export function describeUpstreamFailure(exchange: UpstreamExchange | undefined): string | null {
  const response = exchange?.response;
  if (!response) return null;
  if (response.statusCode !== null && response.statusCode !== undefined) {
    const reason = summarizeUpstreamErrorBody(response.body);
    return `Đối tác trả lỗi HTTP ${response.statusCode}${reason ? `: ${reason}` : ''}`;
  }
  if (response.error) {
    const network = /^network error: (.*)$/.exec(response.error);
    if (network) return `Không kết nối được tới đối tác: ${cut(network[1] ?? '')}`;
    if (response.error === 'no response received yet') return null;
    return `Đối tác không phản hồi: ${cut(response.error)}`;
  }
  return null;
}
