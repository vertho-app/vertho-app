import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RELATORIO_GESTOR_SYSTEM, RELATORIO_RH_SYSTEM } from '@/lib/relatorios/prompts';
import { normalizeManagerReportInsight } from '@/lib/relatorios/dashboard-insights';

/**
 * Relatório do GESTOR e do RH, prompts (R-36, 04/10/2026).
 *
 * O que estava errado, medido no código:
 *  (1) o prompt mandava "Celebre evolução com força", mas recebe só o NÍVEL ATUAL
 *      de cada competência: sem histórico, qualquer "evolução" era invenção;
 *  (2) pedia para citar "a nota" e para o campo `nivel` "bater com a nota que você
 *      cita no texto", e o schema trazia `media_nivel: 2.3`: decimais no texto e
 *      no JSON que a tela e o PDF leem;
 *  (3) o prompt do RH mandava listar "alto desempenho";
 *  (4) o card "Próxima decisão" lê `acoes.acao_principal`, que o schema NÃO
 *      pedia: em cliente real o card mostrava sempre o texto de reserva (medido:
 *      2 relatórios de gestor reais, nenhum com o campo).
 *
 * O schema de exemplo do prompt é JSON válido de propósito: o teste o lê como o
 * leitor da tela lê, e prova que o que o prompt pede é o que o consumidor usa.
 */

function schemaDe(system: string): any {
  const ini = system.indexOf('FORMATO OBRIGATÓRIO:') + 'FORMATO OBRIGATÓRIO:'.length;
  const fim = system.indexOf('REGRAS:');
  return JSON.parse(system.slice(ini, fim).trim());
}

describe('prompt do relatório do gestor', () => {
  const SYSTEM = RELATORIO_GESTOR_SYSTEM;

  it('não manda celebrar evolução que os dados não mostram, e diz que só há o nível atual', () => {
    expect(SYSTEM).not.toMatch(/Celebre evolu/i);
    expect(SYSTEM).toContain('sem histórico');
    expect(SYSTEM).toContain('não afirme evolução');
  });

  it('pede NÍVEL inteiro e proíbe nota decimal, média e "X de 4" no texto', () => {
    expect(SYSTEM).toContain('Nunca escreva nota decimal, média, pontuação nem "X de 4"');
    expect(SYSTEM).toContain('um inteiro de 1 a 4');
    expect(SYSTEM).not.toMatch(/bata com a nota|nota que você cita|a nota que você/i);
  });

  it('nomeia o vocabulário proibido sobre pessoas (regressão, queda, piora, retrocesso, alto desempenho)', () => {
    const regra = SYSTEM.slice(SYSTEM.indexOf('6.1.'), SYSTEM.indexOf('7. Não invente'));
    for (const termo of ['regressão', 'queda', 'piora', 'retrocesso', 'alto desempenho', 'baixo desempenho']) {
      expect(regra, termo).toContain(`"${termo}"`);
    }
  });

  it('a lista de atenção não é ranking: nome, sem comparar pessoas e sem rótulo de alarme', () => {
    expect(SYSTEM).toContain('NÃO é um ranking');
    expect(SYSTEM).toContain('ordem alfabética por nome');
    expect(SYSTEM).toContain('"urgente", "crítico"');
  });

  it('o schema não pede média: sai o `media_nivel`, fica a distribuição de pessoas por nível', () => {
    const schema = schemaDe(SYSTEM);
    const competencia = schema.analise_por_competencia[0];
    expect(competencia).not.toHaveProperty('media_nivel');
    expect(Object.keys(competencia.distribuicao)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(SYSTEM).not.toContain('media_nivel');
  });

  it('o schema pede `acoes.acao_principal`, o campo que o card "Próxima decisão" lê', () => {
    const schema = schemaDe(SYSTEM);
    expect(Object.keys(schema.acoes)[0]).toBe('acao_principal');
    expect(typeof schema.acoes.acao_principal).toBe('string');
  });

  it('o que o schema pede chega ao card: o leitor da tela encontra a ação principal', () => {
    // Prova de ponta a ponta do achado (4): o exemplo do PRÓPRIO prompt, lido pelo
    // normalizador que alimenta a home do gestor, preenche o card.
    const lido = normalizeManagerReportInsight(schemaDe(SYSTEM))!;
    expect(lido.actions.primary).toBeTruthy();
    expect(lido.actions.primary).toContain('por onde o gestor começa');
  });

  it('o schema é válido e a ordem dos campos de pessoa leva nível inteiro', () => {
    const schema = schemaDe(SYSTEM);
    expect(Number.isInteger(schema.ranking_atencao[0].nivel)).toBe(true);
    expect(Number.isInteger(schema.destaques_evolucao[0].nivel)).toBe(true);
  });

  it('o texto do prompt não tem travessão', () => {
    expect(SYSTEM).not.toMatch(new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']'));
  });
});

