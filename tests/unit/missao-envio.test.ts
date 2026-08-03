import { describe, it, expect } from 'vitest';
import { templateWhatsAppMissao, emailMissao, videoUrlMissao } from '@/lib/notifications/pilula-envio';
import { APLICACAO_VIDEO_ID } from '@/lib/season-engine/programa-config';

const OPTS = { semana: 4, baseUrl: 'https://ibipeba.vertho.ai', acaoPrincipal: 'Cruzar dados de uma avaliação externa com indicadores internos' };

describe('envio de segunda da semana de aplicação', () => {
  it('WhatsApp leva o vídeo explicativo e o deep-link da semana', () => {
    const msg = templateWhatsAppMissao('Maria', OPTS);
    expect(msg).toContain(`/v/${APLICACAO_VIDEO_ID}`);
    expect(msg).toContain('/dashboard/temporada/semana/4');
    expect(msg).toContain('Missão de Aplicação');
    expect(msg).toContain('_Cruzar dados de uma avaliação externa com indicadores internos_');
  });

  it('sem acao_principal, sai só o texto padrão (missão em JSON cru não vaza)', () => {
    const msg = templateWhatsAppMissao('Maria', { semana: 8, baseUrl: OPTS.baseUrl, acaoPrincipal: null });
    expect(msg).not.toContain('acao_principal');
    expect(msg).not.toContain('```');
    expect(msg).toContain('/dashboard/temporada/semana/8');
  });

  it('e-mail espelha: assunto da semana, thumbnail do vídeo e botão', () => {
    const { subject, html } = emailMissao('Maria Souza', OPTS);
    expect(subject).toContain('Semana 4');
    expect(html).toContain(`/api/bunny-thumb/${APLICACAO_VIDEO_ID}`);
    expect(html).toContain(videoUrlMissao(OPTS.baseUrl));
    expect(html).toContain('/dashboard/temporada/semana/4');
    expect(html).toContain('Maria');
  });
});
