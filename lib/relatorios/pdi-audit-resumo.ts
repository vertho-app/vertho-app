/**
 * O veredito da auditoria do PDI, na forma que a tela do operador lê.
 *
 * 🔴 POR QUE EXISTE (25/09/2026): a auditoria roda em todo PDI desde 27/08 e
 * grava o veredito em `relatorios.conteudo.auditoria`, mas NENHUMA tela, PDF ou
 * regra de saúde o lia. Auditoria sem leitor é auditoria que não existe. O lugar
 * escolhido é a aba Planos do painel do cliente, onde a equipe decide mandar o
 * aviso de plano pronto.
 *
 * Puro (sem I/O): quem busca as linhas é a action.
 */
import type { PdiAuditStatus } from './pdi-audit';

export interface PendenciaAuditoria {
  titulo: string;
  status: PdiAuditStatus;
  /** Trechos que motivaram o achado, como o auditor os citou. */
  ocorrencias: string[];
}

export interface ItemAuditoriaPlano {
  colaboradorId: string;
  nome: string;
  /** `null` = PDI sem auditoria (gerado antes de 27/08 ou auditoria ilegível). */
  status: PdiAuditStatus | null;
  resumo: string | null;
  geradoEm: string | null;
  /** Só o que não passou: é o que alguém precisa ler. */
  pendencias: PendenciaAuditoria[];
}

export interface ResumoAuditoriaPlanos {
  /** Denominador: PDIs individuais do tenant. */
  total: number;
  pass: number;
  warn: number;
  fail: number;
  semAuditoria: number;
  itens: ItemAuditoriaPlano[];
}

const STATUS = new Set<PdiAuditStatus>(['pass', 'warn', 'fail']);
const ORDEM: Record<string, number> = { fail: 0, warn: 1, pass: 2, nulo: 3 };
const MAX_OCORRENCIAS = 6;
const MAX_CHARS = 220;

export function resumirAuditoriaPlanos(
  linhas: Array<{ colaborador_id: string; gerado_em?: string | null; auditoria?: any }>,
  nomes: Map<string, string>,
): ResumoAuditoriaPlanos {
  const itens: ItemAuditoriaPlano[] = (linhas || []).map((l) => {
    const a = l.auditoria && typeof l.auditoria === 'object' ? l.auditoria : null;
    const status = a && STATUS.has(a.status) ? (a.status as PdiAuditStatus) : null;
    const checks: any[] = Array.isArray(a?.checks) ? a.checks : [];
    return {
      colaboradorId: l.colaborador_id,
      nome: nomes.get(l.colaborador_id) || '(sem nome)',
      status,
      resumo: status ? String(a?.resumo ?? '') || null : null,
      geradoEm: l.gerado_em ?? null,
      pendencias: checks
        .filter((c) => c && c.status !== 'pass' && STATUS.has(c.status))
        .map((c) => ({
          titulo: String(c.titulo || c.id || 'achado'),
          status: c.status as PdiAuditStatus,
          ocorrencias: (Array.isArray(c.ocorrencias) ? c.ocorrencias : [])
            .slice(0, MAX_OCORRENCIAS)
            .map((o: unknown) => String(o).slice(0, MAX_CHARS)),
        })),
    };
  });

  itens.sort((x, y) => (ORDEM[x.status ?? 'nulo'] - ORDEM[y.status ?? 'nulo']) || x.nome.localeCompare(y.nome));
  const conta = (s: PdiAuditStatus) => itens.filter((i) => i.status === s).length;
  return {
    total: itens.length,
    pass: conta('pass'),
    warn: conta('warn'),
    fail: conta('fail'),
    semAuditoria: itens.filter((i) => i.status === null).length,
    itens,
  };
}
