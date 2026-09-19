/**
 * DEVOLUTIVA MÍNIMA do fechamento (19/09/2026).
 *
 * Quando o código muda a nota depois do scorer (ajuste da arguição, piso do
 * piloto) e a redação final não consegue reescrever o texto (falhou nas duas
 * tentativas ou não coube no prazo), publicar o rascunho do scorer devolvia à
 * pessoa exatamente o defeito que a redação existe para evitar: um texto escrito
 * para a nota de antes. Aqui o texto é montado a partir das NOTAS FINAIS, sem IA:
 * mais curto, mas coerente por construção. A redação completa pode ser refeita
 * depois, sem nova nota (`refazerRedacaoFechamento`).
 *
 * Modelo de texto aprovado pelo dono em 19/09/2026 ("Os pontos em que você mais
 * avançou foram A e B. O que mais pede atenção agora é C."). Do rascunho ficam só
 * as evidências citadas (trechos das respostas) e os próximos passos (práticas
 * que a pessoa demonstrou): nenhum dos dois ordena os aspectos, então o ajuste
 * da nota não os contradiz.
 *
 * Piloto: a janela curta não mede evolução, então o texto fala do que está mais
 * sólido, nunca de avanço (mesma proibição do prompt do scorer).
 */
import { descritorParaHumano } from '@/lib/descritor-humano';
import { normalizarPassos } from './prompts/evolution-scenario';
import type { ResumoRedigido } from './prompts/fechamento-redacao';

export interface DescritorComNotaFinal {
  descritor: string;
  nota_pre: number | null;
  nota_final: number | null;
}

export interface DevolutivaMinimaParams {
  /** Alias mascarado: o caller desmascara depois, como o resto do resumo. */
  nomeColab: string;
  competencia: string;
  isPiloto: boolean;
  descritores: DescritorComNotaFinal[];
  /** `resumo_avaliacao` do scorer: dele saem evidências citadas e próximos passos. */
  rascunho: any;
}

const round1 = (v: number) => Math.round(Number(v.toFixed(10)) * 10) / 10;

function avanco(d: DescritorComNotaFinal): number | null {
  return typeof d.nota_final === 'number' && typeof d.nota_pre === 'number' ? round1(d.nota_final - d.nota_pre) : null;
}

// A pessoa lê o NOME do comportamento, nunca o código da matriz (`COO03_D1 — …`).
const nome = (d: DescritorComNotaFinal) => descritorParaHumano(d.descritor);
const juntar = (itens: string[]) => (itens.length === 2 ? `${itens[0]} e ${itens[1]}` : itens[0]);

/**
 * Devolve `null` quando não há aspecto com nota final (nada a ordenar): o
 * caller mantém o rascunho e a degradação fica registrada.
 */
export function devolutivaMinima(p: DevolutivaMinimaParams): ResumoRedigido | null {
  const comNota = p.descritores.filter((d) => typeof d.nota_final === 'number' && nome(d));
  if (!comNota.length) return null;

  // Ordem: maior avanço final primeiro (desempate pela nota final e pelo nome);
  // sem avanço positivo em ninguém, ou no piloto, a ordem é pela nota final.
  const porAvanco = !p.isPiloto && comNota.some((d) => (avanco(d) ?? 0) > 0);
  const ordenados = [...comNota].sort((a, b) => {
    if (porAvanco) {
      const diff = (avanco(b) ?? -Infinity) - (avanco(a) ?? -Infinity);
      if (diff !== 0) return diff;
    }
    const porNota = (b.nota_final as number) - (a.nota_final as number);
    return porNota !== 0 ? porNota : nome(a).localeCompare(nome(b), 'pt-BR');
  });

  const n = ordenados.length;
  const topo = ordenados.slice(0, n >= 3 ? 2 : 1).map(nome);
  const atencao = n >= 2 ? nome(ordenados[n - 1]) : null;
  const plural = topo.length === 2;

  const abertura = p.isPiloto
    ? `${p.nomeColab}, este é o resultado da demonstração em ${p.competencia}.`
    : `${p.nomeColab}, este é o resultado do fechamento da sua jornada em ${p.competencia}.`;
  const destaque = porAvanco
    ? (plural ? `Os pontos em que você mais avançou foram ${juntar(topo)}.` : `O ponto em que você mais avançou foi ${topo[0]}.`)
    : (plural ? `Os pontos mais sólidos foram ${juntar(topo)}.` : `O ponto mais sólido foi ${topo[0]}.`);
  const pedeAtencao = atencao ? `O que mais pede atenção agora é ${atencao}.` : '';

  const fecho = p.isPiloto
    ? `Você leva desta demonstração um retrato do seu ponto de partida em ${p.competencia}.${atencao ? ` O maior espaço para crescer está em ${atencao}.` : ''}`
    : `Você leva desta jornada o que praticou em ${topo[0]}.${atencao ? ` O próximo passo é continuar trabalhando ${atencao}, que é onde está o maior espaço para crescer.` : ''}`;

  const rascunho = p.rascunho && typeof p.rascunho === 'object' ? p.rascunho : {};
  return {
    mensagem_geral: [abertura, destaque, pedeAtencao].filter(Boolean).join(' '),
    evidencias_citadas: Array.isArray(rascunho.evidencias_citadas)
      ? rascunho.evidencias_citadas.filter((e: unknown) => typeof e === 'string' && e.trim())
      : [],
    principal_avanco: porAvanco ? `${topo[0]}: foi onde você mais avançou.` : `${topo[0]}: é o seu ponto mais sólido.`,
    principal_ponto_de_atencao: atencao ? `${atencao}: é o que mais pede atenção agora.` : '',
    mensagem_final: fecho,
    proximos_passos: normalizarPassos(rascunho.proximos_passos),
  };
}
