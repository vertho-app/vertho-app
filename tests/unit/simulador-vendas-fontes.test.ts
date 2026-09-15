import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  estadoDocumental,
  relatorioDocumental,
  estadoMatriz,
} from '../fixtures/simulador-vendas-matriz';
import { semViolacao } from '../fixtures/simulador-vendas';
import { gerenteDocumentalSchema, relatorioSchema } from '@/lib/simulador-vendas/schema';
import { validarRelatorio, executarCore, type Gerar } from '@/lib/simulador-vendas/core';
import { pontuarRelatorio } from '@/lib/simulador-vendas/avaliacao';

describe('devolutiva PACE com fontes documentais exclusivas', () => {
  it('exige referências válidas e preserva-as na leitura do relatório salvo', () => {
    const r = relatorioDocumental(),
      s = estadoDocumental();
    expect(() => validarRelatorio(r, s)).not.toThrow();
    expect(relatorioSchema.parse(r).Recomendacoes).toEqual(r.Recomendacoes);
    for (const alteracao of [
      { descritor: 'SPIN1' },
      { referencia_manual: 'livro_externo' },
      { referencia_manual: undefined },
      { descritor: undefined },
    ]) {
      const adulterado = structuredClone(r);
      Object.assign(adulterado.Recomendacoes[0], alteracao);
      expect(() => validarRelatorio(adulterado, s)).toThrow();
    }
  });
  it('rejeita critérios de descoberta de gabarito e classificação por preço ideal', () => {
    const s = estadoDocumental(),
      r = relatorioDocumental();
    expect(() => validarRelatorio({ ...r, Resultado: 'fechou_ideal' }, s)).toThrow('gabarito');
    expect(() =>
      validarRelatorio(
        {
          ...r,
          Beneficios_ocultos_descobertos: [
            { nome: 'Oculto', turno: 1, citacao_vendedor: s.mensagens[0].texto },
          ],
        },
        s,
      ),
    ).toThrow('gabarito');
    const schema = z.toJSONSchema(gerenteDocumentalSchema) as any;
    for (const campo of [
      'P',
      'A',
      'C',
      'E',
      'Media',
      'Violacoes',
      'Beneficios_ocultos_descobertos',
      'Objecoes_profundas_descobertas',
    ])
      expect(schema.properties).not.toHaveProperty(campo);
    function conferir(n: any) {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'object') {
        expect(n.additionalProperties).toBe(false);
        expect(n.required.sort()).toEqual(Object.keys(n.properties).sort());
      }
      Object.values(n).forEach((v) => (Array.isArray(v) ? v.forEach(conferir) : conferir(v)));
    }
    conferir(schema);
  });
  it('a mesma evidência produz a mesma nota sem descontos externos; pace-4 preserva a regra anterior', () => {
    const s = estadoDocumental(),
      r = relatorioDocumental();
    s.moderacoes = [
      {
        ...semViolacao,
        violacao: true,
        categoria: 'jailbreak',
        severidade: 'grave',
        motivo: 'Pedido de alterar a nota',
        turno: 1,
        fase: 'preparar',
      },
    ];
    const atual = pontuarRelatorio({ ...r, P: 10, Media: 10 }, s);
    expect(atual.P).toBe(7.5);
    expect(atual.Violacoes).toEqual([]);
    expect(pontuarRelatorio(r, { ...s, moderacoes: [] })).toEqual(atual);
    const legado = pontuarRelatorio(r, { ...s, versaoRegua: estadoMatriz().versaoRegua });
    expect(legado.P).toBe(5);
    expect(legado.Violacoes[0].reducao_aplicada).toBe(2.5);
  });
  it('gerente recebe apenas plano e diálogo; informações ocultas não atravessam a fronteira', async () => {
    const s = estadoDocumental();
    s.cenario!.personagem.negociacao.preco.ideal = 'MARCADOR_PRIVADO';
    const gerar = vi.fn(async (_etapa, dados, validar) => {
      expect(Object.keys(dados).sort()).toEqual(['planejamento', 'thread_completa']);
      expect(JSON.stringify(dados)).not.toContain('MARCADOR_PRIVADO');
      const r = relatorioDocumental();
      validar?.(r);
      return r;
    }) as unknown as Gerar;
    await executarCore(
      s,
      { acao: 'encerrar', requestId: crypto.randomUUID(), sessaoId: s.id, revisao: s.revisao },
      gerar,
    );
    expect(gerar).toHaveBeenCalledOnce();
  });
});
