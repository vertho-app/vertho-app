/**
 * Orquestrador do AVATAR COMPARTILHADO (`VIDEO_AVATAR_GRUPO=on`): as células DISC de
 * um mesmo módulo e cargo dividem UM avatar, o da 1ª célula (a "mãe").
 *
 * O avatar (abertura + fecho na HeyGen) é ~US$ 0,59 de um vídeo de ~US$ 0,90, e o
 * texto dele é o mesmo nas 4 células desde que o Kit passou a escrevê-lo 1× por grupo
 * (`lib/video/avatar-grupo-core.ts`). Aqui:
 *   1. lê do banco as células do grupo que esperam (`etapa = aguardando_avatar`);
 *   2. grupo já `pronto` → todas saem como irmãs, com o avatar gravado;
 *   3. senão, gera a mãe (`triggerAndWait`: a espera é checkpointada, sem cobrança
 *      ociosa), grava o avatar dela no grupo e dispara as irmãs;
 *   4. mãe que falhou, ou sem as duas cenas de avatar, ou sem F0 medida, NÃO vira
 *      referência: grupo `erro`, irmãs no fluxo de hoje (cada uma com a sua HeyGen) e
 *      degradação. Narração única NÃO é condição (25/09/2026): no piloto ela foi recusada
 *      nas 3 células, e exigi-la fazia o grupo quase nunca pegar.
 *
 * Invariantes: o grupo não muda depois de `pronto` (uma nova rodada reabre só um grupo
 * em `erro`); cada célula sai da espera por um UPDATE condicionado à etapa, então nunca
 * é disparada duas vezes; os assets da mãe em `video-assets/{maeId}/` são lidos pelas
 * irmãs e NÃO podem ser apagados enquanto elas existirem.
 *
 * REST direto (como `gerar-video-modulo`), sem supabase-js no worker.
 */
import { task } from '@trigger.dev/sdk';
import { gerarVideoModuloTask, type AvatarDaMae } from './gerar-video-modulo';
import { SUPA, KEY } from '../lib/video/render-helpers';
import { regionOpts } from '../lib/trigger-region';
import { registrarDegradacao, DEGRADACAO } from '../lib/degradacao';
import { AVATAR_GRUPO } from '../lib/status';
import { ETAPA_AGUARDANDO_AVATAR, type AvatarGrupoPayload } from '../lib/video/avatar-grupo';

interface Grupo {
  id: string;
  empresa_id: string;
  modulo_base_id: string;
  cargo: string;
  status: string;
  intro: any;
  outro: any;
  avatar: (AvatarDaMae['avatar'] & { referencia?: AvatarDaMae['referencia'] }) | null;
  f0_hz: number | null;
  assinatura: string | null;
}
interface Membro { id: string; disc_dominante: string | null; roteiro: any }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const ORDEM_DISC = ['D', 'I', 'S', 'C'];

