/**
 * EVIDÊNCIAS: o trecho da própria resposta que sustenta cada nível. Puro.
 *
 * `descriptor_assessments` guarda só a nota; o trecho, a confiança, a
 * sustentação e os limites vivem no JSONB `respostas.avaliacao_ia` que a IA4
 * devolve (`avaliacao_por_descritor[]`, ver `lib/ia4-avaliacao.ts`). O parecer
 * lê daqui. Uma nota sem trecho é opinião; com trecho é evidência citada.
 *
 * 🔑 O trecho é CONFERIDO contra a resposta (R-134, 03/10/2026). A IA4 pede
 * "trecho literal ou paráfrase fiel", e até aqui só o auditor de IA julgava se
 * ele existia; o parecer punha tudo entre aspas como "trecho da própria
 * resposta". Medido em 03/10/2026 (60 dias de IA4, todas as empresas): 1.877
 * de 2.208 trechos (85%) aparecem na resposta; os outros 331 não. Agora cada
 * trecho passa pelo verificador dos simuladores (`contemCitacao`, que equipara
 * aspas, reticências, travessões, espaços e caixa) contra R1 a R4, e só o que
 * confere sai como citação (`literal: true`). O resto é leitura da IA e a tela
 * mostra assim, sem aspas. Sem o texto das respostas, nada é literal: o lado
 * conservador.
 *
 * O veredito da 2ª IA (`respostas.status_ia4`) vem junto: uma avaliação em
 * `revisar` continua contando na matriz, mas o parecer avisa.
 */
import { stripCodigoDescritor } from '@/lib/descritores';
import { contemCitacao } from '@/lib/simuladores/citacao';
import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';

export type Auditoria = 'aprovado' | 'aprovado_com_ajustes' | 'revisar' | null;

export interface EvidenciaCitada {
  resposta: string;
  trecho: string;
  forca: string | null;
  /** O trecho confere com o texto de R1 a R4: só então vai entre aspas. */
  literal: boolean;
}

export interface EvidenciaDescritor {
  descritor: string;
  nota: number | null;
  /** Nível da nota pela régua oficial; é o que o cliente lê no lugar da nota. */
  nivel: Nivel | null;
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
  /** O texto das quatro respostas, para conferir os trechos citados. */
  r1?: string | null;
  r2?: string | null;
  r3?: string | null;
  r4?: string | null;
}

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v: unknown): string | null => { const s = String(v ?? '').trim(); return s || null; };
// Nota ausente vira 0 em `num(null)`: abaixo de 1 não é nota da régua, e o nível fica vazio.
const nivelOuNada = (nota: number | null): Nivel | null => (nota == null || nota < 1 ? null : nivelDaNota(nota));
const lista = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];

export function normalizarAuditoria(v: unknown): Auditoria {
  return v === 'aprovado' || v === 'aprovado_com_ajustes' || v === 'revisar' ? v : null;
}

function parseAvaliacao(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return typeof raw === 'object' ? (raw as Record<string, any>) : null;
}

/**
 * O trecho existe numa das quatro respostas? Confere primeiro na resposta que a
 * IA indicou e, se não achar, nas quatro: um trecho literal atribuído à
 * resposta vizinha continua sendo fala da pessoa.
 */
export function trechoLiteral(resp: RespostaAvaliada, marca: string, trecho: string): boolean {
  const respostas = [resp.r1, resp.r2, resp.r3, resp.r4];
  const m = /^R\s*([1-4])$/i.exec(String(marca || '').trim());
  if (m && contemCitacao(respostas[Number(m[1]) - 1], trecho)) return true;
  return respostas.some((r) => contemCitacao(r, trecho));
}

/** Extrai as evidências de UMA resposta avaliada. Sem avaliação → descritores vazios, nunca inventados. */
export function extrairEvidencias(resp: RespostaAvaliada): EvidenciasCompetencia {
  const av = parseAvaliacao(resp.avaliacao_ia);
  const porDesc: any[] = Array.isArray(av?.avaliacao_por_descritor) ? av!.avaliacao_por_descritor : [];
  const descritores: EvidenciaDescritor[] = porDesc.map((d) => ({
    descritor: stripCodigoDescritor(String(d?.nome ?? '')) || `D${d?.numero ?? ''}`,
    nota: num(d?.nota_decimal),
    nivel: nivelOuNada(num(d?.nota_decimal)),
    nivelSugerido: num(d?.nivel_sugerido),
    confianca: num(d?.confianca),
    sustentacao: str(d?.sustentacao),
    evidencias: (Array.isArray(d?.evidencias) ? d.evidencias : [])
      .map((e: any) => {
        const resposta = str(e?.resposta) || '';
        const trecho = str(e?.trecho) || '';
        return { resposta, trecho, forca: str(e?.forca_evidencia), literal: !!trecho && trechoLiteral(resp, resposta, trecho) };
      })
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
