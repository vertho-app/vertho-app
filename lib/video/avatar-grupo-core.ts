/**
 * Avatar compartilhado por grupo (empresa × módulo × cargo): a parte com banco e IA.
 *
 * Headless: recebe o cliente de quem chama (o Kit, dentro da task `gerar-kit`). As
 * peças puras (chave, validação, aplicação do texto) estão em `./avatar-grupo`.
 *
 * O fluxo, ligado por `VIDEO_AVATAR_GRUPO=on` (env do Trigger, onde o Kit roda):
 *   1. `prepararGrupoAvatar`: UMA chamada curta ao modelo escreve a abertura e o fecho
 *      do avatar SEM tom DISC, e o grupo nasce `pendente`. Feito ANTES do fan-out dos
 *      DISC, como o brief e o PPP, para as células não correrem umas com as outras.
 *   2. Cada célula DISC recebe esse texto fixo no roteiro e é inserida SEM disparar
 *      (`etapa = aguardando_avatar`).
 *   3. `despacharGrupoAvatar` dispara `trigger/gerar-video-grupo.ts`, que gera a 1ª
 *      célula (a mãe), grava o avatar dela no grupo e só então dispara as irmãs, que
 *      reaproveitam o clipe da HeyGen.
 *
 * Tudo aqui cai para o fluxo de hoje em vez de falhar: o grupo é economia, não
 * requisito. Cada queda vira `VIDEO_AVATAR_GRUPO_FALLBACK` no `degradacao_log`.
 */
import { tasks } from '@trigger.dev/sdk';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { AVATAR_GRUPO, type AvatarGrupoStatus } from '@/lib/status';
import { carregarCargoInfo, formatBlocoCargo } from '@/lib/cargo-contexto';
import { regionOpts } from '@/lib/trigger-region';
import type { gerarVideoModuloTask } from '@/trigger/gerar-video-modulo';
import type { gerarVideoGrupoTask } from '@/trigger/gerar-video-grupo';
import type { AvatarFixo, ModuloParaRoteiro } from './roteiro-prompt';
import { chaveGrupoAvatar, problemasDosTextosAvatar, ETAPA_AGUARDANDO_AVATAR } from './avatar-grupo';

/** Lida em runtime. O Kit roda no Trigger: a flag vale no env de LÁ. */
export const avatarGrupoLigado = () => (process.env.VIDEO_AVATAR_GRUPO || 'off').trim().toLowerCase() === 'on';

export interface GrupoAvatar {
  id: string;
  status: AvatarGrupoStatus;
  textos: AvatarFixo;
}

const TABELA = 'video_avatar_grupo';

const cair = async (fase: string, erro: string, p: { empresaId: string | null; detalhe?: Record<string, unknown> }) => {
  console.warn(`[avatar-grupo] ${fase}: ${erro} (as células seguem o fluxo de hoje)`);
  await registrarDegradacao({
    fluxo: 'video', tipo: DEGRADACAO.VIDEO_AVATAR_GRUPO_FALLBACK, chave: `grupo:${fase}`,
    empresaId: p.empresaId, severidade: 'aviso', detalhe: { fase, erro: erro.slice(0, 300), ...p.detalhe },
  });
  return null;
};

/**
 * O módulo como o roteiro o recebe, só com o que os textos do avatar usam. O bloco
 * do cargo sai das MESMAS funções que o roteiro da célula usa
 * (`actions/gerar-video.ts` `contextoPersonalizacao`): o texto fixo e o miolo falam
 * do mesmo cargo. Diferente de lá, aqui todo erro de leitura é checado.
 */
async function carregarModuloParaAvatar(sb: any, p: {
  empresaId: string; moduloBaseId: string; cargo: string; pppBrief: string | null;
}): Promise<ModuloParaRoteiro> {
  const { data: m, error: eM } = await sb.from('modulos_base_conteudo')
    .select('titulo, descritor, nivel_entrada, nivel_destino, conteudo_central, competencia_base_id, locale')
    .eq('id', p.moduloBaseId).maybeSingle();
  if (eM) throw new Error(`módulo-base: ${eM.message}`);
  if (!m) throw new Error('módulo-base não encontrado');
  let competenciaNome: string | null = null;
  if (m.competencia_base_id) {
    const { data: c, error: eC } = await sb.from('competencias_base').select('nome').eq('id', m.competencia_base_id).maybeSingle();
    if (eC) throw new Error(`competência: ${eC.message}`);
    competenciaNome = c?.nome || null;
  }
  const { data: emp, error: eE } = await sb.from('empresas').select('nome').eq('id', p.empresaId).maybeSingle();
  if (eE) throw new Error(`empresa: ${eE.message}`);
  const cargoInfo = await carregarCargoInfo(sb, p.empresaId, p.cargo).catch(() => null);
  return {
    titulo: m.titulo, descritor: m.descritor, competenciaNome,
    nivel_entrada: m.nivel_entrada, nivel_destino: m.nivel_destino,
    conteudo_central: m.conteudo_central, locale: m.locale,
    cargoBloco: formatBlocoCargo(cargoInfo || { nome: p.cargo }, emp?.nome || null),
    pppBrief: p.pppBrief,
  };
}

