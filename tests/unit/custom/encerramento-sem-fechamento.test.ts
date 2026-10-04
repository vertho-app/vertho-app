import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * Personalizado SEM fechamento (03/10/2026): a trilha conclui na última semana
 * de conteúdo, na rota /reflection. Duas coisas a provar:
 *
 *  1. o relatório gravado ali é o de PROGRAMA COMPLETO (`montarReportSemFechamento`,
 *     que o certificado aceita), e não mais o da degustação;
 *  2. a 2ª competência só nasce se a 1ª trilha concluiu DE FATO: a releitura em
 *     `aposEncerramentoSemFechamento` decide.
 *  3. (R-138, 04/10/2026) o `update` que conclui a trilha LÊ o `{ error }`:
 *     `encerrarTrilhaSemFechamento` devolve a falha e a registra como crítica,
 *     em vez de a rota responder normalmente com a trilha aberta.
 *
 * Validado por mutação: trocar `naoConcluiu` por `false` derruba os dois casos
 * de "não encadeia"; ignorar o `error` do update derruba "falha do banco".
 */
const encadear = vi.hoisted(() => vi.fn(async () => ({ encadeou: true })));
vi.mock('@/lib/season-engine/encadear-jornada', () => ({ encadearAposConclusao: encadear }));
const registrar = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: registrar };
});

import { aposEncerramentoSemFechamento, encerrarTrilhaSemFechamento } from '@/lib/season-engine/encerramento-sem-fechamento';
import { DEGRADACAO } from '@/lib/degradacao';

const TRILHA = { id: 't1', empresa_id: 'e1', colaborador_id: 'c1' };

beforeEach(() => { encadear.mockClear(); registrar.mockClear(); });

describe('depois do encerramento sem fechamento', () => {
  it('trilha concluída: encadeia a próxima competência (se houver)', async () => {
    const tdb = criarSupabaseMock({ resolver: (t) => (t === 'trilhas' ? { status: 'concluida' } : null) });
    await aposEncerramentoSemFechamento({}, tdb.client, TRILHA);
    expect(encadear).toHaveBeenCalledWith({}, tdb.client, 't1');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('🔴 o update não pegou (trilha segue ativa): NÃO encadeia e registra crítico', async () => {
    const tdb = criarSupabaseMock({ resolver: (t) => (t === 'trilhas' ? { status: 'ativa' } : null) });
    await aposEncerramentoSemFechamento({}, tdb.client, TRILHA);
    expect(encadear).not.toHaveBeenCalled();
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      tipo: DEGRADACAO.ENCERRAMENTO_SEM_FECHAMENTO_FALHOU, chave: 't1', severidade: 'critico',
    }));
  });

  it('🔴 a releitura falhou: NÃO encadeia (falha de leitura não é "concluída")', async () => {
    const tdb = criarSupabaseMock({ resolver: () => ({ status: 'concluida' }) });
    tdb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    await aposEncerramentoSemFechamento({}, tdb.client, TRILHA);
    expect(encadear).not.toHaveBeenCalled();
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: DEGRADACAO.ENCERRAMENTO_SEM_FECHAMENTO_FALHOU }));
  });
});

