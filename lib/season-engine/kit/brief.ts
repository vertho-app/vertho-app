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
import { blocoCalibracaoPublico, type RegistroPublico } from '@/lib/season-engine/perfil-publico';

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
  /** Contexto/PPP da EMPRESA (kit é por empresa) — lente de aplicação. */
  pppBrief?: string | null;
  /** Registro/domínio por público (MEI/Empregabilidade/…); adapta núcleo e desafio. */
  perfilPublico?: RegistroPublico;
  /** Caller de IA injetado (Batch API). Só a 1ª tentativa usa; retries síncronos. */
  aiRun?: import('@/lib/ai-batch').AIRun;
}

// ── Lente DISC: como cada perfil ENGAJA (sem citar DISC no texto final) ──────
export const LENTE_DISC: Record<DiscLetter, { perfil: string; engaja: string }> = {
  D: { perfil: `${ARQUETIPOS.D.nome} — ${ARQUETIPOS.D.desc}`, engaja: 'meta clara, autonomia e ganho visível/rápido; verbo de ação, direto, sem rodeios' },
  I: { perfil: `${ARQUETIPOS.I.nome} — ${ARQUETIPOS.I.desc}`, engaja: 'envolve pessoas, reconhecimento e visibilidade; energia, exemplos vivos e interação' },
  S: { perfil: `${ARQUETIPOS.S.nome} — ${ARQUETIPOS.S.desc}`, engaja: 'passo seguro, baixo risco, dentro da rotina; apoio, previsibilidade e constância' },
  C: { perfil: `${ARQUETIPOS.C.nome} — ${ARQUETIPOS.C.desc}`, engaja: 'método, critério objetivo e checagem; precisão, dados e padrão claro' },
};

/** Extrai um objeto JSON mesmo com prosa/markdown em volta (modelos variam). */
function extrairJson(raw: string): any | null {
  let s = (raw || '').trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch { /* tenta extrair */ }
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* desiste */ } }
  return null;
}

function parseNucleo(raw: string): KitBriefNucleo | null {
  const p = extrairJson(raw);
  if (!p) return null;
  const ideia = typeof p.ideia_central === 'string' ? p.ideia_central.trim() : '';
  let pontos = Array.isArray(p.pontos_chave) ? p.pontos_chave.map((x: any) => String(x).trim()).filter(Boolean) : [];
  // Tolera pontos vindos como string única (quebras / bullets).
  if (pontos.length < 3 && typeof p.pontos_chave === 'string') {
    pontos = p.pontos_chave.split(/\n+|·|;|(?:^|\s)-\s/).map((s: string) => s.trim()).filter(Boolean);
  }
  const exemplo = typeof p.exemplo_ancora === 'string' ? p.exemplo_ancora.trim() : '';
  if (ideia.length < 8 || pontos.length < 3 || exemplo.length < 8) return null;
  return { ideia_central: ideia, pontos_chave: pontos.slice(0, 3), exemplo_ancora: exemplo };
}

