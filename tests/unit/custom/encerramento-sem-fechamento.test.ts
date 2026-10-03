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
 *  2. a 2ª competência só nasce se a 1ª trilha concluiu DE FATO. O update de
 *     encerramento da rota não lê o `{ error }` (dívida declarada do guard E11,
 *     cujo texto não pode mudar sem encolher a allowlist), então quem decide é
 *     a releitura em `aposEncerramentoSemFechamento`.
 *
 * Validado por mutação: trocar `naoConcluiu` por `false` derruba os dois casos
 * de "não encadeia".
 */
const encadear = vi.hoisted(() => vi.fn(async () => ({ encadeou: true })));
vi.mock('@/lib/season-engine/encadear-jornada', () => ({ encadearAposConclusao: encadear }));
const registrar = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: registrar };
});

import { aposEncerramentoSemFechamento } from '@/lib/season-engine/encerramento-sem-fechamento';
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

describe('a rota /reflection usa o relatório de programa completo e o pós-encerramento', () => {
  const ROTA = readFileSync(join(process.cwd(), 'app/api/temporada/reflection/route.ts'), 'utf-8');

  it('o nome local antigo aponta para montarReportSemFechamento (não para a degustação)', () => {
    expect(ROTA).toMatch(/montarReportSemFechamento as montarReportDegustacao/);
  });

  it('o encadeamento roda depois da resposta, pela releitura', () => {
    expect(ROTA).toMatch(/after\(\(\) => aposEncerramentoSemFechamento\(/);
  });
});
