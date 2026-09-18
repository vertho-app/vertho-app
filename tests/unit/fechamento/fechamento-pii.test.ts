/**
 * PII do fechamento (18/09/2026): a extração da arguição passou a ir para a
 * redação final e para o auditor, e os dois chamadores de `pontuarFechamento`
 * desmascaravam listas de campos diferentes. Nome e dados são sintéticos.
 */
import { describe, it, expect } from 'vitest';
import { maskColaborador } from '@/lib/pii-masker';
import { desmascararResultadoFechamento, mascararExtracaoArguicao } from '@/lib/season-engine/fechamento-pii';

const { masked, map } = maskColaborador({ id: 'col-teste', nome_completo: 'Ana Beatriz Teste', email: 'ana@exemplo.com' } as any);
const ALIAS = masked!.nome;

describe('mascararExtracaoArguicao', () => {
  // O contrato do mascarador (`maskTextPII`) é nome COMPLETO, e-mail, telefone e
  // CPF; ele não detecta o primeiro nome solto. É o mesmo para a resposta ao
  // cenário, que já ia para a IA assim.
  const ext = {
    resumo: {
      leitura_geral: 'Ana Beatriz Teste sustentou bem.',
      sustentacao_mais_forte: 'Explicou o critério ao cliente.',
      fragilidade_mais_relevante: 'Escreva para ana@exemplo.com ou 21 99999-8888 depois.',
    },
    evidencias_por_descritor: [
      { descritor: 'Escuta', sustentou: 'aprofundou' as const, forca: 'forte' as const, citacao: 'eu, Ana Beatriz Teste, mudaria a ordem' },
    ],
  };

  it('mascara resumo e citações; classificação e descritor passam intactos', () => {
    const m = mascararExtracaoArguicao(ext, map)!;
    const tudo = JSON.stringify(m);
    expect(tudo).not.toContain('Ana Beatriz Teste');
    expect(tudo).not.toContain('ana@exemplo.com');
    expect(tudo).not.toContain('99999-8888');
    expect(m.evidencias_por_descritor[0].citacao).toBe(`eu, ${ALIAS}, mudaria a ordem`);
    expect(m.evidencias_por_descritor[0]).toMatchObject({ descritor: 'Escuta', sustentou: 'aprofundou', forca: 'forte' });
  });

  it('não muta a extração gravada (a pessoa relê a própria conversa)', () => {
    mascararExtracaoArguicao(ext, map);
    expect(ext.evidencias_por_descritor[0].citacao).toBe('eu, Ana Beatriz Teste, mudaria a ordem');
  });

  it('sem extração, null', () => {
    expect(mascararExtracaoArguicao(null, map)).toBeNull();
  });
});

describe('desmascararResultadoFechamento', () => {
  it('devolve o nome a TODO texto autoral: resumo, rascunho, justificativas e auditoria', () => {
    const parsed: any = {
      resumo_avaliacao: {
        mensagem_geral: `${ALIAS}, leitura.`,
        principal_avanco: `${ALIAS} leu o comprador`,
        principal_ponto_de_atencao: `${ALIAS} pode registrar`,
        mensagem_final: `${ALIAS}, você leva isso.`,
        evidencias_citadas: [`"${ALIAS} disse"`],
        proximos_passos: [`Combine com ${ALIAS}`],
      },
      resumo_avaliacao_rascunho: { mensagem_geral: `${ALIAS}, rascunho.`, proximos_passos: [`${ALIAS} faz`] },
      avaliacao_por_descritor: [{ descritor: 'Escuta', justificativa: `${ALIAS} ouviu`, trecho_cenario: `${ALIAS}:`, evidencia_acumulada: `${ALIAS} na sem 2`, nota_pos: 3 }],
      alertas_metodologicos: [`${ALIAS} sem acumulado`],
    };
    const auditoria: any = {
      resumo_auditoria: `${ALIAS} ok`,
      ponto_mais_confiavel: `${ALIAS} a`,
      ponto_mais_fragil: `${ALIAS} b`,
      alertas: [`${ALIAS} c`],
      ajustes_sugeridos: [{ descritor: 'Escuta', nota_pos_sugerida: 3, motivo: `${ALIAS} d` }],
    };
    desmascararResultadoFechamento(parsed, auditoria, map);
    const tudo = JSON.stringify({ parsed, auditoria });
    expect(tudo).not.toContain(ALIAS);
    expect(parsed.resumo_avaliacao.principal_avanco).toContain('Ana');
    expect(parsed.avaliacao_por_descritor[0].nota_pos).toBe(3);
    expect(auditoria.ajustes_sugeridos[0].nota_pos_sugerida).toBe(3);
  });

  it('campo ausente continua ausente (não vira string vazia)', () => {
    const parsed: any = { resumo_avaliacao: { mensagem_geral: `${ALIAS}, oi.` }, resumo_avaliacao_rascunho: null };
    desmascararResultadoFechamento(parsed, null, map);
    expect(Object.keys(parsed.resumo_avaliacao)).toEqual(['mensagem_geral']);
    expect(parsed.resumo_avaliacao_rascunho).toBeNull();
  });
});
