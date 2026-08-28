import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({
  callOpenAIWebSearch: vi.fn(),
}));

import { callOpenAIWebSearch } from '@/actions/ai-client';
import { researchCompany } from '@/lib/copiloto/research';

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

  it('executa site, imprensa e redes em trilhas separadas e aplica cotas', async () => {
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
    expect(channels.slice(0, 8)).toEqual([
      'social', 'social', 'social', 'news', 'news', 'news', 'site', 'site',
    ]);
  });
});