function promptTextos(m: ModuloParaRoteiro): { system: string; user: string } {
  const cc = m.conteudo_central || {};
  const system = `Você é roteirista de micro-aprendizagem da Vertho. Escreve SÓ a abertura (avatar_intro) e o fecho (avatar_outro) de um vídeo de ~4 minutos, falados por uma mentora em avatar. O miolo do vídeo é escrito depois, em outra etapa, e muda de tom conforme o perfil de quem assiste. ESTA abertura e ESTE fecho são os mesmos para todos os perfis.

REGRAS:
- Português do Brasil, fala natural e oral, frases curtas (até 20 palavras), sem jargão, sem markdown, sem emoji.
- Tom NEUTRO de mentora calorosa e segura: sem puxar para nenhum estilo comportamental (nem só direto e de resultado, nem só inspirador, nem só acolhedor, nem só analítico).
- avatar_intro: 30 a 34 palavras (≈15s). NÃO comece com cumprimento (nada de "Oi", "Olá", "Bem-vindo", "Tudo bem"): uma saudação com o nome da pessoa é colocada antes. Abra DIRETO num gancho ligado ao dia a dia real do cargo.
- avatar_outro: 26 a 30 palavras (≈13s). Feche com UMA pergunta de reflexão prática, aplicável à rotina do cargo, terminando em "?". Não descreva uma tarefa específica: a tarefa da semana aparece logo antes, no miolo.
- Nada inventado: nenhum número, estudo ou citação que não esteja no módulo.
- Se houver contexto da instituição, pode ecoar um valor dela, mas NÃO cite o nome.
- Tela: title com até 8 palavras; subtitle com até 14 palavras.

Responda SOMENTE o JSON, sem texto fora dele:
{"intro":{"title":"...","subtitle":"...","narration":"..."},"outro":{"title":"...","subtitle":"...","narration":"..."}}`;
  const principios = (Array.isArray(cc.principios) ? cc.principios : []).map((p: any) => `- ${p.nome}: ${p.explicacao}`).join('\n');
  const user = `MÓDULO-BASE
- Competência: ${m.competenciaNome || '—'}${m.descritor ? ` › ${m.descritor}` : ''}
- Transição de nível: ${m.nivel_entrada || 'N1'} → ${m.nivel_destino || 'N2'}
- Título do módulo: ${m.titulo || '—'}

IDEIA PRINCIPAL:
${cc.ideia_principal || '—'}

PRINCÍPIOS:
${principios || '—'}
${m.cargoBloco ? `\n${m.cargoBloco}\n` : ''}${m.pppBrief ? `\n═══ CONTEXTO DA INSTITUIÇÃO (PPP) ═══\n${m.pppBrief}\n` : ''}
Escreva a abertura e o fecho.`;
  return { system, user };
}

function parseTextos(raw: string): AvatarFixo | null {
  try {
    const j = JSON.parse(String(raw).replace(/```json\s*/gi, '').replace(/```/g, '').match(/\{[\s\S]*\}/)?.[0] || '');
    const cena = (c: any) => c && typeof c === 'object'
      ? { title: String(c.title || '').trim(), subtitle: String(c.subtitle || '').trim(), narration: String(c.narration || '').replace(/\s+/g, ' ').trim() }
      : null;
    const intro = cena(j?.intro), outro = cena(j?.outro);
    return intro && outro ? { intro, outro } : null;
  } catch {
    return null;
  }
}

/** Escreve os textos do avatar do grupo. Até 2 tentativas; a 2ª recebe o que falhou. */
export async function gerarTextosAvatarGrupo(m: ModuloParaRoteiro, empresaId: string): Promise<AvatarFixo> {
  const model = await getModelForTask(empresaId, 'video_avatar_grupo');
  const { system, user } = promptTextos(m);
  let problemas: string[] = [];
  for (let i = 0; i < 2; i++) {
    const pedido = problemas.length ? `${user}\n\nA versão anterior foi recusada por: ${problemas.join('; ')}. Corrija.` : user;
    const raw = await callAI(system, pedido, { model }, 4000, { taskKey: 'video_avatar_grupo', empresaId });
    const t = parseTextos(raw);
    problemas = t ? problemasDosTextosAvatar(t) : ['resposta sem JSON válido'];
    if (t && !problemas.length) return t;
  }
  throw new Error(`textos do avatar recusados: ${problemas.join('; ')}`);
}

/**
 * Cria (ou reaproveita) o grupo do avatar. Devolve `null` quando não dá para agrupar:
 * as células seguem o fluxo de hoje, e a queda vira degradação (não some calada).
 */
