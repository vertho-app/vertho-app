/**
 * REDAÇÃO FINAL da devolutiva do fechamento (18/09/2026).
 *
 * O scorer escreve a devolutiva junto com a nota. Depois dele, o CÓDIGO muda a
 * nota: o ajuste da arguição (±0,5, `fusao-arguicao.ts`) e, no piloto, o piso no
 * ponto de partida (`piloto-trava.ts`). O texto ficava escrito para a nota de
 * antes. `Medido:` no ensaio da Jornada, "principal avanço" era o 1º de 6
 * descritores antes do ajuste e o ÚLTIMO depois, único "evolução parcial" na
 * tela; em Ibipeba, 11 de 11 fechamentos saíram com erro grave do auditor pela
 * mesma diferença.
 *
 * Aqui a nota já está decidida e não muda: esta chamada só reescreve o texto
 * que a pessoa lê para que ele diga o mesmo que as notas finais. O scorer
 * continua julgando o cenário sem saber da arguição, para os dois instrumentos
 * seguirem independentes.
 *
 * PURO: monta prompt e valida a saída. Quem chama é `pontuarFechamento`, só
 * quando alguma nota mudou depois do texto. Insumos chegam mascarados de PII.
 */
import { normalizarPassos, regrasDaDevolutiva, tomDevolutivaPorPerfil } from './evolution-scenario';

export interface DescritorParaRedacao {
  descritor: string;
  nota_pre: number | null;
  /** A nota com que o rascunho foi escrito (a do scorer). */
  nota_rascunho: number | null;
  /** A nota que vai para a tela, depois do ajuste da arguição e do piso do piloto. */
  nota_final: number | null;
  sustentacao_arguicao?: string | null;
  forca_arguicao?: string | null;
  citacao_arguicao?: string | null;
  piso_aplicado?: boolean;
  justificativa?: string | null;
}

export interface LeituraDaArguicao {
  leitura_geral?: string | null;
  sustentacao_mais_forte?: string | null;
  fragilidade_mais_relevante?: string | null;
}

export interface PromptRedacaoFechamentoParams {
  competencia: string;
  /** Alias mascarado: o texto volta com ele e o caller desmascara. */
  nomeColab: string;
  perfilDominante?: string | null;
  semanasEvidencia: number;
  notaPrograma: string;
  descritores: DescritorParaRedacao[];
  /** `resumo_avaliacao` do scorer, já validado. */
  rascunho: unknown;
  arguicao?: LeituraDaArguicao | null;
  /**
   * As MESMAS evidências das semanas que o scorer recebeu (mascaradas). Sem
   * elas, a regra herdada "cite evidência das semanas" empurrava o modelo a
   * inventar. `Medido:` ensaio de 18/09 sem registros das semanas: o rascunho
   * dizia que não havia registros; a redação escreveu "você construiu ao longo
   * dessas seis semanas" e "o ponto mais forte da jornada".
   */
  evidenciasSemanas?: string | null;
}

export interface ResumoRedigido {
  mensagem_geral: string;
  evidencias_citadas: string[];
  principal_avanco: string;
  principal_ponto_de_atencao: string;
  mensagem_final: string;
  proximos_passos: string[];
}

const nota = (v: number | null | undefined) => (typeof v === 'number' ? v.toFixed(1).replace('.', ',') : 'sem nota');

function avancoFinal(d: DescritorParaRedacao): number | null {
  return typeof d.nota_final === 'number' && typeof d.nota_pre === 'number'
    ? Math.round((d.nota_final - d.nota_pre) * 10) / 10
    : null;
}

/** Do maior para o menor avanço final; sem avanço calculável, por último. */
export function ordenarPorAvancoFinal(descritores: DescritorParaRedacao[]): DescritorParaRedacao[] {
  return [...descritores].sort((a, b) => {
    const da = avancoFinal(a);
    const db = avancoFinal(b);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    if (db !== da) return db - da;
    return (b.nota_final ?? 0) - (a.nota_final ?? 0);
  });
}

