import { describe, expect, it } from 'vitest';
import {
  filterResearchByOfficialSocials,
  isAllowedSocialEvidence,
  isOfficialSocialProfile,
  parseOfficialSocialUrls,
} from '@/lib/copiloto/social-identity';

describe('identidade social do Copiloto', () => {
  it('normaliza e mantém somente perfis sociais completos', () => {
    expect(parseOfficialSocialUrls(`
      instagram.com/vertho.ai/
      https://www.linkedin.com/company/vertho-ai/?trk=foo
      https://empresa.com.br
      https://x.com/
    `)).toEqual([
      'https://instagram.com/vertho.ai',
      'https://linkedin.com/company/vertho-ai',
    ]);
  });

  it('reconhece o perfil oficial apesar de query e barra final', () => {
    const official = ['https://linkedin.com/company/vertho-ai'];
    expect(isOfficialSocialProfile('https://www.linkedin.com/company/vertho-ai/?view=all', official)).toBe(true);
  });

  it('aceita post social apenas quando associado ao perfil oficial informado', () => {
    const official = ['https://instagram.com/vertho.ai'];
    expect(isAllowedSocialEvidence(
      'https://instagram.com/p/ABC123',
      'https://instagram.com/vertho.ai',
      official,
    )).toBe(true);
    expect(isAllowedSocialEvidence(
      'https://instagram.com/p/OUTRO',
      'https://instagram.com/outra.empresa',
      official,
    )).toBe(false);
  });

  it('mantém fontes web comuns sem depender de perfil social', () => {
    expect(isAllowedSocialEvidence('https://empresa.com.br/noticias/1', null, [])).toBe(true);
  });

  it('remove sinais de outro perfil antes da síntese do plano', () => {
    const research = filterResearchByOfficialSocials({
      fatos_relevantes: [
        { fato: 'Post correto', fonte_url: 'https://x.com/vertho/status/1', perfil_oficial_url: 'https://x.com/vertho' },
        { fato: 'Post de homônimo', fonte_url: 'https://x.com/vertho_outro/status/2', perfil_oficial_url: 'https://x.com/vertho_outro' },
        { fato: 'Notícia pública', fonte_url: 'https://jornal.com/materia', perfil_oficial_url: null },
      ],
      tendencias_setor: [
        { titulo: 'Fonte web', fonte_url: 'https://jornal.com/setor' },
        { titulo: 'Perfil alheio', fonte_url: 'https://linkedin.com/company/outra' },
      ],
    }, ['https://x.com/vertho']);

    expect(research.fatos_relevantes.map((item: any) => item.fato)).toEqual(['Post correto', 'Notícia pública']);
    expect(research.tendencias_setor.map((item: any) => item.titulo)).toEqual(['Fonte web']);
  });
});
