import { describe, expect, it, vi } from 'vitest';
import {
  executarCore,
  validarRelatorio,
  visaoPublica,
  type Gerar,
} from '@/lib/simulador-vendas/core';
import { comandoSchema, type Comando } from '@/lib/simulador-vendas/schema';
import {
  estado,
  relatorio,
  semViolacao,
  cenario,
} from '../fixtures/simulador-vendas';

const cmd = (acao: string, extra = {}) =>
  ({
    acao,
    requestId: '20000000-0000-4000-8000-000000000002',
    sessaoId: estado().id,
    revisao: 1,
    ...extra,
  }) as Comando;
const geracao = (moderacao = semViolacao) =>
  vi.fn(async (etapa: string, _v?: unknown, validar?: (v: any) => void) => {
    const v = structuredClone(
      {
        criador: cenario,
        moderador: moderacao,
        cliente: {
          fala: 'Bom dia. Podemos conversar.',
          fase: 'analisar',
          fase_mudou: true,
        },
        intencao: { intencao_encerrar: false, confianca: 'alta' },
        gerente: relatorio,
      }[etapa],
    );
    validar?.(v);
    return v;
  });
describe('simulador PACE — invariantes de conversa', () => {
  it('retorna apenas o contexto público, sem gabarito, briefing ou prompts', () => {
    const publico = visaoPublica(estado()),
      serializado = JSON.stringify(publico);
    expect(publico.cenario.nome).toBe('Beatriz');
    for (const segredo of [
      'GABARITO_RESERVADO',
      'PRECO_SECRETO',
      'BRIEFING_PRIVADO',
      'PROMPT_PRIVADO',
      'Previsibilidade',
    ])
      expect(serializado).not.toContain(segredo);
  });
  it('libera a devolutiva somente depois da avaliação da experiência', () => {
    const s = estado();
    s.status = 'concluida';
    s.relatorio = relatorio;
    expect(visaoPublica(s)).toMatchObject({
      relatorio: null,
      avaliacaoPendente: true,
      feedback: null,
    });
    s.feedback = {
      realismo: 5,
      desafio: 4,
      interacao: 5,
      utilidade: 4,
      aprendizado: 5,
      comentario: '',
    };
    expect(visaoPublica(s)).toMatchObject({
      relatorio: {
        ...relatorio,
        P: 3.1,
        A: 2.8,
        C: 2.5,
        E: 2.2,
        Media: 4,
        escalaNota: '1-4',
        escalaOriginal: '0-10',
      },
      avaliacaoPendente: false,
      feedback: s.feedback,
    });
  });
  it('preserva a primeira avaliação e recusa substituição silenciosa', async () => {
    const s = estado();
    s.status = 'concluida';
    s.relatorio = relatorio;
    s.feedback = {
      realismo: 5,
      desafio: 4,
      interacao: 5,
      utilidade: 4,
      aprendizado: 5,
      comentario: '',
    };
    await expect(
      executarCore(
        s,
        cmd('feedback', {
          revisao: s.revisao,
          requestId: '30000000-0000-4000-8000-000000000003',
          feedback: { ...s.feedback, realismo: 1 },
        }),
        geracao() as Gerar,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(s.feedback.realismo).toBe(5);
  });
  it('registra aviso moderado e ainda entrega a fala do cliente', async () => {
    const gerar = geracao({
      violacao: true,
      categoria: 'jailbreak',
      severidade: 'moderada',
      acao_sugerida: 'avisar_vendedor',
      confianca: 'alta',
      motivo: 'Mantenha a negociação.',
    });
    const s = await executarCore(
      estado(),
      cmd('responder', { mensagem: 'Bom dia' }),
      gerar as Gerar,
    );
    expect(s.mensagens.map((m) => m.autor)).toEqual(['vendedor', 'cliente']);
    expect(visaoPublica(s).aviso).toBe('Mantenha a negociação.');
    expect(gerar.mock.calls.map((c) => c[0])).toEqual([
      'moderador',
      'cliente',
      'intencao',
    ]);
  });
  it('encerra de fato uma violação grave e não gera cliente, relatório nem aceita outro turno', async () => {
    const gerar = geracao({
      violacao: true,
      categoria: 'ameaca',
      severidade: 'grave',
      acao_sugerida: 'encerrar_sessao',
      confianca: 'alta',
      motivo: 'Ameaça.',
    });
    const s = await executarCore(
      estado(),
      cmd('responder', { mensagem: 'Mensagem inadequada.' }),
      gerar as Gerar,
    );
    expect(s.status).toBe('interrompida');
    expect(gerar).toHaveBeenCalledTimes(1);
    for (const acao of ['responder', 'encerrar'])
      await expect(
        executarCore(
          s,
          cmd(acao, {
            mensagem: 'Outra',
            revisao: s.revisao,
            requestId: 'outro',
          }),
          gerar as Gerar,
        ),
      ).rejects.toThrow();
    expect(gerar).toHaveBeenCalledTimes(1);
  });
  it('confiança baixa não força encerramento', async () => {
    const gerar = geracao({
      violacao: true,
      categoria: 'ameaca',
      severidade: 'grave',
      acao_sugerida: 'encerrar_sessao',
      confianca: 'baixa',
      motivo: 'Ambiguidade.',
    });
    expect(
      (
        await executarCore(
          estado(),
          cmd('responder', { mensagem: 'Vamos conversar.' }),
          gerar as Gerar,
        )
      ).status,
    ).toBe('em_andamento');
  });
  it('repetir o mesmo request não paga outros agentes; mesmo ID com outro texto é conflito', async () => {
    const gerar = geracao(),
      comando = cmd('responder', { mensagem: 'Bom dia' });
    const s = await executarCore(estado(), comando, gerar as Gerar);
    expect(await executarCore(s, comando, gerar as Gerar)).toBe(s);
    expect(gerar).toHaveBeenCalledTimes(3);
    await expect(
      executarCore(
        s,
        { ...comando, mensagem: 'Texto adulterado' } as Comando,
        gerar as Gerar,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('revisão obsoleta falha antes de pagar IA', async () => {
    const gerar = geracao();
    await expect(
      executarCore(
        estado(),
        cmd('responder', { mensagem: 'Olá', revisao: 0 }),
        gerar as Gerar,
      ),
    ).rejects.toThrow('outra aba');
    expect(gerar).not.toHaveBeenCalled();
  });
  it('falha na geração não modifica o estado de entrada', async () => {
    const s = estado(),
      gerar = vi
        .fn()
        .mockResolvedValueOnce(semViolacao)
        .mockRejectedValueOnce(new Error('timeout'));
    await expect(
      executarCore(s, cmd('responder', { mensagem: 'Olá' }), gerar as Gerar),
    ).rejects.toThrow('timeout');
    expect(s.mensagens).toEqual([]);
    expect(s.revisao).toBe(1);
  });
  it('não reabre conversa concluída e reutiliza o relatório', async () => {
    const s = estado();
    s.status = 'concluida';
    s.relatorio = relatorio;
    const gerar = geracao();
    expect(await executarCore(s, cmd('encerrar'), gerar as Gerar)).toBe(s);
    await expect(
      executarCore(s, cmd('responder', { mensagem: 'Olá' }), gerar as Gerar),
    ).rejects.toThrow();
    expect(gerar).not.toHaveBeenCalled();
  });
  it('calcula a média e recusa citações de outro autor/turno', () => {
    const s = estado();
    s.mensagens = [
      {
        id: '1',
        autor: 'cliente',
        turno: 1,
        texto: 'Preciso de previsibilidade.',
        fase: 'analisar',
      },
    ];
    const r = structuredClone(relatorio);
    validarRelatorio(r, s);
    expect(r.Media).toBe(5.5);
    r.Beneficios_ocultos_descobertos = [
      {
        nome: 'Previsibilidade',
        turno: 1,
        citacao_vendedor: 'Preciso de previsibilidade.',
      },
    ];
    expect(() => validarRelatorio(r, s)).toThrow('vendedor');
    s.mensagens[0].autor = 'vendedor';
    expect(() => validarRelatorio(r, s)).not.toThrow();
    r.Beneficios_ocultos_descobertos[0].turno = 2;
    expect(() => validarRelatorio(r, s)).toThrow();
  });
  it('não aceita dono/empresa forjados em campos extras do comando', () => {
    expect(
      comandoSchema.safeParse({
        ...cmd('responder', { mensagem: 'Olá' }),
        owner_key: 'admin:outro',
      }).success,
    ).toBe(false);
    expect(
      comandoSchema.safeParse(cmd('responder', { mensagem: 'x'.repeat(4001) }))
        .success,
    ).toBe(false);
  });
});
