/**
 * ONDE cada chave de configuração pode morar — a régua que torna o resolvedor
 * de `lib/turmas/config-efetiva.ts` verificável em vez de convencional.
 *
 * Sem esta lista, `sys_config` é JSONB livre em três níveis e nenhum guard
 * consegue afirmar nada: uma chave institucional (modelo de IA, branding)
 * poderia ser sobrescrita por turma sem que ninguém percebesse, e uma chave de
 * etapa continuaria só na empresa sem que ninguém cobrasse.
 *
 * ⚠️ NÃO É UM MERGE GENÉRICO, e o motivo é concreto: as flags de etapa são
 * BOOLEANAS. Um merge com `||` perde `false` — a turma nunca conseguiria
 * DESLIGAR o que a empresa ligou, que é exatamente metade do caso de uso
 * ("professores ainda não abrem o assessment que os diretores já fecharam").
 * Daí `escalar` usar `??` e cada chave declarar sua estratégia.
 */

/** Quem pode definir a chave. */
export type EscopoChave =
  /** Só a empresa. Valor em turma/participação é IGNORADO (e reportado). */
  | 'empresa'
  /** Cascata completa: participação → turma → empresa → default. */
  | 'turma';

/**
 * Como combinar quando mais de um nível define a chave.
 *  - `escalar`: o primeiro nível que define (≠ undefined) vence. `??`, nunca `||`.
 *  - `substitui`: array/objeto do nível mais específico substitui INTEIRO o de
 *    baixo. Concatenar competências de dois níveis produziria uma trilha que
 *    ninguém pediu.
 *  - `raso`: objeto mesclado CHAVE A CHAVE (a turma muda só o dia da pílula e
 *    herda o resto da cadência da empresa).
 */
export type EstrategiaChave = 'escalar' | 'substitui' | 'raso';

export interface SpecChave {
  escopo: EscopoChave;
  estrategia: EstrategiaChave;
  /** Por que mora nesse nível — lido por humano na revisão, não pelo código. */
  nota?: string;
}

export const SPEC_CONFIG: Record<string, SpecChave> = {
  // ── Etapa: o coração do problema das turmas ────────────────────────────
  perfil_comportamental_liberado: {
    escopo: 'turma', estrategia: 'escalar',
    nota: 'Uma turma abre o DISC enquanto a outra já passou dele.',
  },
  mapeamento_cenarios_liberado: {
    escopo: 'turma', estrategia: 'escalar',
    nota: 'Idem — é o gate do assessment.',
  },

  // ── Desenho do programa daquela safra ──────────────────────────────────
  programa_modo: {
    escopo: 'turma', estrategia: 'escalar',
    nota: 'Diretores em jornada de 7 semanas, professores em piloto: decisão da safra.',
  },
  competencias_regular_duo: {
    escopo: 'turma', estrategia: 'substitui',
    nota: 'Concatenar as competências de dois níveis geraria trilha que ninguém pediu.',
  },
  blueprint_drives_trilha: { escopo: 'turma', estrategia: 'escalar' },
  cadencia: {
    escopo: 'turma', estrategia: 'raso',
    nota: 'A turma muda o dia da pílula e herda o resto. ⚠️ Cadência PLANEJADA: a execução é serializada por remetente, não por turma (docs/TURMAS.md §7).',
  },

  // ── Institucional: divergir por turma não faz sentido ──────────────────
  ai: { escopo: 'empresa', estrategia: 'raso' },
  envios: { escopo: 'empresa', estrategia: 'raso' },
  perfil_externo_fonte: { escopo: 'empresa', estrategia: 'escalar' },
  default_locale: { escopo: 'empresa', estrategia: 'escalar' },
  modulos: {
    escopo: 'empresa', estrategia: 'raso',
    nota: 'O que a empresa CONTRATOU. O que a safra USA é a etapa instanciada — disponível ≠ instanciado.',
  },
  votacao_ativa: {
    escopo: 'empresa', estrategia: 'escalar',
    nota: '🔴 NÃO pode ser gate de turma: o resultado grava em cargos_empresa.top5_workshop, por CARGO e empresa-wide. Duas turmas do mesmo cargo votando disputariam o mesmo registro. Votação por turma exigiria versionar o perfil ideal (F1), que segue institucional.',
  },
};

/** Chaves que a turma (ou a participação) pode sobrescrever. */
export const CHAVES_DE_TURMA: string[] = Object.entries(SPEC_CONFIG)
  .filter(([, spec]) => spec.escopo === 'turma')
  .map(([chave]) => chave);

/** Chaves exclusivas da empresa. */
export const CHAVES_DE_EMPRESA: string[] = Object.entries(SPEC_CONFIG)
  .filter(([, spec]) => spec.escopo === 'empresa')
  .map(([chave]) => chave);

export function specDaChave(chave: string): SpecChave | undefined {
  return SPEC_CONFIG[chave];
}