function linhaDoDescritor(d: DescritorParaRedacao, i: number): string {
  const av = avancoFinal(d);
  const partes = [
    `${i + 1}. ${d.descritor}: início ${nota(d.nota_pre)}, final ${nota(d.nota_final)}`
      + (av != null ? ` (avanço final ${av > 0 ? '+' : ''}${nota(av)})` : '') + '.',
  ];
  if (d.nota_rascunho !== d.nota_final) partes.push(`O rascunho foi escrito com ${nota(d.nota_rascunho)}.`);
  const sustentou = (d.sustentacao_arguicao || '').trim();
  if (sustentou && sustentou !== 'sem_sinal') {
    const forca = d.forca_arguicao ? `, força ${d.forca_arguicao}` : '';
    const citacao = d.citacao_arguicao ? `: "${d.citacao_arguicao}"` : '';
    partes.push(`Na defesa oral, ${sustentou}${forca}${citacao}.`);
  }
  if (d.piso_aplicado) partes.push('Piso do piloto aplicado: a nota final é o ponto de partida.');
  return partes.join(' ');
}

/**
 * As regras do texto são as MESMAS do scorer (`regrasDaDevolutiva`). Só a
 * pontuação muda aqui: aquele bloco usa travessão, e esta redação pede texto
 * sem travessão; deixar o exemplo contradizer a regra faz o modelo seguir o
 * exemplo.
 */
function regrasSemTravessao(texto: string): string {
  return texto.replace(/\s[—–]\s/g, ': ');
}

