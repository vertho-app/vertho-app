import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  SQL_CLAIM, SQL_REAP, reap, reapSemSinalMin, REAP_COM_SINAL_MIN, iniciarSinalDeVida,
  provarDeckPublicado, baixarDeckPublicado, preservarDeckNaFalha, DEGRADACAO_DECK_PRESERVADO, processarJob,
} from '@/worker-hetzner/fila.mjs';
import { DEGRADACAO } from '@/lib/degradacao';

const job = {
  id: 'cel-1', claim_token: '2026-09-27 10:00:00.123456+00', etapa_pedida: 'personalizar',
  bunny_video_id: 'guid-1', bunny_library: '636615', render_fingerprint: 'hash-atual', empresa_id: 'emp-1',
};
function pool(respostas: Array<{ rows?: unknown[]; rowCount?: number }> = []) {
  let i = 0;
  return { query: vi.fn(async (_sql: string, _args?: unknown[]) => respostas[i++] ?? { rows: [], rowCount: 0 }) };
}
const mp4 = (n = 64) => { const b = Buffer.alloc(n); b.write('ftyp', 4, 'latin1'); return b; };
const resposta = (buf: Buffer, init: { status?: number; length?: number } = {}) =>
  new Response(new Uint8Array(buf), { status: init.status ?? 200, headers: { 'content-length': String(init.length ?? buf.length) } });

afterEach(() => { vi.useRealTimers(); });

describe('fila: quem entra primeiro é atendido primeiro', () => {
  it('claim ordena pela entrada na fila, não pela criação do vídeo', () => {
    expect(SQL_CLAIM).toMatch(/ORDER BY updated_at, created_at\s+LIMIT 1 FOR UPDATE SKIP LOCKED/);
    expect(SQL_CLAIM).not.toMatch(/ORDER BY created_at/);
  });
  it('claim devolve a intenção de quem enfileirou e o token do claim', () => {
    expect(SQL_CLAIM).toContain('alvo.etapa AS etapa_pedida');
    expect(SQL_CLAIM).toContain('v.claimed_at::text AS claim_token');
    expect(SQL_CLAIM).toContain('v.bunny_video_id');
  });
});

describe('reaper só devolve job de worker morto', () => {
  it('sem sinal: espera o watchdog do render + 15 min, nunca menos de 40', () => {
    expect(reapSemSinalMin({ MAX_RENDER_MS: '5400000' })).toBe(105);
    expect(reapSemSinalMin({})).toBe(55);
    expect(reapSemSinalMin({ MAX_RENDER_MS: '600000' })).toBe(40);
    expect(reapSemSinalMin({ REAP_AFTER_MIN: '120', MAX_RENDER_MS: '5400000' })).toBe(120);
  });
  it('duas regras: linha que bateu usa o limite curto; linha que nunca bateu, o longo', async () => {
    const p = pool([{ rowCount: 2 }]);
    expect(await reap(p, { semSinalMin: 105 })).toBe(2);
    const [sql, args] = p.query.mock.calls[0];
    expect(sql).toBe(SQL_REAP);
    expect(args).toEqual([String(REAP_COM_SINAL_MIN), '105']);
    expect(SQL_REAP).toMatch(/updated_at > claimed_at AND updated_at < now\(\) - \(\$1/);
    expect(SQL_REAP).toMatch(/updated_at <= claimed_at AND claimed_at < now\(\) - \(\$2/);
  });
  it('sinal de vida renova updated_at só do claim deste worker, e para quando pedido', async () => {
    vi.useFakeTimers();
    const p = pool();
    const parar = iniciarSinalDeVida(p, job, { intervaloMs: 1000 });
    await vi.advanceTimersByTimeAsync(3000);
    parar();
    await vi.advanceTimersByTimeAsync(5000);
    expect(p.query).toHaveBeenCalledTimes(3);
    const [sql, args] = p.query.mock.calls[0];
    expect(sql).toContain("SET updated_at=now() WHERE id=$1 AND status='rendering' AND claimed_at=$2::timestamptz");
    expect(args).toEqual(['cel-1', job.claim_token]);
  });
});

describe('só personalizar exige prova de que o deck publicado é a revisão atual', () => {
  const cfg = { biblioteca: '636615', pullZone: 'cdn.exemplo' };
  it('com publicação da revisão atual: prova ok', async () => {
    const p = pool([{ rows: [{ '?column?': 1 }] }]);
    expect(await provarDeckPublicado(p, job, cfg)).toEqual({ ok: true });
    expect(p.query.mock.calls[0][1]).toEqual(['cel-1', 'guid-1', 'hash-atual']);
  });
  it('sem publicação da revisão atual: cai no render completo', async () => {
    const r = await provarDeckPublicado(pool([{ rows: [] }]), job, cfg);
    expect(r.ok).toBe(false);
  });
  it('sem pull zone, sem deck ou deck de outra biblioteca: nem consulta o banco', async () => {
    for (const [j, c] of [[job, { ...cfg, pullZone: '' }], [{ ...job, bunny_video_id: null }, cfg], [{ ...job, bunny_library: '999' }, cfg]] as const) {
      const p = pool();
      expect((await provarDeckPublicado(p, j, c)).ok).toBe(false);
      expect(p.query).not.toHaveBeenCalled();
    }
  });
});

describe('download do deck publicado não aceita arquivo quebrado', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fila-'));
  it('baixa o original pela pull zone com o Referer do domínio', async () => {
    const destino = path.join(dir, 'ok.mp4');
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => resposta(mp4()));
    expect(await baixarDeckPublicado({ guid: 'g', pullZone: 'cdn.exemplo', referer: 'https://www.vertho.ai/', destino, fetchFn })).toEqual({ bytes: 64 });
    expect(fetchFn.mock.calls[0][0]).toBe('https://cdn.exemplo/g/original');
    expect((fetchFn.mock.calls[0][1] as any).headers).toEqual({ Referer: 'https://www.vertho.ai/' });
    expect(readFileSync(destino).length).toBe(64);
  });
  it('corpo menor que o content-length, HTTP de erro ou não-MP4: falha sem gravar', async () => {
    const casos = [resposta(mp4(), { length: 999 }), resposta(mp4(), { status: 403 }), resposta(Buffer.alloc(64))];
    for (const [i, r] of casos.entries()) {
      const destino = path.join(dir, `ruim-${i}.mp4`);
      await expect(baixarDeckPublicado({ guid: 'g', pullZone: 'cdn', referer: '', destino, fetchFn: async () => r })).rejects.toThrow();
      expect(existsSync(destino)).toBe(false);
    }
  });
});