/** Destila o núcleo conceitual (DISC-neutro) a partir do módulo-base + tema. */
export async function gerarKitBriefNucleo(sb: any, p: GerarBriefParams): Promise<{ nucleo: KitBriefNucleo; moduloBaseId: string | null }> {
  let moduloTxt = '';
  let moduloBaseId: string | null = null;
  try {
    // cargo + descritor são OBRIGATÓRIOS aqui. Sem `cargo`, o resolver não aplica o
    // filtro da regra "competência é ÚNICA POR CARGO" (4faa0130) e o brief ancora no
    // MB de OUTRO cargo — medido: Autocuidado sem cargo → MB da Gestão Escolar
    // ("Ninguém Conduz Sozinho"), servindo também a Coordenação Pedagógica, cujo MB
    // certo é outro ("BUSCA DE APOIO"). Sem `descritor`, o score semântico não
    // diferencia os descritores da competência e os 6 caem no MESMO módulo-base.
    const escolhido = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: p.competencia, descritor: p.descritor, nivelMin: p.nivelMin ?? 1.0,
      locale: p.aiConfig?.locale, contexto_pedagogico: p.contexto, cargo: p.cargo, empresaId: p.empresaId,
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
{"ideia_central":"...","pontos_chave":["...","...","..."],"exemplo_ancora":"..."}${p.perfilPublico ? blocoCalibracaoPublico(p.perfilPublico) : ''}`;

  const user = `TEMA:
- Competência: ${p.competencia}
- Descritor: ${p.descritor}
- Nível: ${p.nivelMin ?? 1}–${p.nivelMax ?? 2} de 4
- Cargo: ${p.cargo ?? 'todos'} · Contexto: ${p.contexto ?? 'generico'}${moduloTxt ? `\n\nMATÉRIA-PRIMA CANÔNICA (preserve as bases):\n${moduloTxt}` : ''}${p.pppBrief ? `\n\nCONTEXTO DA INSTITUIÇÃO (lente de aplicação, sem citar o nome):\n${p.pppBrief}` : ''}`;

  const sysJson = `${system}\n\nIMPORTANTE: responda SOMENTE com o objeto JSON, sem nenhum texto antes ou depois, sem markdown.`;
  let nucleo: KitBriefNucleo | null = null;
  for (let i = 0; i < 3 && !nucleo; i++) {
    const raw = (await callAI(i === 0 ? system : sysJson, user, { ...(p.aiConfig || {}), model: p.model || p.aiConfig?.model }, 1500)).trim();
    nucleo = parseNucleo(raw);
    if (!nucleo) console.warn(`[kit/brief] núcleo inválido (tentativa ${i + 1}/3): ${raw.slice(0, 120)}`);
  }
  if (!nucleo) throw new Error('brief: núcleo inválido retornado pela IA');
  return { nucleo, moduloBaseId };
}

/** Resolve um brief existente para o tema (idempotência) ou cria um novo. */
export async function resolverOuCriarBrief(sb: any, p: GerarBriefParams): Promise<{ briefId: string; brief: KitBriefNucleo; moduloBaseId: string | null; reused: boolean }> {
  let q = sb.from('kit_briefs').select('id, brief, modulo_base_id')
    .eq('competencia', p.competencia).eq('descritor', p.descritor)
    .eq('nivel_min', p.nivelMin ?? 1.0).eq('nivel_max', p.nivelMax ?? 2.0)
    .eq('cargo', p.cargo ?? 'todos').eq('contexto', p.contexto ?? 'generico');
  q = p.empresaId ? q.eq('empresa_id', p.empresaId) : q.is('empresa_id', null);
  const { data: existing } = await q.limit(1).maybeSingle();
  if (existing) return { briefId: existing.id, brief: existing.brief, moduloBaseId: existing.modulo_base_id ?? null, reused: true };

  const { nucleo, moduloBaseId } = await gerarKitBriefNucleo(sb, p);
  const { data: novo, error } = await sb.from('kit_briefs').insert({
    empresa_id: p.empresaId ?? null, competencia: p.competencia, descritor: p.descritor,
    nivel_min: p.nivelMin ?? 1.0, nivel_max: p.nivelMax ?? 2.0,
    cargo: p.cargo ?? 'todos', contexto: p.contexto ?? 'generico',
    modulo_base_id: moduloBaseId, brief: nucleo, status: 'published', published_at: new Date().toISOString(),
  }).select('id, brief').single();
  if (error) throw new Error('brief insert: ' + error.message);
  return { briefId: novo.id, brief: novo.brief, moduloBaseId: moduloBaseId ?? null, reused: false };
}

/** Parser tolerante do desafio (prosa/markdown em volta) — complementa parseDesafioResponse. */
function parseDesafioFallback(raw: string): DesafioStructured | null {
  const p = extrairJson(raw);
  if (!p) return null;
  const f = (v: any) => (typeof v === 'string' ? v.trim() : '');
  const d = { desafio_texto: f(p.desafio_texto), acao_observavel: f(p.acao_observavel), criterio_de_execucao: f(p.criterio_de_execucao), por_que_cabe_na_semana: f(p.por_que_cabe_na_semana) };
  if (Object.values(d).some((v) => v.length < 5)) return null;
  return d;
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
{"desafio_texto":"2-3 frases","acao_observavel":"a ação principal observável","criterio_de_execucao":"como saber que foi feito","por_que_cabe_na_semana":"viabilidade curta"}${p.perfilPublico ? blocoCalibracaoPublico(p.perfilPublico) : ''}`;

  const user = `NÚCLEO DO TEMA (a ação deve aterrar este núcleo):
- Ideia central: ${nucleo.ideia_central}
- Pontos-chave: ${nucleo.pontos_chave.join(' · ')}
- Exemplo-âncora: ${nucleo.exemplo_ancora}

CONTEXTO:
- Competência: ${p.competencia} · Descritor: ${p.descritor}
- Cargo: ${p.cargo ?? 'todos'} · Contexto: ${p.contexto ?? 'generico'} · Nível: ${p.nivelMin ?? 1}/4${p.pppBrief ? `\n\nCONTEXTO DA INSTITUIÇÃO (ancore a ação na realidade dela, sem citar o nome):\n${p.pppBrief}` : ''}`;

  const sysJson = `${system}\n\nIMPORTANTE: responda SOMENTE com o objeto JSON, sem texto antes ou depois, sem markdown.`;
  let desafio = null;
  for (let i = 0; i < 3 && !desafio; i++) {
    // 1ª tentativa pode ir no batch (aiRun); retries por JSON inválido = síncrono.
    const ai = i === 0 && p.aiRun ? p.aiRun : callAI;
    const raw = (await ai(i === 0 ? system : sysJson, user, { ...(p.aiConfig || {}), model: p.model || p.aiConfig?.model }, 800)).trim();
    desafio = parseDesafioResponse(raw) || parseDesafioFallback(raw);
    if (!desafio) console.warn(`[kit/desafio] inválido DISC ${disc} (tentativa ${i + 1}/3): ${raw.slice(0, 120)}`);
  }
  if (!desafio) throw new Error(`desafio inválido retornado pela IA (DISC ${disc})`);
  return desafio;
}
