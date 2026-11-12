const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** query_logs ids are UUIDs; anything else (e.g. a hand-edited `?detail=`) must never reach the API path. */
export function isHistoryRecordId(id: string | null | undefined): id is string {
  return !!id && UUID.test(id);
}
