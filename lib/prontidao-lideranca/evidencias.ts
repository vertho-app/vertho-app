/**
 * EVIDÊNCIAS: o trecho da própria resposta que sustenta cada nota. Puro.
 *
 * `descriptor_assessments` guarda só a nota; o trecho literal, a confiança, a
 * sustentação e os limites vivem no JSONB `respostas.avaliacao_ia` que a IA4
 * devolve (`avaliacao_por_descritor[]`, ver `lib/ia4-avaliacao.ts`). O parecer
 * lê daqui. Uma nota sem trecho é opinião; com trecho é evidência citada.
 *
 * O veredito da 2ª IA (`respostas.status_ia4`) vem junto: uma avaliação em
 * `revisar` continua contando na matriz, mas o parecer avisa.
 */
import { stripCodigoDescritor } from '@/lib/descritores';

export type Auditoria = 'aprovado' | 'aprovado_com_ajustes' | 'revisar' | null;

export interface EvidenciaCitada {
  resposta: string;
  trecho: string;
  forca: string | null;
}

export interface EvidenciaDescritor {
  descritor: string;
  nota: number | null;
  nivelSugerido: number | null;
  confianca: number | null;
  sustentacao: string | null;
  evidencias: EvidenciaCitada[];
  limites: string[];
  racional: string | null;
}

export interface EvidenciasCompetencia {
  respostaId: string | null;
  competenciaId: string | null;
  competencia: string;
  auditoria: Auditoria;
  avaliadoEm: string | null;
  feedback: string | null;
  descritores: EvidenciaDescritor[];
}

export interface RespostaAvaliada {
  id?: string | null;
  competencia_id?: string | null;
  competencia_nome?: string | null;
  avaliacao_ia?: unknown;
  status_ia4?: string | null;
  avaliado_em?: string | null;
  feedback_ia4?: string | null;
}

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v: unknown): string | null => { const s = String(v ?? '').trim(); return s || null; };
const lista = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];

export function normalizarAuditoria(v: unknown): Auditoria {
  return v === 'aprovado' || v === 'aprovado_com_ajustes' || v === 'revisar' ? v : null;
}

function parseAvaliacao(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return typeof raw === 'object' ? (raw as Record<string, any>) : null;
}

/** Extrai as evidências de UMA resposta avaliada. Sem avaliação → descritores vazios, nunca inventados. */
export function extrairEvidencias(resp: RespostaAvaliada): EvidenciasCompetencia {
  const av = parseAvaliacao(resp.avaliacao_ia);
  const porDesc: any[] = Array.isArray(av?.avaliacao_por_descritor) ? av!.avaliacao_por_descritor : [];
  const descritores: EvidenciaDescritor[] = porDesc.map((d) => ({
    descritor: stripCodigoDescritor(String(d?.nome ?? '')) || `D${d?.numero ?? ''}`,
    nota: num(d?.nota_decimal),
    nivelSugerido: num(d?.nivel_sugerido),
    confianca: num(d?.confianca),
    sustentacao: str(d?.sustentacao),
    evidencias: (Array.isArray(d?.evidencias) ? d.evidencias : [])
      .map((e: any) => ({ resposta: str(e?.resposta) || '', trecho: str(e?.trecho) || '', forca: str(e?.forca_evidencia) }))
      .filter((e: EvidenciaCitada) => e.trecho),
    limites: lista(d?.limites_da_evidencia),
    racional: str(d?.racional),
  }));
  const feedback = str(resp.feedback_ia4) || str(av?.feedback?.resumo_geral) || str(av?.resumo_geral) || null;
  return {
    respostaId: str(resp.id),
    competenciaId: str(resp.competencia_id),
    competencia: str(resp.competencia_nome) || str(av?.competencia?.nome) || '',
    auditoria: normalizarAuditoria(resp.status_ia4),
    avaliadoEm: str(resp.avaliado_em),
    feedback,
    descritores,
  };
}

/** Alguma avaliação com o veredito `revisar` da 2ª IA. */
export function auditoriaPendente(respostas: { status_ia4?: string | null }[]): boolean {
  return respostas.some((r) => normalizarAuditoria(r.status_ia4) === 'revisar');
}
