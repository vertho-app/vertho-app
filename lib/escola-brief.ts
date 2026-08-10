/**
 * Resume o PPP (Projeto Político-Pedagógico) — ou qualquer descrição da escola —
 * num BRIEF curto e estruturado, voltado a guiar o vídeo de microlearning.
 *
 * O PPP é longo e majoritariamente texto pedagógico; o gerador de vídeo só
 * aproveita uma fração disso. Em vez de jogar o documento inteiro no prompt
 * (caro e ruidoso), resumimos UMA vez nestes ~6 campos e guardamos em
 * `empresas.sys_config.video_escola`. O brief alimenta a BÍBLIA VISUAL
 * (ambientes, persona) e o TOM do voice-over em `gerarVideoPlano`.
 *
 * Guardas: o brief descreve características reais da escola, mas NUNCA pede texto
 * legível, logos ou nomes próprios na tela — isso continua bloqueado no Veo.
 */

import { callAI } from '@/actions/ai-client';

const BRIEF_MODEL = process.env.ESCOLA_BRIEF_MODEL || 'gemini-3.6-flash';

export interface EscolaBrief {
  /** Etapas/segmentos atendidos. Ex: "Educação Infantil e Fundamental I". */
  etapas: string;
  /** Rede e natureza. Ex: "Privada confessional" / "Pública municipal". */
  rede: string;
  /** Contexto físico/social. Ex: "Urbana, classe média, região metropolitana de SP". */
  contexto: string;
  /** Ambientes reais marcantes (viram sub-ambientes da bíblia visual). */
  ambientes: string;
  /** Essência do PPP em 2-3 linhas: missão, abordagem pedagógica, valores. */
  identidade: string;
  /** Tom desejado para o voice-over. Ex: "Acolhedor, inovador, foco em protagonismo". */
  tom: string;
}

export const EMPTY_BRIEF: EscolaBrief = {
  etapas: '', rede: '', contexto: '', ambientes: '', identidade: '', tom: '',
};

const SYSTEM = `Você extrai de um Projeto Político-Pedagógico (PPP) ou descrição de escola um BRIEF curto que vai guiar a estética e o tom de um vídeo institucional de microlearning.

Foque APENAS no que muda o vídeo (ambiente visual + tom da narração). Ignore burocracia, metas numéricas, marco legal e jargão pedagógico que não tenha tradução visual ou de tom.

Responda SOMENTE com JSON válido (sem markdown, sem comentários) neste schema, em português do Brasil, cada campo com 1-3 frases curtas:
{
  "etapas": "etapas/segmentos atendidos (infantil, fundamental I/II, médio, EJA, técnico)",
  "rede": "rede e natureza (pública municipal/estadual, privada, confessional, cooperativa)",
  "contexto": "contexto físico e social (urbana/rural/periférica, porte, perfil socioeconômico, região do Brasil)",
  "ambientes": "3-5 ambientes reais marcantes da escola (ex: pátio arborizado, biblioteca ampla, laboratório maker, quadra coberta, refeitório)",
  "identidade": "essência do PPP em 2-3 linhas: missão, abordagem pedagógica e valores centrais",
  "tom": "tom desejado para a narração (ex: acolhedor, sóbrio, inovador, foco em protagonismo estudantil)"
}

Se algo não estiver no texto, infira o mais provável a partir do conjunto — nunca invente nomes próprios, marcas ou dados específicos. Não inclua nada que precise aparecer como texto legível na tela.`;

function parseBrief(raw: string): EscolaBrief {
  let txt = raw.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();
  const first = txt.indexOf('{');
  const last = txt.lastIndexOf('}');
  if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
  const obj = JSON.parse(txt) as Partial<EscolaBrief>;
  const pick = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    etapas: pick(obj.etapas),
    rede: pick(obj.rede),
    contexto: pick(obj.contexto),
    ambientes: pick(obj.ambientes),
    identidade: pick(obj.identidade),
    tom: pick(obj.tom),
  };
}

/**
 * Resume o PPP/descrição num brief estruturado. Lança em erro — o caller decide.
 * @param ppp texto do PPP ou descrição livre da escola.
 */
export async function resumirPPP(ppp: string): Promise<EscolaBrief> {
  if (!ppp?.trim()) throw new Error('PPP/descrição vazio');
  const raw = await callAI(SYSTEM, ppp.trim().slice(0, 60000), { model: BRIEF_MODEL }, 2000, { temperature: 0.3, taskKey: 'escola_brief' });
  const brief = parseBrief(raw);
  if (!brief.identidade && !brief.contexto && !brief.etapas) {
    throw new Error('não foi possível extrair o brief do texto');
  }
  return brief;
}