export async function prepararGrupoAvatar(sb: any, p: {
  empresaId: string; moduloBaseId: string; cargo: string; pppBrief: string | null;
}): Promise<GrupoAvatar | null> {
  const ctx = { empresaId: p.empresaId, detalhe: { moduloBaseId: p.moduloBaseId, cargo: p.cargo } };
  let modulo: ModuloParaRoteiro;
  try {
    modulo = await carregarModuloParaAvatar(sb, p);
  } catch (e: any) {
    return cair('leitura', e?.message || String(e), ctx);
  }
  const chave = chaveGrupoAvatar({
    empresaId: p.empresaId, moduloBaseId: p.moduloBaseId, cargo: p.cargo,
    pppBrief: p.pppBrief, cargoBloco: modulo.cargoBloco ?? null,
  });
  const ler = async () => sb.from(TABELA).select('id, status, intro, outro')
    .eq('chave', chave).eq('empresa_id', p.empresaId).maybeSingle();

  const { data: existente, error: eLer } = await ler();
  if (eLer) return cair('leitura', eLer.message, ctx);
  if (existente) {
    let status = existente.status as AvatarGrupoStatus;
    if (status === AVATAR_GRUPO.ERRO) {
      // A mãe anterior falhou; os textos continuam bons. Nova rodada, nova mãe.
      const { error: eRe } = await sb.from(TABELA)
        .update({ status: AVATAR_GRUPO.PENDENTE, erro: null, mae_video_id: null, updated_at: new Date().toISOString() })
        .eq('id', existente.id).eq('empresa_id', p.empresaId);
      if (eRe) return cair('reabrir', eRe.message, ctx);
      status = AVATAR_GRUPO.PENDENTE;
    }
    return { id: existente.id, status, textos: { intro: existente.intro, outro: existente.outro } };
  }

  let textos: AvatarFixo;
  try {
    textos = await gerarTextosAvatarGrupo(modulo, p.empresaId);
  } catch (e: any) {
    return cair('textos', e?.message || String(e), ctx);
  }
  // Duas rodadas do mesmo grupo ao mesmo tempo: quem inserir primeiro vence, a outra
  // relê e usa o texto do vencedor.
  const { error: eIns } = await sb.from(TABELA).upsert({
    chave, empresa_id: p.empresaId, modulo_base_id: p.moduloBaseId, cargo: p.cargo,
    intro: textos.intro, outro: textos.outro, status: AVATAR_GRUPO.PENDENTE,
  }, { onConflict: 'chave', ignoreDuplicates: true });
  if (eIns) return cair('insercao', eIns.message, ctx);
  const { data: criado, error: eReler } = await ler();
  if (eReler || !criado) return cair('releitura', eReler?.message || 'grupo não encontrado depois de inserir', ctx);
  return { id: criado.id, status: criado.status, textos: { intro: criado.intro, outro: criado.outro } };
}

/**
 * Tira a célula da espera, uma vez só: o UPDATE só casa enquanto ela está em
 * `aguardando_avatar`, então dois despachantes (o orquestrador e este fallback, ou
 * duas rodadas) nunca disparam a mesma célula duas vezes.
 */
async function reivindicarCelula(sb: any, videoId: string, empresaId: string): Promise<boolean> {
  const { data, error } = await sb.from('videos_gerados')
    .update({ etapa: 'roteiro', updated_at: new Date().toISOString() })
    .eq('id', videoId).eq('empresa_id', empresaId).eq('etapa', ETAPA_AGUARDANDO_AVATAR)
    .select('id');
  if (error) throw new Error(`reivindicar ${videoId}: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Dispara o orquestrador do grupo. Se o disparo falhar, cada célula que ainda espera
 * sai pelo fluxo de hoje (a sua própria HeyGen), para nenhuma ficar parada em
 * `aguardando_avatar`. As células vêm do BANCO, não de quem chamou: uma célula que
 * ficou esperando numa rodada anterior também é pega aqui.
 */
export async function despacharGrupoAvatar(sb: any, p: { grupoId: string; empresaId: string }): Promise<{ via: 'grupo' | 'celula'; erros: string[] }> {
  try {
    await tasks.trigger<typeof gerarVideoGrupoTask>('gerar-video-grupo', { grupoId: p.grupoId }, regionOpts());
    return { via: 'grupo', erros: [] };
  } catch (e: any) {
    await cair('despacho', e?.message || String(e), { empresaId: p.empresaId, detalhe: { grupoId: p.grupoId } });
  }
  const erros: string[] = [];
  const { data: celulas, error: eCel } = await sb.from('videos_gerados').select('id, roteiro')
    .eq('avatar_grupo_id', p.grupoId).eq('empresa_id', p.empresaId).eq('etapa', ETAPA_AGUARDANDO_AVATAR);
  if (eCel) return { via: 'celula', erros: [`células do grupo: ${eCel.message}`] };
  for (const c of celulas || []) {
    try {
      if (!(await reivindicarCelula(sb, c.id, p.empresaId))) continue;
      await tasks.trigger<typeof gerarVideoModuloTask>('gerar-video-modulo', { videoId: c.id, roteiro: c.roteiro }, regionOpts());
    } catch (e: any) {
      const msg = String(e?.message || e).slice(0, 500);
      erros.push(`${c.id}: ${msg}`);
      const { error } = await sb.from('videos_gerados').update({ status: 'error', error: msg })
        .eq('id', c.id).eq('empresa_id', p.empresaId);
      if (error) console.error(`[avatar-grupo] ${c.id}: falha ao gravar status=error:`, error.message);
    }
  }
  return { via: 'celula', erros };
}