describe('prompt do relatório do RH', () => {
  it('não pede "alto desempenho": o destaque é por nível', () => {
    expect(RELATORIO_RH_SYSTEM).not.toMatch(/alto desempenho/i);
    expect(RELATORIO_RH_SYSTEM).toContain('N3 ou N4');
  });

  it('segue pedindo só pessoas que se destacaram positivamente, sem risco individual', () => {
    expect(RELATORIO_RH_SYSTEM).toContain('APENAS pessoas que se DESTACARAM POSITIVAMENTE');
    expect(RELATORIO_RH_SYSTEM).toContain('NÃO inclua fragilidade/risco individual');
  });
});

describe('leitor da home do gestor (dashboard-insights)', () => {
  const base = {
    resumo_executivo: { leitura_geral: 'x' },
    acoes: { esta_semana: ['Marcar a conversa com Ana', 'Rever a agenda do time'], proximas_semanas: [], medio_prazo: [] },
  };

  it('relatório SEM `acao_principal` (os que já existem): a primeira ação da semana vira a decisão, sem repetir na lista', () => {
    const lido = normalizeManagerReportInsight(base)!;
    expect(lido.actions.primary).toBe('Marcar a conversa com Ana');
    expect(lido.actions.thisWeek).toEqual(['Rever a agenda do time']);
  });

  it('relatório COM `acao_principal`: ela é a decisão e a lista da semana fica inteira', () => {
    const lido = normalizeManagerReportInsight({ ...base, acoes: { ...base.acoes, acao_principal: 'Começar pela conversa com a Ana' } })!;
    expect(lido.actions.primary).toBe('Começar pela conversa com a Ana');
    expect(lido.actions.thisWeek).toEqual(['Marcar a conversa com Ana', 'Rever a agenda do time']);
  });

  it('sem ação nenhuma, a decisão fica vazia (a tela mostra o texto de reserva)', () => {
    const lido = normalizeManagerReportInsight({ resumo_executivo: { leitura_geral: 'x' }, acoes: {} })!;
    expect(lido.actions.primary).toBeNull();
    expect(lido.actions.thisWeek).toEqual([]);
  });

  it('pontos fortes e de atenção chegam em ordem alfabética, não na ordem em que a IA os ranqueou', () => {
    const lido = normalizeManagerReportInsight({
      ...base,
      ranking_atencao: [{ nome: 'Carla', nivel: 1 }, { nome: 'Ágata', nivel: 2 }, { nome: 'Bruno', nivel: 1 }],
      destaques_evolucao: [{ nome: 'Zeca', nivel: 4 }, { nome: 'Ana', nivel: 3 }],
    })!;
    expect(lido.attention.map((p) => p.person)).toEqual(['Ágata', 'Bruno', 'Carla']);
    expect(lido.highlights.map((p) => p.person)).toEqual(['Ana', 'Zeca']);
  });
});

/**
 * O PDF do relatório do gestor (R-36): "Ranking de Atenção" com pessoas nomeadas,
 * selo "URGENTE" em vermelho e "Média: 2.3" por competência. Agora: "Pontos de
 * Atenção" em ordem alfabética, prioridade da conversa sem vermelho e nível mais
 * frequente no lugar da média. Lido da árvore do componente, sem renderizar.
 */
import { isValidElement } from 'react';
import RelatorioGestorPDF, { urgenciaLabel, emOrdemAlfabetica, nivelMaisFrequenteDe } from '@/components/pdf/RelatorioGestor';

function textos(no: any, out: string[] = []): string[] {
  if (no == null || typeof no === 'boolean') return out;
  if (typeof no === 'string' || typeof no === 'number') { out.push(String(no)); return out; }
  if (Array.isArray(no)) { for (const n of no) textos(n, out); return out; }
  if (isValidElement(no)) {
    const { type, props } = no as any;
    return typeof type === 'function' ? textos(type(props), out) : textos(props?.children, out);
  }
  return out;
}

