import { describe, expect, it } from 'vitest';
import { deepLinkSemana } from '@/lib/notifications/pilula-envio';

/**
 * De onde a pessoa veio, sem pixel.
 *
 * A alternativa seria o rastreamento de abertura do SES, que mede se o cliente
 * de e-mail carregou uma imagem: o Apple Mail pré-carrega tudo (infla) e o
 * bloqueio de imagens esvazia (subnotifica), nos dois sentidos ao mesmo tempo.
 * `?o=` mede CLIQUE — ação, dado nosso, sem rastreador e sem reescrever link.
 *
 * O preço, declarado: quem lê e não clica não aparece. Para a trilha, essa
 * pessoa está no mesmo lugar de quem não leu — é a mesma razão de o engajamento
 * preferir `play_finished` a `conteudo_consumido`.
 */
describe('origem do clique no deep link da semana', () => {
  it('🔴 cada canal marca a SUA origem', () => {
    expect(deepLinkSemana('https://x.vertho.ai', 3, null, null, 'email')).toContain('o=email');
    expect(deepLinkSemana('https://x.vertho.ai', 3, null, null, 'whatsapp')).toContain('o=whatsapp');
    expect(deepLinkSemana('https://x.vertho.ai', 3, null, null, 'push')).toContain('o=push');
  });

  it('sem canal o link não ganha parâmetro nenhum', () => {
    // links antigos e call-sites não migrados continuam idênticos: a marcação é
    // aditiva, e um `?o=` vazio contaria chegada de origem desconhecida
    expect(deepLinkSemana('https://x.vertho.ai', 3)).toBe('https://x.vertho.ai/dashboard/temporada/semana/3');
    expect(deepLinkSemana('https://x.vertho.ai', 3, null, null, null)).not.toContain('o=');
  });

  it('a origem convive com formato e pílula, sem atropelar', () => {
    const url = new URL(deepLinkSemana('https://x.vertho.ai', 5, 'video', 2, 'whatsapp'));
    expect(url.pathname).toBe('/dashboard/temporada/semana/5');
    expect(url.searchParams.get('formato')).toBe('video');
    expect(url.searchParams.get('p')).toBe('2');
    expect(url.searchParams.get('o')).toBe('whatsapp');
  });

  it('🔴 o destino é o MESMO nos três canais — só a origem muda', () => {
    // comparar canais exige que a única variável seja o canal. Se um levasse a
    // outro lugar, a diferença medida seria do destino, não do canal.
    const semOrigem = (u: string) => { const x = new URL(u); x.searchParams.delete('o'); return x.toString(); };
    const base = ['email', 'whatsapp', 'push'].map(
      (c) => semOrigem(deepLinkSemana('https://x.vertho.ai', 4, 'texto', 1, c as any)),
    );
    expect(new Set(base).size).toBe(1);
  });
});
