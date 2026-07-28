import { describe, it, expect, vi, beforeEach } from 'vitest';
import { montarSemanaAplicacao } from '@/lib/season-engine/build-season';
import { overlayKitNaSemana } from '@/lib/season-engine/kit/entrega-semana';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { PROGRAMA_REGULAR } from '@/lib/season-engine/programa-config';

/**
 * Dois pontos instrumentados (FMEA §3.3), nos dois sentidos:
 *  · build: IA da missão fora → placeholder E registro `missao-placeholder` (crítico);
 *  · overlay: sem kit do DISC → mantém o build E registra `kit-ausente-disc`
 *    (e NÃO registra na prévia do health, que não identifica a pessoa).
 *
 * Validado por mutação: remover o `registrarDegradacao` do catch de
 * montarSemanaAplicacao, ou o `if (!kit)` de overlayConteudo, quebra estes testes.
 */

const registrarSpy = vi.mocked(registrarDegradacao);

vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async () => { throw new Error('provedor de IA fora'); }),
}));

beforeEach(() => registrarSpy.mockClear());

describe('buildSeason · missão com IA falhando', () => {
  const descritores = [
    { competencia: 'Autocuidado', descritor: 'Regulação sob pressão', nota_atual: 1.5, semanas_ids: [1, 2] },
  ];

  it('cai no placeholder E registra missao-placeholder com severidade crítica', async () => {
    const plan = await montarSemanaAplicacao(
      4, descritores as any, 'Autocuidado', 'Gestão Escolar', 'generico',
      {} as any, PROGRAMA_REGULAR, ['Autocuidado'], 'emp-1',
    );

    // O fallback continua existindo (o placeholder é o comportamento de antes)…
    expect(plan.missao?.texto).toContain('Missão pendente');
    expect(plan.cenario?.texto).toContain('Cenário pendente');

    // …mas agora deixa rastro persistido: tipo, chave de dedup e severidade.
    expect(registrarSpy).toHaveBeenCalledTimes(1);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'build',
      tipo: DEGRADACAO.MISSAO_PLACEHOLDER,
      chave: 'emp-1:4',
      empresaId: 'emp-1',
      severidade: 'critico',
    }));
  });
});

describe('overlay · sem kit para o DISC da pessoa', () => {
  const semanaPlan = () => ({
    semana: 3, tipo: 'conteudo', descritor: 'Regulação sob pressão',
    conteudo: { formato_core: 'texto', formatos_disponiveis: {} },
  });
  const args = {
    empresaId: 'emp-1', disc: 'D', formatoPref: 'texto' as const,
    competenciaFoco: 'Autocuidado', kitsCache: new Map(), // cache vazio LEGÍTIMO = não há kits
  };

  it('mantém o conteúdo do build E registra kit-ausente-disc (dedup por colab:semana)', async () => {
    const plan = semanaPlan();
    await overlayKitNaSemana({} as any, plan, { ...args, colaboradorId: 'c1' });

    expect((plan.conteudo as any).kit_id).toBeUndefined(); // mantém o build
    expect(registrarSpy).toHaveBeenCalledTimes(1);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'overlay',
      tipo: DEGRADACAO.KIT_AUSENTE_DISC,
      chave: 'c1:3',
      colaboradorId: 'c1',
      empresaId: 'emp-1',
    }), expect.anything());
  });

  it('a prévia do health-check (sem colaboradorId) NÃO polui o log', async () => {
    await overlayKitNaSemana({} as any, semanaPlan(), args);
    expect(registrarSpy).not.toHaveBeenCalled();
  });
});