async function rest<T = any>(caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPA}/rest/v1/${caminho}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${caminho.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

async function lerGrupo(grupoId: string): Promise<Grupo> {
  const rows = await rest<Grupo[]>(`video_avatar_grupo?id=eq.${grupoId}&select=id,empresa_id,modulo_base_id,cargo,status,intro,outro,avatar,f0_hz,assinatura`);
  if (!rows?.[0]) throw new Error(`grupo ${grupoId} não encontrado`);
  return rows[0];
}

async function atualizarGrupo(g: Grupo, campos: Record<string, unknown>): Promise<void> {
  await rest(`video_avatar_grupo?id=eq.${g.id}&empresa_id=eq.${g.empresa_id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...campos, updated_at: new Date().toISOString() }),
  });
}

/**
 * Células que esperam este grupo. O filtro repete empresa, módulo e cargo do grupo:
 * uma célula de outro tenant que apontasse para este `avatar_grupo_id` não recebe o
 * avatar dele.
 */
async function membrosEsperando(g: Grupo): Promise<Membro[]> {
  const q = [
    `avatar_grupo_id=eq.${g.id}`, `empresa_id=eq.${g.empresa_id}`, `modulo_base_id=eq.${g.modulo_base_id}`,
    `cargo=eq.${encodeURIComponent(g.cargo)}`, `etapa=eq.${ETAPA_AGUARDANDO_AVATAR}`, 'status=eq.processing',
    'select=id,disc_dominante,roteiro', 'order=created_at.asc',
  ].join('&');
  const rows = await rest<Membro[]>(`videos_gerados?${q}`);
  const ordem = (m: Membro) => { const i = ORDEM_DISC.indexOf(String(m.disc_dominante || '')); return i < 0 ? 9 : i; };
  return [...(rows || [])].sort((a, b) => ordem(a) - ordem(b));
}

/** Tira a célula da espera. `false` = outra rodada já a tirou (não dispara de novo). */
async function reivindicar(g: Grupo, videoId: string): Promise<boolean> {
  const rows = await rest<{ id: string }[]>(
    `videos_gerados?id=eq.${videoId}&empresa_id=eq.${g.empresa_id}&etapa=eq.${ETAPA_AGUARDANDO_AVATAR}&select=id`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ etapa: 'roteiro', updated_at: new Date().toISOString() }) },
  );
  return Array.isArray(rows) && rows.length > 0;
}

/** Número de verdade: `Number(null)` é 0 e passaria por "medido". */
const ehNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Payload da irmã a partir do grupo gravado. `null` = o grupo não tem o que reaproveitar. */
export function payloadDoGrupo(g: Pick<Grupo, 'id' | 'avatar' | 'f0_hz' | 'assinatura' | 'intro' | 'outro'>): AvatarGrupoPayload | null {
  const a = g.avatar;
  const ok = (x: any) => !!(x?.src && x?.audioSrc);
  // Sem a régua da emenda (grupo gravado antes de 26/09/2026), a irmã não teria como
  // conferir ritmo e nível: o grupo não é reaproveitável.
  const ref = a?.referencia;
  if (!ref || !(Number(ref.pps) > 0) || !ehNumero(ref.nivelDb)) return null;
  if (!a || !ok(a.intro) || !ok(a.outro) || !(Number(g.f0_hz) > 0) || !g.assinatura || !g.intro?.narration || !g.outro?.narration) return null;
  return {
    grupoId: g.id, assinatura: g.assinatura, f0Hz: Number(g.f0_hz),
    referencia: { takeUnico: !!ref.takeUnico, nivelDb: ref.nivelDb as number, pps: Number(ref.pps) },
    textos: { intro: g.intro, outro: g.outro },
    avatar: { intro: a.intro!, outro: a.outro! },
  };
}

/** Por que a mãe NÃO serve de referência (ou `null`, se serve). */
export function problemaDaMae(res: { ok: boolean; output?: any; error?: unknown }): string | null {
  if (!res.ok) return `mãe falhou: ${String((res.error as any)?.message || JSON.stringify(res.error) || 'erro').slice(0, 200)}`;
  const g = res.output?.grupo as AvatarDaMae | undefined;
  if (!g) return 'mãe não devolveu o avatar';
  if (!g.avatar?.intro?.audioSrc || !g.avatar?.outro?.audioSrc) return 'mãe sem as duas cenas de avatar prontas';
  if (!(Number(g.f0Hz) > 0)) return 'mãe sem F0 medida no áudio do avatar';
  if (!(Number(g.referencia?.pps) > 0) || !ehNumero(g.referencia?.nivelDb)) return 'mãe sem ritmo ou nível medidos no avatar';
  return null;
}

async function dispararCelulas(g: Grupo, membros: Membro[], avatarGrupo: AvatarGrupoPayload | null): Promise<string[]> {
  const livres: Membro[] = [];
  for (const m of membros) if (await reivindicar(g, m.id)) livres.push(m);
  if (!livres.length) return [];
  await gerarVideoModuloTask.batchTrigger(livres.map((m) => ({
    payload: { videoId: m.id, roteiro: m.roteiro, ...(avatarGrupo ? { avatarGrupo } : {}) },
    options: regionOpts(),
  })));
  return livres.map((m) => m.id);
}

const degradar = (g: Grupo, fase: string, erro: string, detalhe: Record<string, unknown> = {}) => registrarDegradacao({
  fluxo: 'video', tipo: DEGRADACAO.VIDEO_AVATAR_GRUPO_FALLBACK, chave: `grupo:${fase}`,
  empresaId: g.empresa_id, severidade: 'aviso', detalhe: { fase, grupoId: g.id, erro: erro.slice(0, 300), ...detalhe },
});

export async function executarGrupoAvatar({ grupoId }: { grupoId: string }) {
  const g = await lerGrupo(grupoId);
  try {
    const esperando = await membrosEsperando(g);
    if (!esperando.length) return { ok: true, grupoId, motivo: 'nenhuma célula esperando' };

    const pronto = g.status === AVATAR_GRUPO.PRONTO ? payloadDoGrupo(g) : null;
    if (pronto) {
      const irmas = await dispararCelulas(g, esperando, pronto);
      return { ok: true, grupoId, mae: null, irmas };
    }

    const [mae, ...resto] = esperando;
    if (!(await reivindicar(g, mae.id))) return { ok: true, grupoId, motivo: 'outra rodada já está com a mãe' };
    await atualizarGrupo(g, { status: AVATAR_GRUPO.PENDENTE, mae_video_id: mae.id, erro: null });
    const res = await gerarVideoModuloTask.triggerAndWait({ videoId: mae.id, roteiro: mae.roteiro, papelGrupo: 'mae' }, regionOpts());

    const problema = problemaDaMae(res as any);
    if (problema) {
      await atualizarGrupo(g, { status: AVATAR_GRUPO.ERRO, erro: problema });
      await degradar(g, 'mae', problema, { maeVideoId: mae.id });
      const irmas = await dispararCelulas(g, resto, null);
      return { ok: false, grupoId, mae: mae.id, problema, irmas };
    }

    const doMae = (res as any).output.grupo as AvatarDaMae;
    const avatar = { ...doMae.avatar, referencia: doMae.referencia };
    await atualizarGrupo(g, { status: AVATAR_GRUPO.PRONTO, avatar, f0_hz: doMae.f0Hz, assinatura: doMae.assinatura });
    const payload = payloadDoGrupo({ ...g, avatar, f0_hz: doMae.f0Hz, assinatura: doMae.assinatura });
    // Relê: uma célula inserida enquanto a mãe rodava também entra como irmã.
    const irmas = await dispararCelulas(g, await membrosEsperando(g), payload);
    return { ok: true, grupoId, mae: mae.id, irmas };
  } catch (e: any) {
    // Nada pode ficar em `aguardando_avatar` sem dono: o que sobrou sai pelo fluxo de hoje.
    const msg = String(e?.message || e);
    console.error(`[gerar-video-grupo] ${grupoId}: ${msg}`);
    await atualizarGrupo(g, { status: AVATAR_GRUPO.ERRO, erro: msg.slice(0, 500) }).catch(() => {});
    await degradar(g, 'orquestrador', msg);
    const sobra = await membrosEsperando(g).catch(() => [] as Membro[]);
    await dispararCelulas(g, sobra, null).catch((e2) => console.error(`[gerar-video-grupo] ${grupoId}: fallback falhou:`, e2?.message || e2));
    throw e;
  }
}

export const gerarVideoGrupoTask = task({
  id: 'gerar-video-grupo',
  machine: 'small-1x',
  // Só orquestra: o tempo de espera pela mãe é checkpointado e não conta aqui.
  maxDuration: 900,
  // Sem retry: repetir dispararia a mãe de novo. A queda já despacha as células.
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 4 },
  run: executarGrupoAvatar,
});
