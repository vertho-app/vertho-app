export const BEHAVIORAL_REPORT_SCHEMA_VERSION = 'natural-only-v1';

export function isCurrentBehavioralReport(value: unknown): boolean {
  return !!value
    && typeof value === 'object'
    && (value as Record<string, unknown>)._schema_version === BEHAVIORAL_REPORT_SCHEMA_VERSION;
}
