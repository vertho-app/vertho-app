/**
 * Fila de render da box Hetzner: claim, sinal de vida, reaper e o caminho
 * "só personalizar". Fica fora do worker.mjs para ser testável sem Remotion
 * (tests/unit/video/fila-render.test.ts).
 *
 * POR QUE O SINAL DE VIDA (27/09/2026)
 * O reaper devolvia à fila todo job em `rendering` há mais de 40 min, medido do
 * claim. Com uma box só ele nunca atuava (o loop não roda o reaper durante um
 * render). Com várias, a box vizinha devolveria o render SAUDÁVEL da outra: na
 * cx33, os 12 renders de 26/09 passaram TODOS de 40 min entre claim e upload
 * (43 a 63 min). Agora o worker renova `updated_at` a cada minuto enquanto o job
 * é dele, e o reaper distingue duas situações:
 *   - linha COM sinal (updated_at > claimed_at): parou de bater há REAP_COM_SINAL_MIN → worker morto;
 *   - linha SEM sinal desde o claim (worker de snapshot antigo, ou que morreu no
 *     1º minuto): só depois do teto do render + folga (reapSemSinalMin).
 * A 2ª regra é o que mantém a frota mista segura: uma box antiga, que não bate,
 * nunca é confundida com uma morta. `updated_at` é também o que o `video-stale`
 * do health lê, então "travado há 2h" passa a significar "sem sinal há 2h".
 */
import { writeFile, rm } from 'node:fs/promises';

/** Intervalo do sinal de vida. */
export const SINAL_DE_VIDA_MS = 60_000;
/** Linha que já bateu e parou de bater há este tanto: o worker dela morreu. */
export const REAP_COM_SINAL_MIN = 10;

/**
 * Linha sem sinal de vida: espera o watchdog do render (MAX_RENDER_MS) + 15 min
 * de masterização e upload. Mesma fórmula de `reapSemSinalMin` em
 * lib/video/ensure-render-worker.ts, que manda o valor pronto no REAP_AFTER_MIN
 * (é ele que protege a box de snapshot ANTIGO, que só conhece essa env).
 */
export function reapSemSinalMin(env = {}) {
  const explicito = Number(env.REAP_AFTER_MIN);
  if (explicito > 0) return explicito;
  const maxRenderMs = Number(env.MAX_RENDER_MS) || 2_400_000;
  return Math.max(40, Math.ceil(maxRenderMs / 60_000) + 15);
}

/** Tipo em DEGRADACAO (lib/degradacao.ts). Repetido aqui porque o worker não importa TypeScript. */
export const DEGRADACAO_DECK_PRESERVADO = 'deck-preservado-apos-falha';

/**
 * Claim atômico (FOR UPDATE SKIP LOCKED: nunca 2 workers no mesmo job).
 *
 * Ordem = ENTRADA NA FILA (`updated_at` do enfileiramento), não a criação do
 * vídeo. Por `created_at`, as células de 07/09 que o cron da 00:00 devolve à
 * fila passavam na frente do lote novo (27/09: 3 delas às 01h27, 02h43 e 03h58).
 *
 * `etapa_pedida` é a intenção de quem enfileirou: 'personalizar' vem da
 * reconciliação (lib/video/reconciliar-personalizados.ts) e pede só os nominais
 * sobre o deck JÁ publicado. `claim_token` é o claimed_at em texto (microssegundo
 * exato): o sinal de vida e a devolução só valem enquanto o claim for este.
 */
export const SQL_CLAIM = `
  WITH alvo AS (
    SELECT id, etapa FROM videos_gerados
    WHERE status='render_queued'
    ORDER BY updated_at, created_at
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  UPDATE videos_gerados v
     SET status='rendering',
         etapa=CASE WHEN alvo.etapa='personalizar' THEN 'personalizar' ELSE 'render' END,
         claimed_at=now(), updated_at=now()
    FROM alvo
   WHERE v.id = alvo.id
  RETURNING v.id, alvo.etapa AS etapa_pedida, v.claimed_at::text AS claim_token,
            v.render_inputprops, v.render_fingerprint, v.render_scale, v.roteiro,
            v.empresa_id, v.cargo, v.disc_dominante, v.bunny_video_id, v.bunny_library`;

export async function claim(pool) {
  const { rows } = await pool.query(SQL_CLAIM);
  return rows[0] || null;
}

export const SQL_REAP = `
  UPDATE videos_gerados SET status='render_queued', claimed_at=null, updated_at=now()
   WHERE status='rendering' AND (
         (updated_at > claimed_at AND updated_at < now() - ($1 || ' minutes')::interval)
      OR (updated_at <= claimed_at AND claimed_at < now() - ($2 || ' minutes')::interval))`;

