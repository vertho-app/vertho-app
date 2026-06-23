/**
 * Kit Semanal — geração da ESPINHA: o núcleo conceitual compartilhado (brief) e o
 * desafio POR DISC. Ver docs/KIT-SEMANAL.md.
 *
 * - O brief é DISC-neutro e formato-neutro: a ideia única que TODOS os formatos
 *   expressam ("falam a mesma coisa"). Derivado do módulo-base quando existe.
 * - O desafio é POR DISC: mesma espinha, ação prática sob medida ao perfil.
 */
import { callAI } from '@/actions/ai-client';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';
import { parseDesafioResponse, type DesafioStructured } from '@/lib/season-engine/prompts/challenge';
import { ARQUETIPOS } from '@/lib/disc-arquetipos';

export type DiscLetter = 'D' | 'I' | 'S' | 'C';

export interface KitBriefNucleo {
  ideia_central: string;
  pontos_chave: string[];
  exemplo_ancora: string;
}

export interface GerarBriefParams {
  competencia: string;
  descritor: string;
  nivelMin?: number;
  nivelMax?: number;
  cargo?: string;
  contexto?: string;
  empresaId?: string | null;
  aiConfig?: any;
  model?: string;
}

// ── Lente DISC: como cada perfil ENGAJA (sem citar DISC no texto final) ──────
export const LENTE_DISC: Record<DiscLetter, { perfil: string; engaja: string }> = {
  D: { perfil: `${ARQUETIPOS.D.nome} — ${ARQUETIPOS.D.desc}`, engaja: 'meta clara, autonomia e ganho visível/rápido; verbo de ação, direto, sem rodeios' },
  I: { perfil: `${ARQUETIPOS.I.nome} — ${ARQUETIPOS.I.desc}`, engaja: 'envolve pessoas, reconhecimento e visibilidade; energia, exemplos vivos e interação' },
  S: { perfil: `${ARQUETIPOS.S.nome} — ${ARQUETIPOS.S.desc}`, engaja: 'passo seguro, baixo risco, dentro da rotina; apoio, previsibilidade e constância' },
  C: { perfil: `${ARQUETIPOS.C.nome} — ${ARQUETIPOS.C.desc}`, engaja: 'método, critério objetivo e checagem; precisão, dados e padrão claro' },
};

function parseNucleo(raw: string): KitBriefNucleo | null {
  try {
    let s = raw.trim();
    if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    const p = JSON.parse(s);
    const pontos = Array.isArray(p.pontos_chave) ? p.pontos_chave.map((x: any) => String(x).trim()).filter(Boolean) : [];
    if (typeof p.ideia_central !== 'string' || p.ideia_central.trim().length < 8) return null;
    if (pontos.length < 3) return null;
    if (typeof p.exemplo_ancora !== 'string' || p.exemplo_ancora.trim().length < 8) return null;
    return { ideia_central: p.ideia_central.trim(), pontos_chave: pontos.slice(0, 3), exemplo_ancora: p.exemplo_ancora.trim() };
  } catch {
    return null;
  }
}

/** Destila o núcleo conceitual (DISC-neutro) a partir do módulo-base + tema. */
export async function gerarKitBriefNucleo(sb: any, p: GerarBriefParams): Promise<{ nucleo: KitBriefNucleo; moduloBaseId: string | null }> {
  let moduloTxt = '';
  let moduloBaseId: string | null = null;
  try {
    const escolhido = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: p.competencia, nivelMin: p.nivelMin ?? 1.0,
      locale: p.aiConfig?.locale, contexto_pedagogico: p.contexto, empresaId: p.empresaId,
    });
    if (escolhido) {
      moduloBaseId = escolhido.modulo.id;
      const cc = escolhido.modulo.conteudo_central || {};
      moduloTxt = [
        cc.ideia_principal ? `IDEIA PRINCIPAL DO MÓDULO:\n${String(cc.ideia_principal).trim()}` : '',
        Array.isArray(cc.principios) && cc.principios.length
          ? `PRINCÍPIOS:\n${cc.principios.map((x: any) => `- ${x.nome}: ${x.explicacao}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n');
    }
  } catch { /* segue sem módulo */ }

  const system = `Você é designer instrucional da Vertho. Destile o NÚCLEO CONCEITUAL de um tema de desenvolvimento — a espinha que TODOS os formatos (vídeo, podcast, texto, estudo de caso) vão expressar para "dizer a mesma coisa".

O núcleo é NEUTRO de perfil (não personalize por DISC) e NEUTRO de formato.

Componha:
- ideia_central: UMA frase com a ideia que a pessoa deve sair sabendo/fazendo diferente.
- pontos_chave: EXATAMENTE 3 pontos curtos (1 frase cada) — os pilares que todo formato deve tocar.
- exemplo_ancora: UMA situação concreta e nomeável (sem nome próprio) que ilustra o tema no dia a dia do cargo.

Fala natural, sem jargão, sem markdown. RETORNE APENAS JSON VÁLIDO:
{"ideia_central":"...","pontos_chave":["...","...","..."],"exemplo_ancora":"..."}`;

  const user = `TEMA:
- Competência: ${p.competencia}
- Descritor: ${p.descritor}
- Nível: ${p.nivelMin ?? 1}–${p.nivelMax ?? 2} de 4
- Cargo: ${p.cargo ?? 'todos'} · Contexto: ${p.contexto ?? 'generico'}${moduloTxt ? `\n\nMATÉRIA-PRIMA CANÔNICA (preserve as bases):\n${moduloTxt}` : ''}`;

  const raw = (await callAI(system, user, { ...(p.aiConfig || {}), model: p.model || p.aiConfig?.model }, 1500)).trim();
  const nucleo = parseNucleo(raw);
  if (!nucleo) throw new Error('brief: núcleo inválido retornado pela IA');
  return { nucleo, moduloBaseId };
}

