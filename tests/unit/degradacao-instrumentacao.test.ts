import { describe, it, expect, vi, beforeEach } from 'vitest';
import { montarSemanaAplicacao } from '@/lib/season-engine/build-season';
import { overlayKitNaSemana } from '@/lib/season-engine/kit/entrega-semana';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { PROGRAMA_REGULAR } from '@/lib/season-engine/programa-config';

/**
 * Três pontos instrumentados (FMEA §3.3 + decisão de produto 28/07 "na construção,
 * falhe alto; na entrega, degrade registrando"):
 *  · build: IA da missão fora → REGISTRA `missao-placeholder` (crítico) E ABORTA
 *    o build com erro acionável (nada de placeholder persistido em produção);
 *  · overlay: sem kit do DISC → mantém o build E registra `kit-ausente-disc`
 *    (e NÃO registra na prévia do health, que não identifica a pessoa).
 *
 * Validado por mutação: remover o `registrarDegradacao` ou o `throw` do catch de
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

  it('registra missao-placeholder (crítico) E aborta o build com erro acionável — nada de placeholder persistido', async () => {
    // 28/07: na construção, falha alto. O catch registra E lança — a trilha
    // NÃO é construída (antes gravava "Missão pendente…" no plano, em produção).
    await expect(
      montarSemanaAplicacao(
        4, descritores as any, 'Autocuidado', 'Gestão Escolar', 'generico',
        {} as any, PROGRAMA_REGULAR, ['Autocuidado'], 'emp-1',
      ),
    ).rejects.toThrow('Semana 4 sem missão/cenário (falha na IA) — trilha não construída; rode de novo');

    // O registro continua existindo: tipo, chave de dedup e severidade.
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
