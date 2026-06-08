/**
 * DNA Organizacional — camada narrativa (IA).
 *
 * A partir do agregado (lib/dna-organizacional/aggregate), gera as seções
 * qualitativas do "Retrato de Competências": intro, forças, padrões,
 * prioridades de formação, ações de 30 dias e fecho. Adapta o vocabulário ao
 * SEGMENTO (educação fala escola/professores/alunos; corporativo fala
 * organização/times/líderes/clientes). NÃO inventa números — só interpreta os
 * fornecidos. Os números/tabelas vêm do agregado; aqui é só a leitura humana.
 */
import { callAI, type AIConfig } from '@/actions/ai-client';
import type { DnaAggregate } from './aggregate';

export interface DnaForca { titulo: string; destaque: string; descricao: string; reforco: string }
export interface DnaPadrao { titulo: string; texto: string }
export interface DnaPrioridade { descritor: string; competencia: string; dado: string; porque: string; acao: string }
export interface DnaAcao { titulo: string; quando: string; quem: string; resultado: string }
export interface DnaNarrative {
  intro: string;
  forcas: DnaForca[];
  leituraGeral: string;
  padroes: DnaPadrao[];
  prioridades: DnaPrioridade[];
  acoes: DnaAcao[];
  profissionaisReferencia: string;
  fecho: string;
}

function vocab(segmento: string | null | undefined) {
  if (segmento === 'educacao') return { org: 'escola', pessoas: 'profissionais da educação', publico: 'alunos', ritual: 'HTPC / reunião pedagógica' };
  return { org: 'organização', pessoas: 'profissionais', publico: 'clientes', ritual: 'reunião de time / 1:1' };
}

function resumoDados(dna: DnaAggregate, empresaNome: string, segmento: string | null | undefined): string {
  const v = vocab(segmento);
  const comps = dna.competencias.slice(0, 6).map((c) =>
    `- ${c.nome}: média ${c.media} (N1=${c.pct.n1}% N2=${c.pct.n2}% N3=${c.pct.n3}% N4=${c.pct.n4}%)${c.prioridade ? ' [PRIORITÁRIA]' : ''}` +
    `\n    descritores: ${c.descritores.slice(0, 4).map((d) => `${d.descritor} (N1=${d.pct.n1}%)`).join('; ')}`,
  ).join('\n');
  return [
    `${v.org.toUpperCase()}: ${empresaNome} | segmento: ${segmento || 'corporativo'}`,
    `Avaliados: ${dna.avaliados} de ${dna.totalColaboradores} (${dna.participacaoPct}% de participação) · ${dna.totalAvaliacoes} avaliações de descritores`,
    `Distribuição geral: N1(gap)=${dna.distGeralPct.n1}% · N2(em desenv.)=${dna.distGeralPct.n2}% · N3(meta)=${dna.distGeralPct.n3}% · N4(referência)=${dna.distGeralPct.n4}%`,
    `\nCompetências (ordenadas por prioridade):\n${comps}`,
    `\nMaiores gaps: ${dna.topGaps.slice(0, 5).map((g) => `${g.descritor} (${g.competencia}, ${g.n1pct}% em N1)`).join(' · ')}`,
    `Forças (presença de N3/N4): ${dna.forcas.slice(0, 5).map((f) => `${f.descritor} (${f.competencia}, ${f.pct}%)`).join(' · ') || 'praticamente ausentes'}`,
  ].join('\n');
}

const SYSTEM = `Você é um consultor sênior de desenvolvimento organizacional da Vertho. Escreve o "Retrato de Competências" (DNA Organizacional): um diagnóstico COLETIVO, ANÔNIMO e MOBILIZADOR de uma equipe, em português do Brasil.

REGRAS INVIOLÁVEIS:
- NUNCA invente números. Use APENAS as estatísticas fornecidas. Pode citar percentuais e médias que estão nos dados.
- NUNCA identifique pessoas. O tom é coletivo ("nosso grupo", "a equipe").
- Tom: encorajador, honesto, profissional — celebra forças reais e nomeia gaps sem culpar. Gaps são "degraus", não fracassos.
- Adapte o vocabulário ao SEGMENTO informado (educação: escola/professores/alunos; corporativo: organização/times/clientes).
- Cada prioridade e ação deve derivar diretamente dos maiores gaps dos dados.

Responda SOMENTE com JSON válido (sem markdown, sem cercas) neste formato exato:
{
  "intro": "1 parágrafo (3-4 frases) enquadrando o diagnóstico e o volume de dados.",
  "forcas": [ { "titulo": "...", "destaque": "número/estatística curta (ex: '100% de participação')", "descricao": "2 frases", "reforco": "1 frase de celebração" } ],
  "leituraGeral": "1 parágrafo lendo a distribuição geral N1-N4 e a tensão central.",
  "padroes": [ { "titulo": "...", "texto": "2-3 frases sobre um padrão sistêmico observado nos gaps" } ],
  "prioridades": [ { "descritor": "nome exato do descritor", "competencia": "nome exato", "dado": "o stat (ex: '88% em N1')", "porque": "por que importa (impacto no negócio/aprendizagem)", "acao": "ação formativa sugerida, concreta" } ],
  "acoes": [ { "titulo": "ação coletiva concreta", "quando": "momento/ritual", "quem": "público", "resultado": "resultado mensurável em 30 dias" } ],
  "profissionaisReferencia": "2 frases reconhecendo (anonimamente) quem já está em N3/N4 como referência e ponte.",
  "fecho": "1 parágrafo inspirador de fechamento — diagnóstico é ponto de partida."
}
Quantidades: forcas 3, padroes 2, prioridades 3 (os 3 maiores gaps), acoes 3.`;

export async function gerarNarrativaDna(
  dna: DnaAggregate,
  opts: { empresaNome: string; segmento?: string | null; aiConfig?: AIConfig },
): Promise<DnaNarrative> {
  const user = `Gere o Retrato de Competências com base nestes dados:\n\n${resumoDados(dna, opts.empresaNome, opts.segmento)}`;
  const raw = await callAI(SYSTEM, user, opts.aiConfig || {}, 4096, { temperature: 0.6 });
  const jsonStr = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  let parsed: DnaNarrative;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const m = jsonStr.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Narrativa DNA: resposta não-JSON da IA');
    parsed = JSON.parse(m[0]);
  }
  // saneamento mínimo
  parsed.forcas = (parsed.forcas || []).slice(0, 3);
  parsed.padroes = (parsed.padroes || []).slice(0, 3);
  parsed.prioridades = (parsed.prioridades || []).slice(0, 3);
  parsed.acoes = (parsed.acoes || []).slice(0, 3);
  return parsed;
}