/**
 * Converte a extração estruturada do PPP (ppp_escolas.extracao, formato
 * educacional do actions/ppp.ts) num texto legível para alimentar resumirPPP.
 * Cai pro JSON cru se o formato não bater.
 */
export function extracaoParaTexto(raw: any): string {
  let d: any;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return String(raw || ''); }
  if (!d || typeof d !== 'object') return String(raw || '');

  const partes: string[] = [];
  const p = d.perfil_instituicao;
  if (p) partes.push(`Instituição: ${[p.nome, p.tipo, p.segmento, p.porte, p.localizacao].filter(Boolean).join(' — ')}`);
  if (d.comunidade_contexto) partes.push(`Comunidade/contexto: ${d.comunidade_contexto}`);
  const id = d.identidade;
  if (id) {
    const linhas = [id.missao && `Missão: ${id.missao}`, id.visao && `Visão: ${id.visao}`,
      Array.isArray(id.principios) && id.principios.length && `Princípios: ${id.principios.join('; ')}`,
      id.concepcao && `Concepção: ${id.concepcao}`].filter(Boolean);
    if (linhas.length) partes.push(`Identidade:\n${linhas.join('\n')}`);
  }
  if (Array.isArray(d.praticas_descritas) && d.praticas_descritas.length) {
    partes.push(`Práticas: ${d.praticas_descritas.map((x: any) => x?.nome || x?.descricao).filter(Boolean).join('; ')}`);
  }
  if (d.inclusao_diversidade) partes.push(`Inclusão/diversidade: ${d.inclusao_diversidade}`);
  if (d.gestao_participacao) partes.push(`Gestão/participação: ${d.gestao_participacao}`);
  const inf = d.infraestrutura_recursos;
  if (inf) {
    const linhas = [Array.isArray(inf.espacos) && inf.espacos.length && `Espaços: ${inf.espacos.join(', ')}`,
      Array.isArray(inf.tecnologia) && inf.tecnologia.length && `Tecnologia: ${inf.tecnologia.join(', ')}`].filter(Boolean);
    if (linhas.length) partes.push(`Infraestrutura:\n${linhas.join('\n')}`);
  }
  const vals = Array.isArray(d.valores_institucionais) ? d.valores_institucionais
    : (d.valores_institucionais?.conteudo || []);
  if (Array.isArray(vals) && vals.length) partes.push(`Valores: ${vals.join(', ')}`);

  const texto = partes.join('\n\n').trim();
  return texto || JSON.stringify(d);
}

/**
 * Assinatura curta e determinística de um texto de contexto, para compor chave de
 * cache. Não é hash criptográfico — é um discriminador: contextos diferentes têm que
 * cair em chaves diferentes, e o MESMO contexto tem que reaproveitar o cache entre
 * execuções (por isso determinístico, sem timestamp).
 *
 * Existe porque o PDF personalizado era cacheado por (conteúdo, empresa, arquétipo):
 * um PPP novo atualizava o contexto e o cache seguia servindo o texto antigo para
 * sempre, e uma resolução por-escola faria duas pessoas de escolas diferentes
 * colidirem na mesma chave (F-E7 do docs/FMEA-PIPELINE.md).
 */
export function assinaturaCurta(texto: string): string {
  let h = 5381;
  const s = String(texto || '');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 8);   // só [0-9a-z] — seguro como nome de arquivo
}

/** True se o brief tem ao menos um campo preenchido (vale a pena injetar). */
export function briefPreenchido(b?: Partial<EscolaBrief> | null): boolean {
  return !!b && Object.values(b).some((v) => typeof v === 'string' && v.trim());
}

/** Renderiza o brief como bloco de texto pro prompt do gerador de plano. */
export function briefParaPrompt(b: EscolaBrief): string {
  const linhas: string[] = [];
  if (b.etapas) linhas.push(`- Etapas/segmentos: ${b.etapas}`);
  if (b.rede) linhas.push(`- Rede/natureza: ${b.rede}`);
  if (b.contexto) linhas.push(`- Contexto: ${b.contexto}`);
  if (b.ambientes) linhas.push(`- Ambientes reais: ${b.ambientes}`);
  if (b.identidade) linhas.push(`- Identidade (PPP): ${b.identidade}`);
  if (b.tom) linhas.push(`- Tom desejado: ${b.tom}`);
  return linhas.join('\n');
}
