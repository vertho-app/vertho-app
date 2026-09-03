import { describe, it, expect, beforeEach, vi } from 'vitest';
import { celulasServidas, motivoDaLacuna, reconciliarPersonalizados } from '@/lib/video/reconciliar-personalizados';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/** O teto de `db-max-rows` do PostgREST. É o que este mock existe para reproduzir. */
const TETO_POSTGREST = 1000;

let dados: Record<string, any[]> = {};

/**
 * 🔴 O MOCK PRECISA TRUNCAR, senão o teste não prova nada.
 *
 * `criarSupabaseMock` registra `.range()` mas devolve a lista inteira — contra
 * ele, a leitura sem paginação passaria feliz, que é exatamente o defeito de
 * 29/08/2026. Aqui o `lista` lê o `.range()` que a cadeia pediu e aplica o
 * mesmo corte que o PostgREST aplica: sem `.range()`, no máximo 1.000 linhas.
 */
const sb = criarSupabaseMock({
  lista: (tabela) => {
    const linhas = dados[tabela] || [];
    const ranges = sb.chamadas.filter((c) => c.tabela === tabela && c.metodo === 'range');
    const ultima = ranges[ranges.length - 1];
    if (!ultima) return linhas.slice(0, TETO_POSTGREST);
    const [de, ate] = ultima.args as [number, number];
    return linhas.slice(de, Math.min(ate + 1, de + TETO_POSTGREST));
  },
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

const ensureMock = vi.fn();
vi.mock('@/lib/video/ensure-render-worker', () => ({
  ensureRenderWorker: (...a: any[]) => ensureMock(...a),
}));

/**
 * F-V1 — vídeo nominal que nunca chega.
 *
 * `personalizeCell` fotografa a coorte no instante do render: quem entra depois
 * fica no deck genérico PARA SEMPRE, porque não há re-disparo. Some junto quem
 * falhou ('error') ou travou ('processing' sem fim). É degradação silenciosa —
 * a pessoa vê um vídeo, só que sem o nome, e nenhuma contagem acusa.
 *
 * As duas decisões que definem se a reconciliação acerta ou desperdiça render.
 */

describe('celulasServidas · só a cópia que a entrega lê', () => {
  const cel = (id: string, created_at: string, over: any = {}) =>
    ({ id, modulo_base_id: 'm1', empresa_id: 'e1', cargo: 'Gestão Escolar', disc_dominante: 'I', created_at, ...over });

  it('entre cópias da mesma célula, mantém a MAIS RECENTE', () => {
    // `resolverCelulaVideo` faz .order('created_at', desc).limit(1) — só ela é servida.
    const r = celulasServidas([
      cel('antiga', '2026-07-01T00:00:00Z'),
      cel('nova', '2026-07-20T00:00:00Z'),
      cel('meio', '2026-07-10T00:00:00Z'),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('nova');
  });

  it('células logicamente diferentes NÃO são fundidas', () => {
    const r = celulasServidas([
      cel('a', '2026-07-01T00:00:00Z'),
      cel('b', '2026-07-01T00:00:00Z', { disc_dominante: 'D' }),
      cel('c', '2026-07-01T00:00:00Z', { cargo: 'Coordenação Pedagógica' }),
      cel('d', '2026-07-01T00:00:00Z', { modulo_base_id: 'm2' }),
      cel('e', '2026-07-01T00:00:00Z', { empresa_id: 'e2' }),
    ]);
    expect(r).toHaveLength(5);
  });

  it('o caso real: 4 cópias da mesma célula viram 1', () => {
    // Medido em 27/07: sem esta redução a reconciliação reportava 83 pessoas em 16
    // células; com ela, 25 em 5 — e gastaria 4 renders para curar as MESMAS pessoas.
    const r = celulasServidas(['2026-07-01', '2026-07-05', '2026-07-09', '2026-07-14']
      .map((d, i) => cel(`c${i}`, `${d}T00:00:00Z`)));
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('c3');
  });

  it('lista vazia/nula não quebra', () => {
    expect(celulasServidas([])).toEqual([]);
    expect(celulasServidas(null as any)).toEqual([]);
  });
});

describe('motivoDaLacuna · quem precisa de re-render', () => {
  const AGORA = new Date('2026-07-27T12:00:00Z').getTime();
  const hMenos = (h: number) => new Date(AGORA - h * 3600_000).toISOString();

  it('sem registro → ausente (o caso de quem entrou depois do render)', () => {
    expect(motivoDaLacuna(undefined, AGORA)).toBe('ausente');
  });

  it('done → null: tem vídeo nominal, nada a fazer', () => {
    expect(motivoDaLacuna({ status: 'done', created_at: hMenos(100) }, AGORA)).toBeNull();
  });

  it('error → recupera', () => {
    expect(motivoDaLacuna({ status: 'error', created_at: hMenos(1) }, AGORA)).toBe('error');
  });

  it('processing RECENTE → null: está em andamento, não atropelar', () => {
    // Re-enfileirar aqui mataria uma personalização que ia terminar sozinha.
    expect(motivoDaLacuna({ status: 'processing', created_at: hMenos(0.5) }, AGORA)).toBeNull();
  });

  it('processing ANTIGO → travado (caso real: 5 presos desde 14-16/07)', () => {
    expect(motivoDaLacuna({ status: 'processing', created_at: hMenos(300) }, AGORA)).toBe('travado');
  });

  it('a fronteira de 2h é o que separa "em andamento" de "travado"', () => {
    expect(motivoDaLacuna({ status: 'processing', created_at: hMenos(1.9) }, AGORA)).toBeNull();
    expect(motivoDaLacuna({ status: 'processing', created_at: hMenos(2.1) }, AGORA)).toBe('travado');
  });

  it('pending segue a mesma régua de processing', () => {
    expect(motivoDaLacuna({ status: 'pending', created_at: hMenos(0.5) }, AGORA)).toBeNull();
    expect(motivoDaLacuna({ status: 'pending', created_at: hMenos(5) }, AGORA)).toBe('travado');
  });
});

/**
 * 🔴 O CASO REAL DE 29/08/2026 — a lacuna que não existia.
 *
 * O cron de sábado devolveu à fila 3 células de macae que tinham cobertura
 * NOMINAL COMPLETA, e elas ficaram presas em `render_queued` por 3 dias: 102
 * pessoas passaram a ver "estamos preparando seu vídeo" no lugar do vídeo com o
 * nome delas, que estava pronto no Bunny desde 17/08.
 *
 * A causa não estava em nenhuma das duas funções puras acima: estava na
 * LEITURA. `videos_personalizados` tinha 1.034 linhas nas células servidas e a
 * query sem `.range()` devolveu 1.000 — medido contra o PostgREST de produção.
 * As 34 que faltaram não chegaram como erro, chegaram como ausência, e ausência
 * aqui SIGNIFICA "esta pessoa não tem vídeo nominal".
 *
 * É a família do `.limit()` onde se DECIDE: o truncamento não parece um erro,
 * parece uma conclusão.
 */
describe('reconciliarPersonalizados · a leitura não pode virar amostra', () => {
  const CELULA = {
    id: 'cel-1', empresa_id: 'emp-1', cargo: 'Diretor(a) Escolar',
    disc_dominante: 'S', modulo_base_id: 'mb-1', created_at: '2026-08-17T00:00:00Z',
  };
  const pessoa = (i: number) => ({
    id: `colab-${i}`, nome_completo: `Pessoa ${i}`, cargo: 'Diretor(a) Escolar',
    perfil_dominante: 'S', empresa_id: 'emp-1',
  });

  beforeEach(() => {
    sb.reset();
    ensureMock.mockReset();
    ensureMock.mockResolvedValue({ provisioned: true, created: [1], alive: 1, reason: '+1 box' });
    dados = {};
  });

  const updatesDaCelula = () => sb.escritas.filter((e) => e.tabela === 'videos_gerados' && e.op === 'update');

  it('1.034 pessoas TODAS com vídeo nominal → nenhuma lacuna e nenhum render', async () => {
    // O denominador é de propósito maior que 1.000: com 999 o teste passaria
    // mesmo sem paginação, e provaria só que o código roda.
    const colabs = Array.from({ length: 1034 }, (_, i) => pessoa(i));
    dados = {
      videos_gerados: [CELULA],
      colaboradores: colabs,
      videos_personalizados: colabs.map((c) => ({
        cell_video_id: 'cel-1', colaborador_id: c.id, status: 'done', created_at: '2026-08-17T00:00:00Z',
      })),
    };

    const r = await reconciliarPersonalizados({ executar: true, limite: 3 });

    expect(r.pessoasSemVideoNominal).toBe(0);
    expect(r.lacunas).toHaveLength(0);
    expect(r.celulasReenfileiradas).toEqual([]);
    // O que custava dinheiro e derrubava a entrega: nenhuma escrita na célula.
    expect(updatesDaCelula()).toHaveLength(0);
  });

  it('as 34 do fim da lista contam como lacuna REAL quando de fato faltam', async () => {
    // O simétrico do teste acima: paginar não pode ESCONDER lacuna. Sem ler a
    // 2ª página, estas 34 sumiriam e a célula ficaria sem reconciliar para sempre.
    const colabs = Array.from({ length: 1034 }, (_, i) => pessoa(i));
    dados = {
      videos_gerados: [CELULA],
      colaboradores: colabs,
      videos_personalizados: colabs.slice(0, 1000).map((c) => ({
        cell_video_id: 'cel-1', colaborador_id: c.id, status: 'done', created_at: '2026-08-17T00:00:00Z',
      })),
    };

    const r = await reconciliarPersonalizados({ executar: false });

    expect(r.pessoasSemVideoNominal).toBe(34);
    expect(r.lacunas[0].faltantes.every((f) => f.motivo === 'ausente')).toBe(true);
  });

  /**
   * 🔴 Medido 03/09/2026: o total somava `faltantes.length` de cada célula, então a
   * mesma pessoa contava uma vez POR CÉLULA. O número dizia **12** onde havia **8
   * gente** — as 2 diretoras de macae apareciam 3× cada, uma por célula com
   * personalizado em erro. E ele sai com a palavra "pessoa(s)" ao lado em três
   * lugares: log do cron, `degradacao_log` e o alarme do health (R17).
   */
  it('🔴 a mesma pessoa em 2 células conta UMA vez — o campo diz "pessoas"', async () => {
    // Módulos DIFERENTES de propósito: `celulasServidas` deduplica por
    // (módulo × empresa × cargo × DISC), então duas células do mesmo módulo
    // virariam uma só. No caso real de macae são 3 módulos — 3 semanas — e as
    // mesmas 2 pessoas em todas.
    const duas = [['cel-1', 'mb-1'], ['cel-2', 'mb-2']].map(([id, mb]) => ({ ...CELULA, id, modulo_base_id: mb }));
    dados = {
      videos_gerados: duas,
      colaboradores: [pessoa(0), pessoa(1)],
      videos_personalizados: [],   // ninguém personalizado: 2 pessoas × 2 células = 4 pares
    };

    const r = await reconciliarPersonalizados({ executar: false });

    expect(r.lacunas).toHaveLength(2);
    expect(r.lacunas.reduce((s, l) => s + l.faltantes.length, 0), 'os pares continuam 4').toBe(4);
    expect(r.pessoasSemVideoNominal, 'mas gente são 2').toBe(2);
  });
});

/**
 * 🔴 O segundo defeito da mesma noite: o retorno de `ensureRenderWorker` era
 * DESCARTADO. "Não consegui subir box" chegava idêntico a "subiu", e o
 * comentário que prometia o contrário ("enfileirar sem provisionar seria trocar
 * sem vídeo nominal por célula presa") não tinha nenhum código atrás.
 */
describe('reconciliarPersonalizados · não enfileirar o que ninguém vai drenar', () => {
  const CELULA = {
    id: 'cel-1', empresa_id: 'emp-1', cargo: 'Diretor(a) Escolar',
    disc_dominante: 'S', modulo_base_id: 'mb-1', created_at: '2026-08-17T00:00:00Z',
  };

  beforeEach(() => {
    sb.reset();
    ensureMock.mockReset();
    dados = {
      videos_gerados: [CELULA],
      colaboradores: [{ id: 'colab-1', nome_completo: 'Ana', cargo: 'Diretor(a) Escolar', perfil_dominante: 'S', empresa_id: 'emp-1' }],
      videos_personalizados: [],
    };
  });

  const updatesDaCelula = () => sb.escritas.filter((e) => e.tabela === 'videos_gerados' && e.op === 'update');

  it('sem box viva: DESFAZ o enfileiramento e registra a degradação', async () => {
    ensureMock.mockResolvedValue({ provisioned: false, reason: 'sem HCLOUD_TOKEN' });

    const r = await reconciliarPersonalizados({ executar: true });

    const updates = updatesDaCelula();
    expect(updates).toHaveLength(2);
    expect(updates[0].payload.status).toBe('render_queued');
    expect(updates[1].payload.status).toBe('done');       // rollback
    // O log do cron não pode dizer "1 re-enfileirada" quando nada ficou na fila.
    expect(r.celulasReenfileiradas).toEqual([]);
    // A lacuna continua REPORTADA: desfazer não é fingir que estava tudo certo.
    expect(r.pessoasSemVideoNominal).toBe(1);
    expect(sb.escritas.some((e) => e.tabela === 'degradacao_log')).toBe(true);
  });

  it('exceção ao provisionar cai no mesmo rollback', async () => {
    ensureMock.mockRejectedValue(new Error('hetzner fora do ar'));

    const r = await reconciliarPersonalizados({ executar: true });

    expect(updatesDaCelula().at(-1)!.payload.status).toBe('done');
    expect(r.celulasReenfileiradas).toEqual([]);
  });

  it('box JÁ viva (provisioned:false legítimo) mantém o enfileiramento', async () => {
    // O caso que um rollback ingênuo quebraria: `deficit <= 0` devolve
    // `provisioned: false` porque já há box de sobra para a fila.
    ensureMock.mockResolvedValue({ provisioned: false, alive: 2, reason: '2 box(es) p/ fila 3 (desejado 1)' });

    const r = await reconciliarPersonalizados({ executar: true });

    const updates = updatesDaCelula();
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.status).toBe('render_queued');
    expect(r.celulasReenfileiradas).toEqual(['cel-1']);
    expect(sb.escritas.some((e) => e.tabela === 'degradacao_log')).toBe(false);
  });
});
