import type { QueryEnvelope } from '@shared/index';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoRecordTable } from './info-record-table';

/**
 * `type: "info"` results: one card per person (`groups[]`), header =
 * `group.label`, body = that person's records newest-first via
 * `InfoRecordTable` (phase-07 Implementation Step 8). No field name from any
 * specific datasource is referenced here — everything comes from `envelope`.
 */
export function InfoTimeline({ envelope }: { envelope: QueryEnvelope }) {
  return (
    <div className="flex flex-col gap-4">
      {envelope.groups.map((group) => (
        <Card key={group.identity}>
          <CardHeader>
            <CardTitle className="text-base">{group.label}</CardTitle>
            {group.identity !== group.label && <CardDescription>{group.identity}</CardDescription>}
          </CardHeader>
          <CardContent>
            <InfoRecordTable columns={envelope.columns} records={group.records} timestampField={envelope.timestampField} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
