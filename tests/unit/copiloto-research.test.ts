import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({
  callOpenAIWebSearch: vi.fn(),
}));

import { callOpenAIWebSearch } from '@/actions/ai-client';
import { prioritizeResearchFacts, researchCompany } from '@/lib/copiloto/research';

const publicResearch = {
  empresa_identificada: 'Amigos do Bem',
  resumo_empresa: 'Organização social',
  fatos_relevantes: [{
    titulo: 'Site', fato: 'Fato institucional', relevancia: 'Contexto',
    fonte_url: 'https://www.amigosdobem.org/sobre-nos/', publicado_em: null, perfil_oficial_url: null,
  }],
  tendencias_setor: [], hipoteses: [], objetivos: { principal: '', reserva: '' },
  metricas_roi: [], perguntas_estrategicas: [], riscos: [],
};

describe('pesquisa pública do Copiloto', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executa site, imprensa e redes em trilhas separadas e filtra fonte fora da trilha', async () => {
    vi.mocked(callOpenAIWebSearch).mockImplementation(async (prompt) => {
      if (prompt.includes('DEDICADA a publicações')) {
        return {
          text: JSON.stringify({ fatos_relevantes: [{
            titulo: 'LinkedIn', fato: 'Post oficial', relevancia: 'Prioridade recente',
            fonte_url: 'https://pt.linkedin.com/posts/amigos-do-bem_impacto-activity-123',
            publicado_em: '2026-08-01', perfil_oficial_url: 'https://linkedin.com/company/amigos-do-bem',
          }] }),
          sources: [],
        };
      }
      if (prompt.includes('DEDICADA a notícias')) {
        return {
          text: JSON.stringify({ fatos_relevantes: [
            {
              titulo: 'Exame', fato: 'Notícia externa', relevancia: 'Contexto recente',
              fonte_url: 'https://exame.com/brasil/amigos-do-bem', publicado_em: '2026-08-01', perfil_oficial_url: null,
            },
            {
              titulo: 'Release', fato: 'Conteúdo próprio', relevancia: 'Institucional',
              fonte_url: 'https://amigosdobem.org/release', publicado_em: '2026-08-01', perfil_oficial_url: null,
            },
          ] }),
          sources: [],
        };
      }
      return {
        text: JSON.stringify(publicResearch),
        sources: [
          { title: 'Site oficial', url: 'https://www.amigosdobem.org/sobre-nos/' },
          { title: 'Fonte externa indevida nesta trilha', url: 'https://portal.com/materia' },
        ],
      };
    });

    const result = await researchCompany(
      'Amigos do Bem',
      'https://www.amigosdobem.org/',
      ['https://linkedin.com/company/amigos-do-bem'],
    );

    expect(callOpenAIWebSearch).toHaveBeenCalledTimes(3);
    expect(result.research.fatos_relevantes.map((item: any) => item._research_channel))
      .toEqual(['social', 'news', 'site']);
    expect(result.research.fatos_relevantes.map((item: any) => item.fato))
      .not.toContain('Conteúdo próprio');
    expect(result.sources.map((source) => source.url)).toEqual([
      'https://linkedin.com/company/amigos-do-bem',
      'https://www.amigosdobem.org/sobre-nos/',
    ]);
    expect(result.newsSearchCompleted).toBe(true);
    expect(result.socialSearchCompleted).toBe(true);
    expect(result.siteSearchCompleted).toBe(true);
    expect(vi.mocked(callOpenAIWebSearch).mock.calls.every((call) => call[2]?.reasoningEffort === 'low')).toBe(true);
  });

  it('preserva notícias e redes quando a trilha do site falha', async () => {
    vi.mocked(callOpenAIWebSearch).mockImplementation(async (prompt) => {
      if (!prompt.includes('DEDICADA')) throw new Error('timeout do site');
      const social = prompt.includes('publicações');
      return {
        text: JSON.stringify({ fatos_relevantes: [{
          titulo: social ? 'Post' : 'Notícia',
          fato: social ? 'Sinal social' : 'Sinal externo',
          relevancia: 'Contexto',
          fonte_url: social
            ? 'https://linkedin.com/company/amigos-do-bem'
            : 'https://band.com.br/noticia/amigos-do-bem',
          publicado_em: null,
          perfil_oficial_url: social ? 'https://linkedin.com/company/amigos-do-bem' : null,
        }] }),
        sources: [],
      };
    });

    const result = await researchCompany(
      'Amigos do Bem',
      'amigosdobem.org',
      ['https://linkedin.com/company/amigos-do-bem'],
    );

    expect(result.siteSearchCompleted).toBe(false);
    expect(result.newsSearchCompleted).toBe(true);
    expect(result.socialSearchCompleted).toBe(true);
    expect(result.research.fatos_relevantes.map((item: any) => item._research_channel))
      .toEqual(['social', 'news']);
  });

  it('mantém até oito candidatos por trilha e prioriza um contexto equilibrado', async () => {
    const makeFacts = (prefix: string, host: string, amount = 10) => Array.from({ length: amount }, (_value, index) => ({
      titulo: `${prefix} ${index + 1}`,
      fato: `${prefix} fato ${index + 1}`,
      relevancia: 'Contexto',
      fonte_url: `https://${host}/fonte-${index + 1}`,
      publicado_em: null,
      perfil_oficial_url: prefix === 'Social' ? 'https://linkedin.com/company/amigos-do-bem' : null,
    }));

    vi.mocked(callOpenAIWebSearch).mockImplementation(async (prompt) => {
      if (prompt.includes('DEDICADA a publicações')) {
        return { text: JSON.stringify({ fatos_relevantes: makeFacts('Social', 'linkedin.com') }), sources: [] };
      }
      if (prompt.includes('DEDICADA a notícias')) {
        return { text: JSON.stringify({ fatos_relevantes: makeFacts('Notícia', 'exame.com') }), sources: [] };
      }
      return {
        text: JSON.stringify({ ...publicResearch, fatos_relevantes: makeFacts('Site', 'amigosdobem.org') }),
        sources: [],
      };
    });

    const result = await researchCompany(
      'Amigos do Bem',
      'https://amigosdobem.org',
      ['https://linkedin.com/company/amigos-do-bem'],
    );
    const channels = result.research.fatos_relevantes.map((item: any) => item._research_channel);

    expect(channels).toHaveLength(24);
    expect(channels.filter((channel: string) => channel === 'site')).toHaveLength(8);
    expect(channels.filter((channel: string) => channel === 'news')).toHaveLength(8);
    expect(channels.filter((channel: string) => channel === 'social')).toHaveLength(8);
    // Com todos os fatos igualmente uteis, a penalidade de repeticao intercala os canais.
    // Os tres primeiros sao os unicos que chegam ao apoio ao vivo: nenhuma fonte pode
    // ocupar essa lista sozinha so por ter respondido primeiro.
    expect(new Set(channels.slice(0, 3))).toEqual(new Set(['social', 'news', 'site']));
    expect(channels.slice(0, 6)).toEqual(['social', 'news', 'site', 'social', 'news', 'site']);
  });

  it('registra no ledger a imprensa consultada, inclusive a que não virou fato', async () => {
    vi.mocked(callOpenAIWebSearch).mockImplementation(async (prompt) => {
      if (prompt.includes('DEDICADA a notícias')) {
        return {
          text: JSON.stringify({ fatos_relevantes: [] }),
          sources: [
            { title: 'Exame', url: 'https://exame.com/brasil/amigos-do-bem' },
            // Release no domínio oficial: a trilha de imprensa não pode reivindicá-lo.
            { title: 'Release próprio', url: 'https://www.amigosdobem.org/release' },
            // Rede social também não pertence a esta trilha.
            { title: 'Post', url: 'https://linkedin.com/company/amigos-do-bem' },
          ],
        };
      }
      if (prompt.includes('DEDICADA a publicações')) {
        return { text: JSON.stringify({ fatos_relevantes: [] }), sources: [] };
      }
      return {
        text: JSON.stringify(publicResearch),
        sources: [{ title: 'Site oficial', url: 'https://www.amigosdobem.org/sobre-nos/' }],
      };
    });

    const result = await researchCompany('Amigos do Bem', 'https://www.amigosdobem.org/', []);

    // A matéria lida entra mesmo sem ter virado fato: é o que sustenta a procedência.
    expect(result.sources).toContainEqual({
      title: 'Exame', url: 'https://exame.com/brasil/amigos-do-bem', kind: 'news',
    });
    expect(result.sources.map((source) => source.url))
      .not.toContain('https://www.amigosdobem.org/release');
    expect(result.sources.map((source) => source.url))
      .not.toContain('https://linkedin.com/company/amigos-do-bem');
  });

  it('leva o avanço escolhido para as três trilhas, sem nada do briefing', async () => {
    vi.mocked(callOpenAIWebSearch).mockResolvedValue({
      text: JSON.stringify({ ...publicResearch, fatos_relevantes: [] }), sources: [],
    });

    await researchCompany(
      'Amigos do Bem',
      'amigosdobem.org',
      ['https://linkedin.com/company/amigos-do-bem'],
      'destravar_decisao',
    );

    const prompts = vi.mocked(callOpenAIWebSearch).mock.calls.map((call) => call[0]);
    expect(prompts).toHaveLength(3);
    for (const prompt of prompts) {
      expect(prompt).toContain('PRIORIDADE DESTA BUSCA');
      expect(prompt).toContain('ciclo orçamentário');
    }
  });

  it('sem avanço escolhido, nenhuma prioridade é injetada', async () => {
    vi.mocked(callOpenAIWebSearch).mockResolvedValue({
      text: JSON.stringify({ ...publicResearch, fatos_relevantes: [] }), sources: [],
    });

    await researchCompany('Amigos do Bem', 'amigosdobem.org', []);

    for (const call of vi.mocked(callOpenAIWebSearch).mock.calls) {
      expect(call[0]).not.toContain('PRIORIDADE DESTA BUSCA');
    }
  });

  it('repete só a trilha que falhou, e a segunda tentativa vale', async () => {
    let tentativasDeNoticia = 0;
    vi.mocked(callOpenAIWebSearch).mockImplementation(async (prompt) => {
      if (prompt.includes('DEDICADA a notícias')) {
        tentativasDeNoticia += 1;
        if (tentativasDeNoticia === 1) throw new Error('OpenAI Responses 503');
        return {
          text: JSON.stringify({ fatos_relevantes: [{
            titulo: 'Exame', fato: 'Notícia externa', relevancia: 'Contexto recente',
            fonte_url: 'https://exame.com/brasil/amigos-do-bem', publicado_em: '2026-08-20',
            perfil_oficial_url: null,
          }] }),
          sources: [{ title: 'Exame', url: 'https://exame.com/brasil/amigos-do-bem' }],
        };
      }
      return { text: JSON.stringify(publicResearch), sources: [] };
    });

    const result = await researchCompany('Amigos do Bem', 'amigosdobem.org', []);

    expect(tentativasDeNoticia).toBe(2);
    // O site respondeu de primeira e não foi repetido: 1 chamada de site + 2 de imprensa.
    expect(callOpenAIWebSearch).toHaveBeenCalledTimes(3);
    expect(result.newsSearchCompleted).toBe(true);
    expect(result.research.fatos_relevantes.map((item: any) => item._research_channel))
      .toContain('news');
    // Nunca uma terceira: quem falhou duas vezes gastou o orçamento da trilha.
    const daNoticia = vi.mocked(callOpenAIWebSearch).mock.calls
      .filter((call) => call[0].includes('DEDICADA a notícias'));
    expect(daNoticia).toHaveLength(2);
  });

  it('a trilha do site recebe mais prazo que as outras, por ser a mais pesada', async () => {
    vi.mocked(callOpenAIWebSearch).mockResolvedValue({
      text: JSON.stringify({ ...publicResearch, fatos_relevantes: [] }), sources: [],
    });

    await researchCompany('Amigos do Bem', 'amigosdobem.org', []);

    const prazoDe = (marcador: string) => vi.mocked(callOpenAIWebSearch).mock.calls
      .find((call) => marcador === 'site' ? !call[0].includes('DEDICADA') : call[0].includes(marcador))?.[2]?.timeoutMs as number;

    const site = prazoDe('site');
    const noticias = prazoDe('DEDICADA a notícias');
    // Medido em 03/09: sozinha ela leva 40s, mas com as quatro trilhas em
    // paralelo estourou 95s duas vezes e o dossiê perdeu o site inteiro.
    expect(site).toBeGreaterThan(noticias);
    expect(site).toBeGreaterThanOrEqual(120000);
  });

  it('desiste da trilha depois da segunda tentativa e preserva as outras', async () => {
    vi.mocked(callOpenAIWebSearch).mockImplementation(async (prompt) => {
      if (prompt.includes('DEDICADA a notícias')) throw new Error('timeout');
      return { text: JSON.stringify(publicResearch), sources: [] };
    });

    const result = await researchCompany('Amigos do Bem', 'amigosdobem.org', []);

    expect(result.newsSearchCompleted).toBe(false);
    expect(result.siteSearchCompleted).toBe(true);
    expect(result.research.fatos_relevantes.map((item: any) => item._research_channel))
      .toEqual(['site']);
  });
});

