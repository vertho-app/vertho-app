/**
 * Quais formatos o KIT de uma célula (tema × cargo × DISC) leva, a partir das preferências de aprendizagem de quem está nela.
 *
 * Decisão do dono (02/10/2026): o kit inclui só os DOIS primeiros formatos escolhidos na tela de preferências, entre os
 * quatro que o kit produz (vídeo, áudio, texto, estudo de caso; infográfico, simulador e mentoria não são formatos de kit).
 * Como o kit é COMPARTILHADO pela célula e a preferência é individual, vale a UNIÃO dos "2 primeiros" de cada pessoa:
 * ninguém fica sem o seu principal, e a célula não gera o que ninguém pediu. Quem não respondeu a tela (ou só marcou
 * formatos que o kit não produz) conta como "sem preferência" e recebe texto + estudo de caso, os dois formatos
 * baratos que já têm arquivo pronto (sem TTS, sem vídeo).
 *
 * A leitura de CADA pessoa reusa `derivarPrioridadeFormatos` (a mesma da trilha e da pílula): vídeo = o maior entre curto
 * e longo, desempate na ordem fixa vídeo, texto, áudio, caso. Estrelas antigas (1 a 5, com empate) e a ordenação nova
 * (1 a 7, sem empate) funcionam igual porque a comparação é só DENTRO da pessoa.
 */
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';

export type FormatoKit = 'audio' | 'texto' | 'case';
export const ORDEM_FORMATOS_KIT: FormatoKit[] = ['audio', 'texto', 'case'];
export const FORMATOS_SEM_PREFERENCIA: FormatoKit[] = ['texto', 'case'];

const COLUNAS_DO_KIT = ['pref_video_curto', 'pref_video_longo', 'pref_texto', 'pref_audio', 'pref_estudo_caso'] as const;
export const COLUNAS_PREFERENCIA_KIT = COLUNAS_DO_KIT.join(', ');

/** A pessoa declarou alguma preferência por um dos 4 formatos do kit? */
export function temPreferenciaDoKit(colab: any): boolean {
  return COLUNAS_DO_KIT.some((c) => Number(colab?.[c]) > 0);
}

/** Os dois primeiros formatos da pessoa (entre vídeo, áudio, texto e caso). `null` = sem preferência declarada. */
export function topDoisFormatos(colab: any): Array<'video' | FormatoKit> | null {
  if (!temPreferenciaDoKit(colab)) return null;
  return derivarPrioridadeFormatos(colab).slice(0, 2) as Array<'video' | FormatoKit>;
}

/**
 * A pessoa tem o VÍDEO entre os 2 primeiros formatos? Decide quem recebe a saudação nominal numa célula de kit nascido da
 * regra das preferências. A versão do worker da Hetzner (`worker-hetzner/saudacao.mjs`) é idêntica e travada por teste.
 */
export function videoNoTopDois(colab: any): boolean {
  return !!topDoisFormatos(colab)?.includes('video');
}

export interface FormatosDaCelula {
  /** Formatos de conteúdo (texto, caso, roteiro de podcast) que o kit gera. */
  formatos: FormatoKit[];
  /** O vídeo da célula entra no kit? */
  video: boolean;
  /** Quantas pessoas da célula não declararam preferência (entraram com texto + caso). */
  semPreferencia: number;
}

export function formatosDaCelula(pessoas: any[]): FormatosDaCelula {
  const conteudo = new Set<FormatoKit>();
  let video = false;
  let semPreferencia = 0;
  for (const p of pessoas) {
    const top = topDoisFormatos(p);
    if (!top) { semPreferencia++; for (const f of FORMATOS_SEM_PREFERENCIA) conteudo.add(f); continue; }
    for (const f of top) { if (f === 'video') video = true; else conteudo.add(f); }
  }
  // Célula vazia (não deveria ocorrer): o mesmo default de quem não respondeu.
  if (!pessoas.length) for (const f of FORMATOS_SEM_PREFERENCIA) conteudo.add(f);
  return { formatos: ORDEM_FORMATOS_KIT.filter((f) => conteudo.has(f)), video, semPreferencia };
}