/** Resolve um brief existente para o tema (idempotência) ou cria um novo. */
export async function resolverOuCriarBrief(sb: any, p: GerarBriefParams): Promise<{ briefId: string; brief: KitBriefNucleo; reused: boolean }> {
  let q = sb.from('kit_briefs').select('id, brief')
    .eq('competencia', p.competencia).eq('descritor', p.descritor)
    .eq('nivel_min', p.nivelMin ?? 1.0).eq('nivel_max', p.nivelMax ?? 2.0)
    .eq('cargo', p.cargo ?? 'todos').eq('contexto', p.contexto ?? 'generico');
  q = p.empresaId ? q.eq('empresa_id', p.empresaId) : q.is('empresa_id', null);
  const { data: existing } = await q.limit(1).maybeSingle();
  if (existing) return { briefId: existing.id, brief: existing.brief, reused: true };

  const { nucleo, moduloBaseId } = await gerarKitBriefNucleo(sb, p);
  const { data: novo, error } = await sb.from('kit_briefs').insert({
    empresa_id: p.empresaId ?? null, competencia: p.competencia, descritor: p.descritor,
    nivel_min: p.nivelMin ?? 1.0, nivel_max: p.nivelMax ?? 2.0,
    cargo: p.cargo ?? 'todos', contexto: p.contexto ?? 'generico',
    modulo_base_id: moduloBaseId, brief: nucleo, status: 'published', published_at: new Date().toISOString(),
  }).select('id, brief').single();
  if (error) throw new Error('brief insert: ' + error.message);
  return { briefId: novo.id, brief: novo.brief, reused: false };
}

/** Gera o desafio (micro-ação prática) sob medida ao DISC, ancorado no núcleo. */
export async function gerarKitDesafio(p: GerarBriefParams, nucleo: KitBriefNucleo, disc: DiscLetter): Promise<DesafioStructured> {
  const lente = LENTE_DISC[disc];
  const system = `Você é designer instrucional da Vertho especializado em micro-ações práticas.

Crie UM desafio semanal: uma MICRO-AÇÃO PRÁTICA (não conteúdo, não dica, não reflexão abstrata) que a pessoa experimenta no trabalho real ao longo da semana, ancorada no núcleo do tema.

PRINCÍPIOS INEGOCIÁVEIS:
- UMA ação principal, observável, que cabe na rotina da semana, coerente com cargo/contexto.
- Curto (2–3 frases), concreto, viável (sem grande projeto/autorização), singular.
- Sem "Esta semana...", sem jargão, sem tom professoral, sem slogan.

LENTE DE PERFIL (${disc} · ${lente.perfil}): a AÇÃO deve ENGAJAR este perfil por: ${lente.engaja}. NUNCA cite DISC, siglas (D/I/S/C) nem o nome do perfil no texto.

RETORNE APENAS JSON VÁLIDO:
{"desafio_texto":"2-3 frases","acao_observavel":"a ação principal observável","criterio_de_execucao":"como saber que foi feito","por_que_cabe_na_semana":"viabilidade curta"}`;

  const user = `NÚCLEO DO TEMA (a ação deve aterrar este núcleo):
- Ideia central: ${nucleo.ideia_central}
- Pontos-chave: ${nucleo.pontos_chave.join(' · ')}
- Exemplo-âncora: ${nucleo.exemplo_ancora}

CONTEXTO:
- Competência: ${p.competencia} · Descritor: ${p.descritor}
- Cargo: ${p.cargo ?? 'todos'} · Contexto: ${p.contexto ?? 'generico'} · Nível: ${p.nivelMin ?? 1}/4`;

  const raw = (await callAI(system, user, { ...(p.aiConfig || {}), model: p.model || p.aiConfig?.model }, 800)).trim();
  const desafio = parseDesafioResponse(raw);
  if (!desafio) throw new Error(`desafio inválido retornado pela IA (DISC ${disc})`);
  return desafio;
}