describe('prioridade dos fatos de pesquisa', () => {
  const base = {
    titulo: 'Sinal', publicado_em: null, perfil_oficial_url: null,
    fonte_url: 'https://exemplo.com/materia',
  };

  // Cada teste abaixo isola UMA variavel: os demais campos ficam identicos entre os
  // candidatos, senao o comprimento do texto sozinho ja decide e a assercao nao prova nada.
  const corpo = 'Um fato com corpo de tamanho equivalente ao do outro candidato desta comparação, para não pesar.';

  it('a implicação escrita decide entre fatos idênticos no resto', () => {
    const hoje = Date.parse('2026-09-01T12:00:00.000Z');
    const ordered = prioritizeResearchFacts([
      { ...base, fato: corpo, relevancia: 'Contexto', _research_channel: 'social' },
      { ...base, fato: corpo, relevancia: 'Gestor novo assume sem régua escrita, e é essa a porta da conversa.', _research_channel: 'social' },
    ], hoje);

    expect(ordered[0].relevancia).toContain('porta da conversa');
  });

  it('a recência decide entre fatos idênticos no resto', () => {
    const hoje = Date.parse('2026-09-01T12:00:00.000Z');
    const ordered = prioritizeResearchFacts([
      { ...base, fato: corpo, relevancia: 'Contexto', publicado_em: '2024-01-10', _research_channel: 'news' },
      { ...base, fato: corpo, relevancia: 'Contexto', publicado_em: '2026-08-20', _research_channel: 'news' },
    ], hoje);

    expect(ordered[0].publicado_em).toBe('2026-08-20');
  });

  it('a fonte verificável decide entre fatos idênticos no resto', () => {
    const hoje = Date.parse('2026-09-01T12:00:00.000Z');
    const ordered = prioritizeResearchFacts([
      { ...base, fonte_url: null, fato: corpo, relevancia: 'Contexto', _research_channel: 'site' },
      { ...base, fato: corpo, relevancia: 'Contexto', _research_channel: 'site' },
    ], hoje);

    expect(ordered[0].fonte_url).toBe('https://exemplo.com/materia');
  });

  it('não deixa um canal ocupar sozinho os três fatos que vão ao apoio ao vivo', () => {
    const hoje = Date.parse('2026-09-01T12:00:00.000Z');
    // A cota antiga (social 3, news 3, site 2) entregava social, social, social.
    const ordered = prioritizeResearchFacts([
      { ...base, fato: corpo, relevancia: 'Contexto', _research_channel: 'social' },
      { ...base, fato: corpo, relevancia: 'Contexto', _research_channel: 'social' },
      { ...base, fato: corpo, relevancia: 'Contexto', _research_channel: 'social' },
      { ...base, fato: corpo, relevancia: 'Contexto', _research_channel: 'news' },
    ], hoje);

    expect(ordered.slice(0, 3).map((item: any) => item._research_channel)).toContain('news');
  });

  it('preserva a ordem original entre fatos de utilidade idêntica', () => {
    const hoje = Date.parse('2026-09-01T12:00:00.000Z');
    const facts = [
      { ...base, fato: 'Primeiro', relevancia: 'Contexto', _research_channel: 'site' },
      { ...base, fato: 'Segundo', relevancia: 'Contexto', _research_channel: 'site' },
    ];

    expect(prioritizeResearchFacts(facts, hoje).map((item: any) => item.fato)).toEqual(['Primeiro', 'Segundo']);
  });

  it('não premia data futura', () => {
    const hoje = Date.parse('2026-09-01T12:00:00.000Z');
    const facts = [
      { ...base, fato: 'Sem data', relevancia: 'Contexto', _research_channel: 'site' },
      { ...base, fato: 'Data futura', relevancia: 'Contexto', publicado_em: '2027-01-01', _research_channel: 'news' },
    ];

    expect(prioritizeResearchFacts(facts, hoje)[0].fato).toBe('Sem data');
  });
});
