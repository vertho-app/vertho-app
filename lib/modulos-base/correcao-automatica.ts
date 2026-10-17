/**
 * CORREÇÃO AUTOMÁTICA dos módulos-base recém-gerados de um manuscrito (decisão do dono, 17/10/2026, 4Life: "corrigir a
 * origem", em vez de refazer à mão depois).
 *
 * Medido na 4Life (51 módulos de COMT01 e LID02): 6 vieram com um bloco INTEIRO vazio (`conteudo_central` ou
 * `conteudo_aplicavel` = `{}`: a geração cortou) e 11 reprovaram por coerência (gênero marcado, "3º ano" na Educação
 * Infantil, sigilo contraditório). À mão: o vazio foi obsoletado e regerado do manuscrito (o refino parte do conteúdo
 * existente e não preenche bloco vazio); o resto, refinado (2 rodadas fecharam todos). Aqui as duas coisas rodam no fim
 * do job, depois da auditoria:
 *  · bloco vazio → `regerar` (o job gera a MESMA transição de novo, grava o novo, audita e obsoleta o vazio);
 *  · reprovado com conteúdo → `refinar` (`refinarModuloCore`, que reverte sozinho se a nota cair).
 * Até `MAX_CORRECOES_MODULO` tentativas por módulo, nesta execução. O que sobra continua reprovado e não é publicado.
 */
export const MAX_CORRECOES_MODULO = 2;

/** Bloco sem conteúdo de verdade: vazio, `{}`, `[]` ou só pontuação. PURO. */
export function blocoVazio(v: unknown): boolean {
  const texto = typeof v === 'string' ? v : JSON.stringify(v ?? '');
  return texto.replace(/[\s"{}[\],:]/g, '').length < 20;
}

export interface ModuloParaCorrigir {
  id: string;
  status: string | null;
  conteudo_central: unknown;
  conteudo_aplicavel: unknown;
  auditoria_ia: { veredito?: string } | null;
}

export type DiagnosticoModulo = 'ok' | 'vazio' | 'reprovado' | 'sem-auditoria';

/** O que fazer com UM módulo: regerar (bloco vazio), refinar (reprovado com conteúdo) ou nada. PURO. */
export function diagnosticarModulo(m: ModuloParaCorrigir): DiagnosticoModulo {
  if (blocoVazio(m.conteudo_central) || blocoVazio(m.conteudo_aplicavel)) return 'vazio';
  if (!m.auditoria_ia) return 'sem-auditoria';
  return m.auditoria_ia.veredito === 'reprovado' ? 'reprovado' : 'ok';
}

export interface DepsCorrecaoModulos {
  ler(id: string): Promise<ModuloParaCorrigir | null>;
  /** Gera de novo a mesma transição, grava e audita o novo, obsoleta o vazio. Devolve o id NOVO (ou null). */
  regerar(m: ModuloParaCorrigir): Promise<string | null>;
  /** Refina UM módulo reprovado (reaudita; reverte se piorar). */
  refinar(id: string): Promise<void>;
  aoAvancar?(texto: string): Promise<void> | void;
}

export interface ResultadoCorrecaoModulos {
  /** Os ids finais dos módulos do job (o regerado entra no lugar do vazio). */
  ids: string[];
  regerados: number;
  refinados: number;
  /** Ids que terminaram vazios ou reprovados. */
  seguem: string[];
}

/** Corrige os módulos de um job, um a um. Falha de um não para os outros. */
export async function corrigirModulosGerados(ids: string[], deps: DepsCorrecaoModulos): Promise<ResultadoCorrecaoModulos> {
  const finais: string[] = [];
  let regerados = 0; let refinados = 0;
  const seguem: string[] = [];
  for (const idOriginal of ids) {
    let id = idOriginal;
    let ok = false;
    try {
      for (let t = 0; t <= MAX_CORRECOES_MODULO; t++) {
        const m = await deps.ler(id);
        if (!m || m.status === 'obsoleto') break;
        const d = diagnosticarModulo(m);
        if (d === 'ok' || d === 'sem-auditoria') { ok = d === 'ok'; break; }
        if (t === MAX_CORRECOES_MODULO) break;
        if (d === 'vazio') {
          await deps.aoAvancar?.(`regerando módulo com bloco vazio (${t + 1}/${MAX_CORRECOES_MODULO})…`);
          const novo = await deps.regerar(m);
          if (!novo) continue;
          id = novo; regerados++;
        } else {
          await deps.aoAvancar?.(`refinando módulo reprovado (${t + 1}/${MAX_CORRECOES_MODULO})…`);
          await deps.refinar(id); refinados++;
        }
      }
    } catch (e: any) {
      console.warn(`[correcao-modulos] ${id.slice(0, 8)}: ${String(e?.message || e).slice(0, 160)}`);
    }
    finais.push(id);
    if (!ok) seguem.push(id);
  }
  return { ids: finais, regerados, refinados, seguem };
}
