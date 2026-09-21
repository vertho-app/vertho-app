import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (arquivo: string) => readFileSync(path.resolve(__dirname, `../../${arquivo}`), 'utf8');

describe('histórico das jornadas do participante', () => {
  it('lista apenas conclusões da pessoa autenticada e dentro do tenant', () => {
    const action = read('app/dashboard/jornada/historico/historico-actions.ts');

    expect(action).toContain('const ctx = await requireUserAction()');
    expect(action).toContain('findColabByEmail(');
    expect(action).toContain('ctx.email');
    expect(action).toContain('tenantDb(colab.empresa_id)');
    expect(action).toContain(".eq('colaborador_id', colab.id)");
    expect(action).toContain(".eq('status', TRILHA.CONCLUIDA)");
  });

  it('não aceita um id histórico sem provar que ele pertence à própria pessoa', () => {
    const action = read('app/dashboard/jornada/historico/historico-actions.ts');
    const detalhe = action.slice(action.indexOf('export async function loadJornadaHistorica'));

    expect(detalhe).toContain(".eq('id', trilhaId)");
    expect(detalhe).toContain(".eq('colaborador_id', colab.id)");
    expect(detalhe).toContain('trilha.status !== TRILHA.CONCLUIDA');
  });

  it('abre relatório e conteúdo com a trilha escolhida, sempre em leitura', () => {
    const detalhe = read('app/dashboard/jornada/historico/[trilhaId]/page.tsx');
    const semana = read('app/dashboard/temporada/semana/[week]/page.tsx');
    const relatorio = read('app/dashboard/temporada/concluida/page.tsx');

    expect(detalhe).toContain('/dashboard/temporada/concluida?trilha=');
    expect(detalhe).toContain('/dashboard/temporada/semana/${semana.semana}?trilha=');
    expect(semana).toContain("const trilhaHistoricaId = searchParams.get('trilha')");
    expect(semana).toContain('const visaoLeitura = !!colaboradorAlvo || !!trilhaHistoricaId');
    expect(relatorio).toContain('loadTemporadaConcluida(user.email, trilhaHistoricaId || undefined)');
  });

  it('o PDF e o certificado usam a mesma jornada selecionada na tela', () => {
    const relatorio = read('app/api/temporada/concluida/pdf/route.ts');
    const certificado = read('app/api/temporada/certificado/pdf/route.ts');

    for (const rota of [relatorio, certificado]) {
      expect(rota).toContain("searchParams.get('trilha')");
      expect(rota).toContain('trilhaId');
    }
  });
});
