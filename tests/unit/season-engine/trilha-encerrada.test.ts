import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODIGO_TRILHA_ENCERRADA, recusaTrilhaEncerrada, trilhaRecebeTrabalho } from '@/lib/season-engine/trilha-encerrada';
import { TRILHA } from '@/lib/status';

/**
 * Trilha ENCERRADA não recebe trabalho novo (09/10/2026, Temporada 1 de Ibipeba:
 * "nada deve ser feito nesta temporada mais"). Ela continua no histórico, só para
 * leitura; quem grava trabalho na semana pergunta a `trilhaRecebeTrabalho`.
 */
describe('trilhaRecebeTrabalho', () => {
  it('só a encerrada fecha a porta', () => {
    expect(trilhaRecebeTrabalho(TRILHA.ENCERRADA)).toBe(false);
    for (const s of [TRILHA.ATIVA, TRILHA.PAUSADA, TRILHA.CONCLUIDA, TRILHA.ARQUIVADA, null, undefined]) {
      expect(trilhaRecebeTrabalho(s as any)).toBe(true);
    }
  });

  it('a recusa é 409 com código estável', () => {
    const r = recusaTrilhaEncerrada();
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe(CODIGO_TRILHA_ENCERRADA);
  });
});

describe('quem grava trabalho na semana pergunta à régua (guard de fonte)', () => {
  const ler = (p: string) => readFileSync(p, 'utf8');

  // As quatro rotas carregam a trilha pelo `trilhaId` do CORPO: sem a checagem,
  // uma aba antiga aberta seguiria gravando na jornada encerrada.
  for (const rota of ['missao', 'reflection', 'tira-duvidas', 'evaluation']) {
    it(`api/temporada/${rota} recusa trilha encerrada e lê o status`, () => {
      const f = ler(`app/api/temporada/${rota}/route.ts`);
      expect(f).toMatch(/if \(!trilhaRecebeTrabalho\(trilha\.status\)\)/);
      // o select da trilha traz o status (sem ele a checagem passaria sempre)
      const select = f.slice(f.indexOf("sb.from('trilhas')"), f.indexOf("sb.from('trilhas')") + 300);
      expect(select).toMatch(/\.select\('[^']*\bstatus\b/);
    });
  }

  it('na rota de avaliação, as ações de LEITURA continuam liberadas (o bloqueio está no ramo que escreve)', () => {
    const f = ler('app/api/temporada/evaluation/route.ts');
    const ramo = f.slice(f.indexOf('if (!ACOES_DE_LEITURA.has(action)) {'), f.indexOf('if (!ACOES_DE_LEITURA.has(action)) {') + 500);
    expect(ramo).toMatch(/trilhaRecebeTrabalho\(trilha\.status\)/);
  });

  it('marcar conteúdo consumido e pausar/retomar respeitam a régua', () => {
    const f = ler('actions/temporadas.ts');
    const marcar = f.slice(f.indexOf('export async function marcarConteudoConsumido'), f.indexOf('export async function marcarConteudoConsumido') + 1500);
    expect(marcar).toMatch(/select\('empresa_id, colaborador_id, status, temporada_plano'\)/);
    expect(marcar).toMatch(/if \(!trilhaRecebeTrabalho\(t\.status\)\)/);
    const pausar = f.slice(f.indexOf('const _pausarRetomarTemporada'), f.indexOf('const _pausarRetomarTemporada') + 900);
    expect(pausar).toMatch(/if \(!trilhaRecebeTrabalho\(trilha\.status\)\) throw/);
  });

  it('o histórico mostra a encerrada (leitura), e não só a concluída', () => {
    const f = ler('app/dashboard/jornada/historico/historico-actions.ts');
    expect(f).toMatch(/STATUS_DO_HISTORICO: string\[\] = \[TRILHA\.CONCLUIDA, TRILHA\.ENCERRADA\]/);
    expect(f).toMatch(/\.in\('status', STATUS_DO_HISTORICO\)/);
    expect(f).toMatch(/!STATUS_DO_HISTORICO\.includes\(trilha\.status\)/);
  });
});
