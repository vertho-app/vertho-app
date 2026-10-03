import { describe, it, expect } from 'vitest';
import { emailPilula } from '@/lib/notifications/pilula-envio';

/**
 * O e-mail da pílula semanal não pode prometer formato que a pessoa não vai encontrar.
 *
 * Desde 02/10/2026 o kit novo entrega só os 2 primeiros formatos da preferência da
 * pessoa (sem preferência: texto e estudo de caso; vídeo só se estiver entre os 2),
 * em `lib/season-engine/kit/entrega-semana.ts`. O rodapé do e-mail seguia dizendo
 * "Todos os formatos ficam disponíveis na plataforma" (R-58 da revisão de 02/10):
 * quem preferiu texto abria a semana procurando o vídeo que o e-mail anunciou.
 */
const ITEM = { competencia: 'Comunicação', descritor: 'Escuta ativa', conteudo: { core_titulo: 'Escuta ativa' } };
const OPTS = { semana: 3, baseUrl: 'https://acme.vertho.ai', formato: 'texto', pilula: 1 };

describe('e-mail da pílula semanal', () => {
  it('não promete todos os formatos na plataforma', () => {
    const { html } = emailPilula('Maria Souza', ITEM, OPTS);
    expect(html.toLowerCase()).not.toContain('todos os formatos');
  });

  it('diz o que a pessoa de fato encontra: os conteúdos e o desafio da semana', () => {
    const { html } = emailPilula('Maria Souza', ITEM, OPTS);
    expect(html).toContain('Os conteúdos e o desafio da semana ficam na plataforma.');
  });

  it('segue anunciando o formato do dia e o link da semana', () => {
    const { html } = emailPilula('Maria Souza', ITEM, OPTS);
    expect(html).toContain('texto');
    expect(html).toContain('https://acme.vertho.ai/dashboard/temporada/semana/3?formato=texto&p=1&o=email');
  });
});