describe('PDF do relatório do gestor', () => {
  const conteudo = {
    resumo_executivo: { leitura_geral: 'LEITURA', principal_avanco: 'FORÇA-DA-EQUIPE', principal_ponto_de_atencao: 'ATENÇÃO-DA-EQUIPE' },
    destaques_evolucao: [{ nome: 'Zeca', competencia: 'Escuta', nivel: 4, motivo_destaque: 'x' }, { nome: 'Ana', competencia: 'Escuta', nivel: 3, motivo_destaque: 'y' }],
    ranking_atencao: [
      { nome: 'Carla', competencia: 'Escuta', nivel: 1, urgencia: 'alta', motivo: 'm1', risco_se_nao_agir: 'r1' },
      { nome: 'Bruno', competencia: 'Escuta', nivel: 2, urgencia: 'urgente', motivo: 'm2' },
      { nome: 'Ágata', competencia: 'Escuta', nivel: 2, urgencia: 'baixa', motivo: 'm3' },
    ],
    analise_por_competencia: [
      { competencia: 'Escuta', media_nivel: 2.3, distribuicao: { n1: 1, n2: 3, n3: 2, n4: 0 }, padrao_observado: 'p' },
    ],
    acoes: { acao_principal: 'COMECE-POR-AQUI', esta_semana: ['a'] },
  };
  const t = () => textos(RelatorioGestorPDF({ data: { conteudo, gestor_nome: 'Gestor' }, empresaNome: 'Empresa' } as any)).join('');

  it('a seção é "Pontos de Atenção", não "Ranking de Atenção"', () => {
    expect(t()).toContain('Pontos de Atenção');
    expect(t()).not.toMatch(/Ranking/i);
  });

  it('as pessoas saem em ordem alfabética, não na ordem do ranking antigo', () => {
    const texto = t();
    const pos = ['Ágata', 'Bruno', 'Carla'].map((n) => texto.indexOf(`${n}:`));
    expect(pos.every((p) => p > -1)).toBe(true);
    expect(pos[0]).toBeLessThan(pos[1]);
    expect(pos[1]).toBeLessThan(pos[2]);
  });

  it('sem "URGENTE" nem vermelho: prioridade da conversa em palavras que não alarmam', () => {
    expect(t()).not.toContain('URGENTE');
    expect(urgenciaLabel('alta')).toBe('PRIORIDADE ALTA');
    expect(urgenciaLabel('urgente')).toBe('PRIORIDADE ALTA');
    expect(urgenciaLabel('media')).toBe('PRIORIDADE MÉDIA');
    expect(urgenciaLabel('baixa')).toBe('ACOMPANHAR');
    const fonte = readFileSync('components/pdf/RelatorioGestor.tsx', 'utf8');
    // Nenhum vermelho no bloco das pessoas nomeadas (o cabeçalho "Esta Semana" do
    // plano de ação é de outra seção e segue como está).
    // O título da seção agora é a chave do catálogo (onda D); a âncora tem que existir, senão o
    // `slice(-1, ...)` devolveria um pedaço qualquer e o teste passaria sem olhar o bloco.
    const inicioPessoas = fonte.indexOf("ReportSectionTitle>{t('gestor.attentionPoints')}");
    expect(inicioPessoas).toBeGreaterThan(0);
    const bloco = fonte.slice(fonte.indexOf('const s = StyleSheet'), fonte.indexOf('function PageFooter'))
      + fonte.slice(inicioPessoas, fonte.indexOf('Análise + DISC'));
    expect(bloco.length).toBeGreaterThan(500);
    expect(bloco).not.toMatch(/#B91C1C|#991B1B|#FEE2E2|#FEF2F2/);
  });

  it('a competência mostra o nível mais frequente e as pessoas por nível, nunca a média', () => {
    const texto = t();
    expect(texto).toContain('Escuta: nível mais frequente N2');
    expect(texto).toContain('N1: 1 | N2: 3 | N3: 2 | N4: 0');
    expect(texto).not.toMatch(/Média|2\.3/);
    expect(nivelMaisFrequenteDe({ n1: 0, n2: 0, n3: 0, n4: 0 })).toBeNull();
    expect(nivelMaisFrequenteDe(null)).toBeNull();
  });

  it('pontos fortes (não "Destaques de Evolução") e "Ponto forte:" no resumo; a ação principal aparece', () => {
    const texto = t();
    expect(texto).toContain('Pontos fortes a reconhecer');
    expect(texto).not.toContain('Destaques de Evolução');
    expect(texto).toContain('Ponto forte: FORÇA-DA-EQUIPE');
    expect(texto).not.toContain('Avanço: ');
    expect(texto).toContain('COMECE-POR-AQUI');
    expect(texto.indexOf('Ana')).toBeLessThan(texto.indexOf('Zeca'));
  });

  it('emOrdemAlfabetica ignora acento e caixa e não muta a lista', () => {
    const lista = [{ nome: 'bruno' }, { nome: 'Ágata' }];
    expect(emOrdemAlfabetica(lista, (x) => x.nome).map((x) => x.nome)).toEqual(['Ágata', 'bruno']);
    expect(lista.map((x) => x.nome)).toEqual(['bruno', 'Ágata']);
  });
});
