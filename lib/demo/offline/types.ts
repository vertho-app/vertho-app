export type OfflineAsset = {
  path: string;
  source: string;
  bytes: number;
  sha256: string;
  type: string;
  label: string;
};
export type OfflinePackage = { version: string; assets: OfflineAsset[] };
export type ReportValue =
  | string
  | number
  | boolean
  | null
  | ReportValue[]
  | { [key: string]: ReportValue };
export type OfflinePerson = {
  key: string;
  name: string;
  role: string;
  unit: string;
  manager: string | null;
  disc: number[];
  profile: string;
  profileAvailable?: boolean;
  report: Record<string, ReportValue>;
  assessments: { competency: string; descriptor: string; score: number }[];
};
export type OfflineData = {
  capturedAt: string;
  totalWeeks: number;
  people: OfflinePerson[];
  weeks: {
    number: number;
    title: string;
    competency: string;
    challenge: string;
    evidence: string;
    formats: { key: string; title: string; path: string }[];
  }[];
  pdi: Record<string, ReportValue>;
  coordination: Record<string, ReportValue>;
  direction: Record<string, ReportValue>;
};