describe('encerrarTrilhaSemFechamento (R-138): o update lê o erro', () => {
  const TRILHA_ABERTA = {
    id: 't1', empresa_id: 'e1', colaborador_id: 'c1', competencia_foco: 'Liderança',
    descritores_selecionados: [{ descritor: 'D1', competencia: 'Liderança', nota_atual: 1.8 }],
  };
  const gravacao = (tdb: any) => tdb.escritas.find((e: any) => e.tabela === 'trilhas' && e.op === 'update');

  it('conclui a trilha com o relatório de programa completo, só se ela ainda não concluiu', async () => {
    const tdb = criarSupabaseMock({ escrita: () => [{ id: 't1' }] });
    const r = await encerrarTrilhaSemFechamento(tdb.client, TRILHA_ABERTA);
    expect(r).toEqual({ ok: true, encerrou: true });
    expect(gravacao(tdb).payload.status).toBe('concluida');
    expect(gravacao(tdb).payload.evolution_report.sem_fechamento).toBe(true);
    const cadeia = tdb.chamadas.filter((c: any) => c.tabela === 'trilhas');
    expect(cadeia.some((c: any) => c.metodo === 'eq' && c.args[0] === 'empresa_id' && c.args[1] === 'e1')).toBe(true);
    // Trilha que JÁ concluiu não é reescrita: o relatório e a data originais ficam.
    expect(cadeia.some((c: any) => c.metodo === 'neq' && c.args[0] === 'status' && c.args[1] === 'concluida')).toBe(true);
  });

  it('trilha que já estava concluída: ok, mas `encerrou: false` (nada reescrito, nada encadeado)', async () => {
    const tdb = criarSupabaseMock({ escrita: () => [] });
    expect(await encerrarTrilhaSemFechamento(tdb.client, TRILHA_ABERTA)).toEqual({ ok: true, encerrou: false });
  });

  it('🔴 falha do banco: devolve a falha e registra CRÍTICO, em vez de fingir sucesso', async () => {
    const tdb = criarSupabaseMock();
    tdb.falharEm({ tabela: 'trilhas', op: 'update', mensagem: 'timeout no pool' });
    const r: any = await encerrarTrilhaSemFechamento(tdb.client, TRILHA_ABERTA);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('timeout no pool');
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      tipo: DEGRADACAO.ENCERRAMENTO_SEM_FECHAMENTO_FALHOU, chave: 't1', severidade: 'critico', empresaId: 'e1',
    }));
  });

  it('nunca lança, nem se o client estourar', async () => {
    const r: any = await encerrarTrilhaSemFechamento({ from: () => { throw new Error('client caiu'); } }, TRILHA_ABERTA);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('client caiu');
  });
});

describe('a rota /reflection usa o encerramento com erro lido e o pós-encerramento', () => {
  const ROTA = readFileSync(join(process.cwd(), 'app/api/temporada/reflection/route.ts'), 'utf-8');

  it('não conclui mais a trilha por um update solto: chama `encerrarTrilhaSemFechamento` e responde a falha', () => {
    expect(ROTA).toContain('encerrarTrilhaSemFechamento(sb, trilha)');
    expect(ROTA).not.toMatch(/\.from\('trilhas'\)\.update\(/);
    // Nos DOIS caminhos: ao concluir a última semana (devolve a fala da IA) e ao
    // retomar a conversa já encerrada (sem fala nova).
    expect(ROTA).toContain('if (!enc.ok) return respostaEncerramentoFalhou({ historico, message: respostaIA, turnIA: proximoTurnIA });');
    expect(ROTA).toContain('if (!enc.ok) return respostaEncerramentoFalhou({ historico, message: null, turnIA: turnsIA });');
  });

  it('a resposta de falha é 500 e carrega o estado real: conversa finalizada e a falha dita', () => {
    const corpo = ROTA.slice(ROTA.indexOf('function respostaEncerramentoFalhou'));
    expect(corpo).toMatch(/status: 500/);
    expect(corpo).toMatch(/finished: true, history: historico/);
    expect(corpo).toMatch(/encerramento: 'falhou'/);
  });

  it('o encadeamento roda depois da resposta, pela releitura, e só quando a trilha encerrou agora', () => {
    expect(ROTA).toMatch(/if \(enc\.encerrou\) after\(\(\) => aposEncerramentoSemFechamento\(/);
  });

  it('a conversa já encerrada tenta encerrar a trilha de novo (a 1ª tentativa pode ter falhado)', () => {
    expect(ROTA).toMatch(/prog\?\.status === PROGRESSO\.CONCLUIDO && deveEncerrarSemFechamento\(/);
  });
});
