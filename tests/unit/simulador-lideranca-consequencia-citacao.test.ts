/**
 * O acordo da consequência usa a MESMA régua de citação do avaliador
 * (revisão de 27/09/2026, item L-1).
 *
 * Até 27/09 o acordo era conferido por `includes` cru, e o avaliador por
 * `contemCitacao` (aspas, reticências, espaços e caixa equiparados). Com a
 * mesma fala e a mesma cópia do modelo, o avaliador aceitava e a consequência
 * recusava: o gerador reenviava uma vez e devolvia 502, e o encontro ORIGINAL
 * (que não pode ser abandonado) ficava sem conseguir encerrar. A sonda da
 * revisão provava o defeito; aqui ela está invertida.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { executarCore, validarConsequencia } from '@/lib/simulador-lideranca/core';
import { contemCitacao } from '@/lib/simuladores/citacao';
import { comandoSchema, type Comando, type Gerar } from '@/lib/simulador-lideranca/schema';
import { estado, gerarFixture, PLANO } from '../fixtures/simulador-lideranca';

const FALA_REAL = 'Combinado: você revisa o "fluxo de pedidos" até sexta... e me avisa\nse travar.';
const COPIA_CURVA = 'você revisa o “fluxo de pedidos” até sexta';

const casos: Array<[string, string]> = [
  ['aspas curvas', COPIA_CURVA],
  ['reticências em um caractere', 'até sexta… e me avisa'],
  ['quebra de linha virou espaço', 'e me avisa se travar.'],
  ['caixa na primeira letra', 'Você revisa o "fluxo de pedidos" até sexta'],
];
const episodio = { mensagens: [{ turno: 1, autor: 'lider' as const, texto: FALA_REAL }] };
const acordo = (trecho: string, turno = 1) => ({
  narrativa: 'x',
  pendencias: [],
  acordos: [{ descricao: 'Revisar o fluxo.', turno, trecho }],
});

describe('acordo da consequência × citação tolerante', () => {
  for (const [nome, trecho] of casos) {
    it(`${nome}: o avaliador aceita, e a consequência também`, () => {
      expect(contemCitacao(FALA_REAL, trecho)).toBe(true);
      expect(() => validarConsequencia(acordo(trecho), episodio)).not.toThrow();
    });
  }

  it('o que continua recusado: trecho que ninguém disse, turno errado e fala do personagem', () => {
    expect(() => validarConsequencia(acordo('você entrega o relatório na segunda'), episodio)).toThrow(
      'Acordo sem fala que o sustente',
    );
    expect(() => validarConsequencia(acordo(COPIA_CURVA, 2), episodio)).toThrow('Acordo sem');
    const doPersonagem = { mensagens: [{ turno: 1, autor: 'personagem' as const, texto: FALA_REAL }] };
    expect(() => validarConsequencia(acordo(COPIA_CURVA), doPersonagem)).toThrow('Acordo sem');
  });

  it('efeito no encerramento: avaliação e consequência passam, e o encontro conclui sem 502', async () => {
    const cmd = (acao: Comando['acao'], extra: object = {}) =>
      comandoSchema.parse({ acao, requestId: randomUUID(), revisao: 0, ...extra });
    const dossies = ['', '', '', '', ''];
    let s = estado();
    s = (await executarCore(s, cmd('iniciar'), gerarFixture, dossies)).estado;
    s = (await executarCore(s, cmd('planejar', { texto: PLANO }), gerarFixture, dossies)).estado;
    for (let i = 0; i < 3; i++)
      s = (await executarCore(s, cmd('responder', { texto: FALA_REAL }), gerarFixture, dossies)).estado;
    const etapas: string[] = [];
    // Gerador que imita o de produção: roda o `validar` e, na 2ª recusa, desiste com 502.
    const gerar: Gerar = async (etapa, dados, validar) => {
      etapas.push(etapa);
      if (etapa !== 'consequencia') {
        if (etapa === 'avaliador') {
          // A MESMA cópia tipográfica numa fala: o avaliador aceita.
          const base: any = await gerarFixture(etapa, dados);
          base.descritores = base.descritores.map((d: any) =>
            d.evidencias[0]?.fonte === 'fala'
              ? { ...d, evidencias: [{ fonte: 'fala', turno: 1, trecho: COPIA_CURVA }] }
              : d,
          );
          validar?.(base);
          return base;
        }
        return gerarFixture(etapa, dados, validar);
      }
      const saida = {
        narrativa: 'A equipe combinou revisar o fluxo.',
        pendencias: [],
        acordos: [{ descricao: 'Revisar o fluxo de pedidos até sexta.', turno: 1, trecho: COPIA_CURVA }],
      };
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        try {
          validar?.(saida as any);
          return saida as any;
        } catch {
          if (tentativa === 1) throw new Error('502: Não foi possível validar a resposta.');
        }
      }
      throw new Error('inalcançável');
    };
    const fim = await executarCore(
      s,
      cmd('encerrar', { texto: 'Percebi que perguntei pouco antes de propor.' }),
      gerar,
      dossies,
    );
    expect(etapas).toEqual(['avaliador', 'consequencia']);
    expect(fim.estado.concluidos).toHaveLength(1);
    expect(fim.arquivo?.consequencia?.acordos[0].trecho).toBe(COPIA_CURVA);
  });
});
