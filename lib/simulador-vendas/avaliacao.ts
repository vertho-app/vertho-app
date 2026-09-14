import type { Estado, Saidas } from './schema';
import { REGUA_VERSION } from './schema';

export const PILAR_POR_FASE = { preparar: 'P', analisar: 'A', cocriar: 'C', engajar: 'E' } as const;
export const PENALIDADE = { leve: 0.5, moderada: 1.5, grave: 2.5 } as const;

export function violacoesRegistradas(s: Estado): Saidas['gerente']['Violacoes'] {
  const vistos = new Set<number>();
  return s.moderacoes
    .filter((m) => m.violacao)
    .map((m) => {
      if (
        !m.categoria ||
        !m.severidade ||
        !m.motivo ||
        !PILAR_POR_FASE[m.fase] ||
        vistos.has(m.turno) ||
        !s.mensagens.some((f) => f.autor === 'vendedor' && f.turno === m.turno && f.fase === m.fase)
      ) {
        throw new Error('Registro de moderação inconsistente');
      }
      vistos.add(m.turno);
      return {
        turno: m.turno,
        fase: m.fase,
        categoria: m.categoria,
        severidade: m.severidade,
        motivo: m.motivo,
        pilar_penalizado: PILAR_POR_FASE[m.fase],
        reducao_aplicada: PENALIDADE[m.severidade],
      };
    });
}

/** Executada uma única vez após recuperar/validar o checkpoint BRUTO do gerente. */
export function pontuarRelatorio(bruto: Saidas['gerente'], s: Estado): Saidas['gerente'] {
  const r = structuredClone(bruto);
  if (s.versaoRegua === REGUA_VERSION) {
    r.Violacoes = violacoesRegistradas(s);
    for (const v of r.Violacoes) {
      const antes = r[v.pilar_penalizado];
      r[v.pilar_penalizado] = Math.max(0.5, antes - v.reducao_aplicada);
      v.reducao_aplicada = antes - r[v.pilar_penalizado];
    }
  }
  r.Media = Math.max(0.5, Math.round((r.P + r.A + r.C + r.E) / 2) / 2);
  return r;
}

export function validarModeracao(m: Saidas['moderador']) {
  if (
    m.violacao &&
    (!m.categoria || !m.severidade || !m.confianca || !m.acao_sugerida || !m.motivo?.trim())
  ) {
    throw new Error('Violação sem classificação completa');
  }
}

export function validarFalaCliente(fala: string) {
  // Metadados reservados não são diálogo. Valores comerciais isolados NÃO são bloqueados:
  // preço e necessidades podem ser legitimamente revelados ao negociar.
  if (
    /\b(?:minimo_aceitavel|gatilho_revelacao|gatilho_descoberta|nota_corte_objecao|nota_corte_preco|contexto_gerente|violacoes_moderador|thread_completa)\b/i.test(
      fala,
    ) ||
    /<\/?(?:system|developer|gabarito|bloco_dinamico|personagem_json|instrucoes_reservadas)\b/i.test(fala)
  ) {
    throw new Error('Resposta contém estrutura reservada da simulação');
  }
}
