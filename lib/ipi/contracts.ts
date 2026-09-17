import { z } from 'zod';

export const ipiRequestSchema = z.object({
  message: z.string().trim().min(1).max(2400),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(6500) }).strict()).max(10).default([]),
  pathname: z.string().max(240).regex(/^\/admin(?:-v2)?(?:\/[a-zA-Z0-9_/-]*)?$/),
  empresaId: z.string().uuid().nullable().default(null),
}).strict();

export const ipiPlanSchema = z.object({
  searches: z.array(z.string().max(160)).max(3).default([]),
  data: z.array(z.enum(['resumo', 'colaboradores', 'cargos', 'competencias', 'trilhas', 'relatorios'])).max(3).default([]),
  person: z.string().max(100).default(''),
}).strict();

export type IpiRequest = z.infer<typeof ipiRequestSchema>;
export type IpiPlan = z.infer<typeof ipiPlanSchema>;
export type IpiSource = { id: string; kind: 'manual' | 'codigo' | 'dados'; title: string; reference: string; href?: string };
export type IpiEvidence = IpiSource & { text: string };
export type IpiReply = { answer: string; sources: IpiSource[]; consultedAt: string };
export type KnowledgeChunk = { kind: 'manual' | 'codigo'; title: string; reference: string; route?: string; text: string };
export type KnowledgeIndex = { version: 1; digest: string; chunks: KnowledgeChunk[] };

/** E-mail validado pela sessão; nunca aceitar identidade enviada no body. */
export function isIpiEmail(email?: string | null): boolean {
  const value = email?.trim().toLowerCase() || '';
  return /^[^\s@]+@vertho\.ai$/.test(value) && !value.endsWith('.demo@vertho.ai');
}

export function safeIpiHref(route: string | undefined, empresaId: string | null): string | undefined {
  if (!route || !/^\/admin(?:-v2)?(?:\/|$)/.test(route) || /[\\?#\s.]|\/\//.test(route)) return;
  const resolved = empresaId ? route.replace('[empresaId]', empresaId) : route;
  if (/[\[\]]/.test(resolved)) return;
  return resolved;
}
