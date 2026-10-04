/**
 * `ia_jobs` em memória, com a semântica que a RESERVA EXCLUSIVA precisa provar
 * (`lib/ia-jobs.ts::reservarFaseDoLote`): o insert DEVOLVE a linha inserida (o
 * `bancoEmMemoria` oficial devolve a 1ª da tabela), cada operação é atômica no
 * instante em que roda, e entre uma operação e a seguinte de quem chama há um
 * ponto de espera. Duas chamadas concorrentes entrelaçam de verdade: as duas
 * inserem antes de qualquer uma ler, que é a corrida que o "ler e só depois
 * inserir" do guard antigo deixava passar.
 *
 * Só implementa o que o código sob teste usa: insert(+select/single), select,
 * update, delete, eq, in, order. Outra tabela lança.
 */
export interface JobFake {
  id: string;
  empresa_id: string;
  fase: string;
  status: string;
  params: any;
  progress: any;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobsEmMemoria {
  rows: JobFake[];
  /** O client no formato do `tenantDb`: `.from('ia_jobs')`. */
  tdb: { from: (tabela: string) => any };
  /** Programa erro na próxima operação `op` (insert, select, update, delete). */
  falharEm: (op: 'insert' | 'select' | 'update' | 'delete', mensagem: string) => void;
  /** Semeia uma linha pronta (para estados que o código sob teste não cria). */
  semear: (parcial: Partial<JobFake> & { fase: string }) => JobFake;
  /** O relógio da tabela: avança e devolve o instante (cada insert avança 1 s). */
  relogio: { ms: number };
  contagem: { insert: number; select: number; update: number; delete: number };
}

export function criarJobsEmMemoria(empresaId = 'emp', inicioMs = Date.parse('2026-10-04T12:00:00Z')): JobsEmMemoria {
  const rows: JobFake[] = [];
  const relogio = { ms: inicioMs };
  const contagem = { insert: 0, select: 0, update: 0, delete: 0 };
  const falhas: Array<{ op: string; mensagem: string }> = [];
  let seq = 0;
  const esperar = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

  function builder() {
    const q: any = { op: 'select', payload: null, filtros: [] as Array<(r: any) => boolean>, ordens: [] as any[], single: false, devolve: false };
    const api: any = {
      insert(p: any) { q.op = 'insert'; q.payload = p; return api; },
      update(p: any) { q.op = 'update'; q.payload = p; return api; },
      delete() { q.op = 'delete'; return api; },
      select() { if (q.op === 'insert') q.devolve = true; else q.op = 'select'; return api; },
      single() { q.single = true; return api; },
      maybeSingle() { q.single = true; return api; },
      eq(col: string, v: unknown) { q.filtros.push((r) => r[col] === v); return api; },
      in(col: string, vs: unknown[]) { q.filtros.push((r) => vs.includes(r[col])); return api; },
      order(col: string, opt?: { ascending?: boolean }) { q.ordens.push({ col, asc: opt?.ascending !== false }); return api; },
      then(res: any, rej: any) { return exec().then(res, rej); },
    };
    async function exec() {
      await esperar();
      const iFalha = falhas.findIndex((f) => f.op === q.op);
      if (iFalha >= 0) return { data: null, error: { message: falhas.splice(iFalha, 1)[0].mensagem } };
      contagem[q.op as keyof typeof contagem]++;
      const alvo = () => rows.filter((r) => q.filtros.every((f: any) => f(r)));
      if (q.op === 'insert') {
        relogio.ms += 1000;
        const agora = new Date(relogio.ms).toISOString();
        const linha: JobFake = {
          id: `job-${++seq}`, empresa_id: empresaId, status: 'queued', error: null, created_at: agora, updated_at: agora,
          ...structuredClone(q.payload),
        };
        rows.push(linha);
        return { data: q.devolve ? (q.single ? { id: linha.id } : [{ id: linha.id }]) : null, error: null };
      }
      if (q.op === 'update') {
        for (const r of alvo()) Object.assign(r, structuredClone(q.payload), { updated_at: new Date(relogio.ms).toISOString() });
        return { data: null, error: null };
      }
      if (q.op === 'delete') {
        for (const r of alvo()) rows.splice(rows.indexOf(r), 1);
        return { data: null, error: null };
      }
      const lista = alvo().sort((a: any, b: any) => {
        for (const { col, asc } of q.ordens) {
          if (a[col] === b[col]) continue;
          return (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      }).map((r) => structuredClone(r));
      return { data: q.single ? (lista[0] ?? null) : lista, error: null };
    }
    return api;
  }

  return {
    rows,
    relogio,
    contagem,
    tdb: {
      from(tabela: string) {
        if (tabela !== 'ia_jobs') throw new Error(`ia-jobs-em-memoria: tabela ${tabela} sem suporte`);
        return builder();
      },
    },
    falharEm: (op, mensagem) => { falhas.push({ op, mensagem }); },
    semear: (parcial) => {
      const agora = new Date(relogio.ms).toISOString();
      const linha: JobFake = {
        id: `job-${++seq}`, empresa_id: empresaId, status: 'running', params: {}, progress: {}, error: null,
        created_at: agora, updated_at: agora, ...parcial,
      } as JobFake;
      rows.push(linha);
      return linha;
    },
  };
}