/** Devolve à fila os jobs de worker morto. Retorna quantos. */
export async function reap(pool, { comSinalMin = REAP_COM_SINAL_MIN, semSinalMin }) {
  const { rowCount } = await pool.query(SQL_REAP, [String(comSinalMin), String(semSinalMin)]);
  return rowCount || 0;
}

/**
 * Renova `updated_at` enquanto o job estiver em `rendering` COM ESTE claim.
 * Depois que o upload base tira a linha de `rendering`, a batida vira no-op.
 * Devolve a função que para o intervalo.
 */
export function iniciarSinalDeVida(pool, job, { intervaloMs = SINAL_DE_VIDA_MS, log = () => {} } = {}) {
  let emVoo = false;
  const t = setInterval(async () => {
    if (emVoo) return;
    emVoo = true;
    try {
      await pool.query(
        `UPDATE videos_gerados SET updated_at=now() WHERE id=$1 AND status='rendering' AND claimed_at=$2::timestamptz`,
        [job.id, job.claim_token]);
    } catch (e) {
      log(`sinal de vida falhou (${job.id}):`, e?.message || e);
    } finally { emVoo = false; }
  }, intervaloMs);
  return () => clearInterval(t);
}

/**
 * Prova de que o deck publicado no Bunny é a revisão ATUAL da célula: existe uma
 * publicação base `publicado` com o mesmo bunny_video_id da linha e o mesmo
 * fingerprint do render_inputprops. Sem essa prova (deck anterior ao outbox de
 * 10/09, ou inputprops alterados depois do render) o caminho certo é o render
 * completo, não reaproveitar um deck que pode ser de outra composição.
 */
export async function provarDeckPublicado(pool, job, { biblioteca, pullZone }) {
  if (!pullZone) return { ok: false, motivo: 'box sem BUNNY_PULL_ZONE' };
  if (!job.bunny_video_id || !job.render_fingerprint) return { ok: false, motivo: 'célula sem deck publicado' };
  if (String(job.bunny_library || '') !== String(biblioteca || '')) return { ok: false, motivo: `deck em outra biblioteca (${job.bunny_library})` };
  const { rows } = await pool.query(
    `SELECT 1 FROM video_publicacoes
      WHERE cell_video_id=$1 AND colaborador_id IS NULL AND estado='publicado'
        AND bunny_video_id=$2 AND deck_fingerprint=$3
      LIMIT 1`,
    [job.id, job.bunny_video_id, job.render_fingerprint]);
  return rows.length ? { ok: true } : { ok: false, motivo: 'nenhuma publicação do deck com a revisão atual' };
}

/**
 * Baixa o ORIGINAL do deck (o mp4 masterizado que o próprio worker subiu) pela
 * pull zone. A CDN tem proteção de hotlink: o Referer precisa ser do domínio
 * (mesmo proxy de app/api/video-download). Confere tamanho e assinatura MP4
 * antes de gravar, porque um corpo truncado viraria N nominais quebrados.
 */
export async function baixarDeckPublicado({ guid, pullZone, referer, destino, fetchFn = fetch, timeoutMs = 300_000 }) {
  const r = await fetchFn(`https://${pullZone}/${guid}/original`, {
    headers: referer ? { Referer: referer } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`deck publicado indisponível: HTTP ${r.status}`);
  const esperado = Number(r.headers.get('content-length')) || 0;
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || (esperado && buf.length !== esperado)) throw new Error(`deck publicado incompleto: ${buf.length} de ${esperado || '?'} bytes`);
  if (buf.subarray(4, 8).toString('latin1') !== 'ftyp') throw new Error('deck publicado não é MP4');
  await writeFile(destino, buf);
  return { bytes: buf.length };
}

/**
 * Devolve a célula a `done` sem mexer no deck publicado (bunny_video_id e
 * video_url ficam como estavam). Só age se o claim ainda é o deste worker.
 */
export async function devolverCelulaPronta(pool, job) {
  const { rowCount } = await pool.query(
    `UPDATE videos_gerados SET status='done', etapa='done', updated_at=now()
      WHERE id=$1 AND status='rendering' AND claimed_at=$2::timestamptz`,
    [job.id, job.claim_token]);
  return rowCount || 0;
}

/**
 * Espelha `registrarDegradacao` (lib/degradacao.ts): uma linha por (fluxo, tipo,
 * chave), `ocorrencias` conta o dia UTC. Falhar aqui não pode derrubar o worker.
 */
