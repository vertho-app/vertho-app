/**
 * O PDI enxerga o que a pessoa ESCREVEU (25/09/2026).
 *
 * Até aqui o gerador recebia só material de segunda mão (nível, destaques e o
 * parecer da IA4). Sem o cenário, completava a situação por conta própria
 * ("dividir aula, correção, conselho de classe"); sem as respostas, descrevia
 * "padrão" onde havia UMA resposta. A auditoria recebe este MESMO `user` como
 * evidência, então o bloco também é o que a deixa julgar o que tem lastro.
 */
import { describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const COMP = 'Autocuidado e bem-estar profissional';
const sb = criarSupabaseMock({
  resolver: (tabela: string) => ({
    colaboradores: { id: 'c1', nome_completo: 'Ana Souza', cargo: 'Professor(a)', email: 'ana@escola.gov.br', perfil_dominante: 'C', d_natural: 20, i_natural: 30, s_natural: 60, c_natural: 90 },
    empresas: { nome: 'Rede Municipal', segmento: 'educacao' },
    cargos_empresa: { top5_workshop: [COMP], competencia_foco: COMP, competencias_foco: [COMP] },
    banco_cenarios: {
      titulo: 'O limite que ninguém vê',
      descricao: 'Na sexta, a coordenação pede que você assuma um projeto além das turmas.',
      alternativas: { perguntas: [{ numero: 1, texto: 'O que você faria primeiro?' }, { numero: 2, texto: 'Como comunicaria?' }] },
    },
  } as Record<string, any>)[tabela] ?? null,
  lista: (tabela: string) => (tabela === 'respostas'
    ? [{
      competencia_nome: COMP, colaborador_id: 'c1', cenario_id: 'cen-1',
      r1: 'Eu conversaria com a coordenação antes de aceitar.', r2: 'Por e-mail, no mesmo dia.', r3: null, r4: null,
      r3_raciocinio: 'Resposta do formato antigo.',
      avaliacao_ia: { consolidacao: { nivel_geral: 1, media_descritores: 1.5 }, feedback: 'parecer' }, nivel_ia4: 1, nota_ia4: 1.5,
    }]
    : []),
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

const { buildRelatorioIndividualPrompt, RELATORIO_IND_SYSTEM } = await import('@/lib/relatorio-individual-prompt');

describe('evidência primária no prompt do PDI', () => {
  it('🔴 o user leva o cenário respondido e as respostas da pessoa', async () => {
    const built: any = await buildRelatorioIndividualPrompt(sb.client as any, { empresaId: 'e1', colaboradorId: 'c1' });
    expect(built.error, built.error).toBeUndefined();
    expect(built.user).toContain('=== CENÁRIO E RESPOSTAS');
    expect(built.user).toContain('O limite que ninguém vê');
    // Coluna do formato antigo entra quando a nova está vazia; ausência vira marcador.
    expect(built.user).toContain('R3 (resposta da pessoa): Resposta do formato antigo.');
    expect(built.user).toContain('R4 (resposta da pessoa): (sem resposta)');
  });

  it('🔴 cada pergunta vem COLADA à sua resposta (listas separadas faziam o gerador trocar os pares)', async () => {
    const built: any = await buildRelatorioIndividualPrompt(sb.client as any, { empresaId: 'e1', colaboradorId: 'c1' });
    expect(built.user).toContain('P1: O que você faria primeiro?\nR1 (resposta da pessoa): Eu conversaria com a coordenação antes de aceitar.');
    expect(built.user).toContain('P2: Como comunicaria?\nR2 (resposta da pessoa): Por e-mail, no mesmo dia.');
    expect(built.user).toContain('CENÁRIO (hipotético');
  });

  it('as perguntas vão sem a régua de diferenciação de níveis (isso é da IA4)', async () => {
    const built: any = await buildRelatorioIndividualPrompt(sb.client as any, { empresaId: 'e1', colaboradorId: 'c1' });
    expect(built.user).not.toMatch(/Diferenciacao|descritores_primarios/i);
  });
});

describe('o system do PDI proíbe transformar UMA resposta em padrão', () => {
  it('diz que a evidência é UMA situação e nomeia o padrão proibido', () => {
    expect(RELATORIO_IND_SYSTEM).toMatch(/É UMA situação respondida por escrito/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/NUNCA transforme uma resposta em hábito/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/NUNCA acrescente ao cenário/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/"o padrão observado é\.\.\."/);
  });

  it('o cenário é hipotético e tem personagem: a resposta é o que a pessoa PROPÔS, não o que ela faz', () => {
    expect(RELATORIO_IND_SYSTEM).toMatch(/O cenário é HIPOTÉTICO: fale da RESPOSTA/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/cenário tem uma PERSONAGEM/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/Proibido: "você levou dados à coordenação"/);
  });

  it('🔴 sem cota que obrigue a inventar: fez_bem e forças aceitam vazio', () => {
    expect(RELATORIO_IND_SYSTEM).not.toMatch(/"2-3 comportamentos positivos observados"/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/"fez_bem": \["0 a 3 /);
    expect(RELATORIO_IND_SYSTEM).toMatch(/"principais_forcas": \["0 a 2 /);
  });
});

/**
 * Os escorregões que sobraram (25/09/2026) nasciam nos campos de RESUMO: a
 * `leitura` de `resumo_desempenho` pedia só "síntese curta" e saía como traço
 * sem sujeito ("Organiza e prioriza com critério..."), e `resumo_geral`/`fez_bem`
 * escreviam "você levou a Renata..." como ação feita. O exemplo do formato vence
 * a regra em prosa, então o exemplo de cada campo agora é uma frase sobre a RESPOSTA.
 */
describe('os campos de resumo falam da RESPOSTA, não de traço nem de ação feita', () => {
  it('resumo_desempenho.leitura começa por "Nas respostas" e proíbe o traço sem sujeito', () => {
    expect(RELATORIO_IND_SYSTEM).not.toMatch(/"leitura": "síntese curta"/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/"leitura": "1 frase sobre a RESPOSTA, começando por 'Nas respostas'/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/NUNCA um traço sem sujeito/);
  });

  it('resumo_geral.leitura e fez_bem trazem exemplo ancorado na resposta e proíbem a ação feita', () => {
    expect(RELATORIO_IND_SYSTEM).toMatch(/"leitura": "3-5 linhas[^"]*Nas suas respostas, você propôs/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/"fez_bem": \["0 a 3 itens[^"]*Na sua resposta, você propôs/);
    expect(RELATORIO_IND_SYSTEM).toMatch(/NUNCA 'você levou\/fez\/negociou'/);
  });

  it('o exemplo não carrega o nome de uma personagem específica (o prompt vale para todo cenário)', () => {
    const formato = RELATORIO_IND_SYSTEM.slice(RELATORIO_IND_SYSTEM.indexOf('FORMATO OBRIGATÓRIO'));
    expect(formato).not.toMatch(/Alessandra/);
  });
});