export function promptRedacaoFechamento(p: PromptRedacaoFechamentoParams): { system: string; user: string } {
  const tomDevol = tomDevolutivaPorPerfil(p.perfilDominante);
  const regras = regrasSemTravessao(regrasDaDevolutiva({
    nomeColab: p.nomeColab,
    semanasEvidencia: p.semanasEvidencia,
    notaPrograma: p.notaPrograma,
    tomDevol,
  }));

  const system = `Você é o redator da devolutiva final da Vertho.

A avaliação de cada aspecto JÁ ESTÁ DECIDIDA. Depois que ela foi escrita, o sistema ajustou algumas notas: pelo que ${p.nomeColab} sustentou ou não na defesa oral da resposta ao cenário e, no piloto, pelo piso no ponto de partida. O rascunho da devolutiva foi escrito ANTES desses ajustes e pode contradizer as notas finais.

Sua tarefa: reescrever a devolutiva para que ela diga o mesmo que as notas FINAIS.

REGRAS DA REESCRITA:
1. As notas finais são a referência. Não as altere, não as discuta e não escreva números de nota nem níveis no texto.
2. principal_avanco sai de um dos primeiros aspectos da lista (maior avanço final). principal_ponto_de_atencao sai de um dos últimos ou de onde a defesa oral mostrou fragilidade.
3. Onde a defesa oral aprofundou ou fragilizou um aspecto, a mensagem_geral pode dizer isso em linguagem simples, falando com ${p.nomeColab} ("quando você explicou por que...").
4. Preserve do rascunho o que continua verdadeiro: o tom, as evidências citadas e os próximos passos que ainda fazem sentido. Mude só o que as notas finais contradizem.
5. Nenhum campo usa termo interno: "descritor", "régua", "acumulado", "triangulação", "arguição", "nota", "N1", "N2", "N3", "N4".
6. Não use travessão. Use vírgula, dois pontos ou ponto final.
7. Só diga o que ${p.nomeColab} fez ou construiu ao longo das semanas se estiver nas EVIDÊNCIAS DAS SEMANAS. Se elas vierem vazias, fale só do que apareceu no cenário e na defesa oral, diga em linguagem simples que a leitura se apoia nesses dois momentos, e a regra de citar evidência das semanas não se aplica.
8. Se o rascunho reconhece um limite da leitura, mantenha o reconhecimento em linguagem simples.
9. Não compare ${p.nomeColab} com outras pessoas nem use superlativo sem base ("raro", "excepcional", "o ponto mais forte da jornada").

${regras}

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

  const ordenados = ordenarPorAvancoFinal(p.descritores);
  const arg = p.arguicao || {};
  const leitura = [
    arg.leitura_geral ? `- Leitura geral: ${arg.leitura_geral}` : '',
    arg.sustentacao_mais_forte ? `- O que ${p.nomeColab} sustentou melhor: ${arg.sustentacao_mais_forte}` : '',
    arg.fragilidade_mais_relevante ? `- Fragilidade mais relevante: ${arg.fragilidade_mais_relevante}` : '',
  ].filter(Boolean).join('\n');
  const justificativas = ordenados
    .filter((d) => d.justificativa)
    .map((d) => `- ${d.descritor}: ${d.justificativa}`)
    .join('\n');

  const evidenciasSemanas = (p.evidenciasSemanas || '').trim();
  const user = `COMPETÊNCIA: ${p.competencia}

ASPECTOS, DO MAIOR PARA O MENOR AVANÇO FINAL:
${ordenados.map(linhaDoDescritor).join('\n')}
${leitura ? `
O QUE A DEFESA ORAL MOSTROU:
${leitura}
` : ''}
EVIDÊNCIAS DAS ${p.semanasEvidencia} SEMANAS (o que ${p.nomeColab} registrou na jornada):
${evidenciasSemanas || '(sem evidências registradas nas semanas)'}

JUSTIFICATIVAS DA AVALIAÇÃO (base para as evidências; não copie números):
${justificativas || '(sem justificativas)'}

RASCUNHO DA DEVOLUTIVA (escrito antes dos ajustes):
${JSON.stringify(p.rascunho ?? {}, null, 2)}

Devolva a devolutiva reescrita:
{
  "resumo_avaliacao": {
    "mensagem_geral": "devolutiva honesta e construtiva para ${p.nomeColab}",
    "evidencias_citadas": ["evidência 1", "evidência 2"],
    "principal_avanco": "texto curto",
    "principal_ponto_de_atencao": "texto curto",
    "mensagem_final": "o fecho do relatório, escrito PARA ${p.nomeColab} em segunda pessoa: o que leva daqui, o que isso destrava, o que segue pedindo trabalho",
    "proximos_passos": ["ação que ${p.nomeColab} começa na semana que vem"]
  }
}`;

  return { system, user };
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Valida a saída da redação. Devolve `null` quando falta um dos quatro textos
 * que a pessoa lê: completar com o rascunho traria de volta justamente a frase
 * que contradiz a nota, então o caller mantém o rascunho INTEIRO e avisa.
 * Evidências citadas faltando vêm do rascunho: são trechos da resposta, que o
 * ajuste da nota não invalida.
 */
export function validarRedacao(parsed: any, rascunho: any): ResumoRedigido | null {
  const r = parsed?.resumo_avaliacao && typeof parsed.resumo_avaliacao === 'object' ? parsed.resumo_avaliacao : parsed;
  if (!r || typeof r !== 'object') return null;
  const resumo: ResumoRedigido = {
    mensagem_geral: texto(r.mensagem_geral),
    evidencias_citadas: Array.isArray(r.evidencias_citadas)
      ? r.evidencias_citadas.map(texto).filter(Boolean)
      : (Array.isArray(rascunho?.evidencias_citadas) ? rascunho.evidencias_citadas : []),
    principal_avanco: texto(r.principal_avanco),
    principal_ponto_de_atencao: texto(r.principal_ponto_de_atencao),
    mensagem_final: texto(r.mensagem_final),
    proximos_passos: normalizarPassos(r.proximos_passos),
  };
  if (!resumo.mensagem_geral || !resumo.principal_avanco || !resumo.principal_ponto_de_atencao || !resumo.mensagem_final) return null;
  return resumo;
}