export async function registrarDegradacaoVideo(pool, { tipo, chave, empresaId = null, severidade = 'aviso', detalhe = null }, log = () => {}) {
  try {
    await pool.query(
      `INSERT INTO degradacao_log (fluxo, tipo, chave, empresa_id, severidade, detalhe, ocorrencias, ultima_em, resolved_at, resolution)
       VALUES ('video', $1, $2, $3, $4, $5::jsonb, 1, now(), null, null)
       ON CONFLICT (fluxo, tipo, chave) DO UPDATE SET
         ocorrencias = CASE WHEN (degradacao_log.ultima_em AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
                            THEN degradacao_log.ocorrencias + 1 ELSE 1 END,
         empresa_id = excluded.empresa_id, severidade = excluded.severidade, detalhe = excluded.detalhe,
         ultima_em = now(), resolved_at = null, resolution = null`,
      [tipo, chave, empresaId, severidade, detalhe == null ? null : JSON.stringify(detalhe)]);
  } catch (e) {
    log('degradação não registrada (segue):', e?.message || e);
  }
}

/**
 * Falha de um job cuja célula JÁ TEM deck publicado (re-render da reconciliação
 * ou redisparo manual da mesma linha): a célula volta a `done` com o deck e os
 * nominais que já tocavam, e a falha fica no degradacao_log. Gravar `error`
 * aqui escondia tudo da entrega, porque `resolverCelulaVideo` filtra
 * `.neq('status','error')` (FMEA F-V8: 15/09 no escolas-acme; 22-26/09 em
 * macae, 30 professores sem vídeo). Devolve false quando a célula não tinha
 * deck e a falha segue o caminho normal (`status='error'`).
 */
export async function preservarDeckNaFalha(pool, job, erro, log = () => {}) {
  if (!job.bunny_video_id) return false;
  const devolvida = await devolverCelulaPronta(pool, job);
  await registrarDegradacaoVideo(pool, {
    tipo: DEGRADACAO_DECK_PRESERVADO,
    chave: job.id,
    empresaId: job.empresa_id || null,
    detalhe: {
      etapa: job.etapa_pedida || 'render',
      erro: String(erro?.message || erro).slice(0, 300),
      // 0 = o estado já tinha saído de `rendering` (upload base registrado, ou outro claim)
      devolvidaParaDone: devolvida > 0,
    },
  }, log);
  return true;
}

/**
 * Reconciliação (etapa 'personalizar'): faz os nominais sobre o deck JÁ
 * publicado, sem renderizar de novo. Antes, a personalização precisava do deck
 * em /tmp e por isso cada célula reconciliada pagava ~1 h de render para gerar
 * poucos nominais (27/09: 01h27 às 05h01 para 10 pessoas, na frente do lote novo).
 *
 * Devolve false quando não há prova de que o deck publicado é a revisão atual:
 * aí o render completo é o caminho certo. Falha no download NÃO cai no render
 * (seria 1 h de box por um soluço de CDN): a célula volta a `done` e a próxima
 * reconciliação tenta de novo.
 */
export async function personalizarDoDeckPublicado(job, d) {
  const log = d.log || (() => {});
  const prova = await provarDeckPublicado(d.pool, job, { biblioteca: d.biblioteca, pullZone: d.pullZone });
  if (!prova.ok) { log(`só personalizar indisponível (${prova.motivo}) ${job.id} → render completo`); return false; }

  const deck = `${d.tmpDir || '/tmp'}/${job.id}-publicado.mp4`;
  try {
    const { bytes } = await (d.baixar || baixarDeckPublicado)({ guid: job.bunny_video_id, pullZone: d.pullZone, referer: d.referer, destino: deck });
    log(`deck publicado baixado ${job.id} · ${(bytes / 1e6).toFixed(1)}MB · personalizando sem re-render…`);
  } catch (e) {
    await rm(deck, { force: true }).catch(() => {});
    await preservarDeckNaFalha(d.pool, job, e, log);
    log(`deck publicado não baixou ${job.id}: ${e?.message || e} (célula segue done)`);
    return true;
  }
  try {
    // Sai de `rendering` ANTES dos nominais, como o upload base faz no render completo.
    if (!(await devolverCelulaPronta(d.pool, job))) { log(`claim de ${job.id} mudou durante o download; personalização abandonada`); return true; }
    await d.personalizeCell(job, deck).catch((e) => log(`personalização falhou (deck OK) ${job.id}:`, e?.message || e));
  } finally { await rm(deck, { force: true }).catch(() => {}); }
  return true;
}

/** Um job da fila: só os nominais quando a reconciliação pediu e o deck prova a revisão; senão, render completo. */
export async function processarJob(job, d) {
  if (job.etapa_pedida === 'personalizar' && await personalizarDoDeckPublicado(job, d)) return 'personalizado';
  await d.renderizar(job);
  return 'renderizado';
}