describe('reconciliação faz os nominais sem re-renderizar o deck', () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'fila-job-'));
  const deps = (p: ReturnType<typeof pool>, extra: Record<string, unknown> = {}) => ({
    pool: p, biblioteca: '636615', pullZone: 'cdn.exemplo', referer: 'https://www.vertho.ai/', tmpDir,
    renderizar: vi.fn(async () => {}), personalizeCell: vi.fn(async () => {}),
    baixar: vi.fn(async () => ({ bytes: 10 })), ...extra,
  });

  it('com prova do deck: baixa, devolve a célula a done e personaliza sobre o arquivo baixado', async () => {
    const p = pool([{ rows: [{}] }, { rowCount: 1 }]);
    const d = deps(p);
    expect(await processarJob(job, d)).toBe('personalizado');
    expect(d.renderizar).not.toHaveBeenCalled();
    expect((d.baixar.mock.calls[0] as any[])[0]).toMatchObject({ guid: 'guid-1', pullZone: 'cdn.exemplo' });
    expect(p.query.mock.calls[1][0]).toContain("SET status='done'");
    expect(d.personalizeCell).toHaveBeenCalledWith(job, `${tmpDir}/cel-1-publicado.mp4`);
  });

  it('sem prova do deck: render completo, como antes', async () => {
    const d = deps(pool([{ rows: [] }]));
    expect(await processarJob(job, d)).toBe('renderizado');
    expect(d.baixar).not.toHaveBeenCalled();
    expect(d.renderizar).toHaveBeenCalledWith(job);
  });

  it('download falhou: NÃO paga 1 h de render; célula volta a done com degradação', async () => {
    const p = pool([{ rows: [{}] }, { rowCount: 1 }, { rowCount: 1 }]);
    const d = deps(p, { baixar: vi.fn(async () => { throw new Error('HTTP 503'); }) });
    expect(await processarJob(job, d)).toBe('personalizado');
    expect(d.renderizar).not.toHaveBeenCalled();
    expect(d.personalizeCell).not.toHaveBeenCalled();
    expect(p.query.mock.calls.some(([s]) => s.includes('INSERT INTO degradacao_log'))).toBe(true);
  });

  it('claim perdido durante o download: não personaliza em nome de outro worker', async () => {
    const d = deps(pool([{ rows: [{}] }, { rowCount: 0 }]));
    await processarJob(job, d);
    expect(d.personalizeCell).not.toHaveBeenCalled();
    expect(d.renderizar).not.toHaveBeenCalled();
  });

  it('job de célula nova (etapa render) vai direto ao render, sem consultar o deck', async () => {
    const p = pool();
    const d = deps(p);
    expect(await processarJob({ ...job, etapa_pedida: 'render', bunny_video_id: null }, d)).toBe('renderizado');
    expect(p.query).not.toHaveBeenCalled();
  });
});

describe('falha em célula com deck publicado não esconde o deck (FMEA F-V8)', () => {
  it('volta a done pelo claim deste worker e registra a degradação', async () => {
    const p = pool([{ rowCount: 1 }, { rowCount: 1 }]);
    expect(await preservarDeckNaFalha(p, job, new Error('render watchdog'))).toBe(true);
    const [devolve, degradacao] = p.query.mock.calls;
    expect(devolve[0]).toContain("SET status='done', etapa='done'");
    expect(devolve[0]).toContain("status='rendering' AND claimed_at=$2::timestamptz");
    expect(devolve[0]).not.toContain('video_url');
    expect(degradacao[0]).toContain('INSERT INTO degradacao_log');
    expect(degradacao[1].slice(0, 3)).toEqual([DEGRADACAO_DECK_PRESERVADO, 'cel-1', 'emp-1']);
    expect(JSON.parse(degradacao[1][4] as string)).toMatchObject({ erro: 'render watchdog', devolvidaParaDone: true });
  });
  it('célula nova (sem deck) segue o caminho do erro', async () => {
    const p = pool();
    expect(await preservarDeckNaFalha(p, { ...job, bunny_video_id: null }, new Error('x'))).toBe(false);
    expect(p.query).not.toHaveBeenCalled();
  });
  it('falha ao registrar a degradação não derruba o worker', async () => {
    const p = { query: vi.fn().mockResolvedValueOnce({ rowCount: 1 }).mockRejectedValueOnce(new Error('db fora')) };
    await expect(preservarDeckNaFalha(p, job, new Error('x'))).resolves.toBe(true);
  });
  it('o literal do worker é o tipo do catálogo', () => {
    expect(DEGRADACAO_DECK_PRESERVADO).toBe(DEGRADACAO.DECK_PRESERVADO_APOS_FALHA);
  });
});
