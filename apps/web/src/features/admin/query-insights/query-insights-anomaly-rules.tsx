import type { QueryInsightsRules } from '@shared/index';
import { vi } from '@/i18n/vi';

const t = vi.admin.queryInsights;

/** Thresholds as returned by the API (`rules`) + the "holidays not counted" caveat. */
export function QueryInsightsAnomalyRules({ rules }: { rules: QueryInsightsRules }) {
  return (
    <section aria-label={t.rulesTitle} className="bg-muted/40 rounded-md border p-3 text-sm">
      <h3 className="mb-1 font-medium">{t.rulesTitle}</h3>
      <ul className="text-muted-foreground list-disc pl-5">
        <li>{t.ruleSpike(rules.spikeMinCount, rules.spikeBaselineMultiplier, rules.spikeBaselineDays)}</li>
        <li>{t.ruleOffHours(rules.workStartHour, rules.workEndHour)}</li>
        <li>{t.ruleShared(rules.sharedIdentityMinUsers)}</li>
        <li>{t.ruleSharedIp(rules.sharedIpMinUsers)}</li>
      </ul>
      <p className="mt-1 text-xs italic">{t.holidayNote}</p>
    </section>
  );
}
