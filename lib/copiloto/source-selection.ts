import type { CopilotSource, CopilotSourceKind } from '@/lib/copiloto/types';

export const COPILOT_SOURCE_LIMIT_PER_KIND = 8;
export const COPILOT_SOURCE_KIND_ORDER = ['site', 'news', 'social'] as const satisfies readonly CopilotSourceKind[];

/**
 * Applies independent quotas so a prolific channel cannot crowd the other
 * research tracks out of the provenance ledger.
 */
export function limitSourcesByKind(
  sources: CopilotSource[],
  limitPerKind = COPILOT_SOURCE_LIMIT_PER_KIND,
): CopilotSource[] {
  const safeLimit = Math.max(0, Math.floor(limitPerKind));
  const seen = new Set<string>();

  return COPILOT_SOURCE_KIND_ORDER.flatMap((kind) => {
    const selected: CopilotSource[] = [];
    for (const source of sources) {
      if (source.kind !== kind || seen.has(source.url) || selected.length >= safeLimit) continue;
      seen.add(source.url);
      selected.push(source);
    }
    return selected;
  });
}
