// `/ir/<tenant>/<semana>` — o link curto que o botão do template usa.
//
// Esta rota existe porque o botão de URL da Meta aceita UMA variável, no FIM de
// uma URL fixa — e aqui o domínio é o tenant. O preço de resolver isso com um
// redirecionador é o risco clássico: um link do NOSSO domínio que leva a
// qualquer lugar é matéria-prima de phishing, com a nossa marca em cima.
//
// A defesa não é sanitizar uma URL recebida: é NUNCA receber URL. O parâmetro é
// um slug, e o destino é MONTADO aqui — o regex não admite `.`, `/`, `@` nem
// `:`, os quatro caracteres que fariam um valor externo virar outro host.
import { describe, it, expect } from 'vitest';

const { GET } = await import('@/app/ir/[...caminho]/route');

const chamar = (caminho: string[]) =>
  GET(new Request('https://app.vertho.ai/ir/' + caminho.join('/')), { params: Promise.resolve({ caminho }) });

describe('/ir — o destino é sempre nosso', () => {
  it('monta o destino no subdomínio do cliente', async () => {
    const r = await chamar(['ibipeba', '5']);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://ibipeba.vertho.ai/dashboard/temporada/semana/5');
  });

  it('leva formato e pílula — é o que faz cair no conteúdo anunciado', async () => {
    // Sem isto a pessoa recebe "seu vídeo de hoje" e chega numa tela genérica.
    const r = await chamar(['ibipeba', '5', 'video', '2']);
    expect(r.headers.get('location')).toBe('https://ibipeba.vertho.ai/dashboard/temporada/semana/5?formato=video&p=2');
  });

  it('formato desconhecido é ignorado, não quebra o link', async () => {
    const r = await chamar(['ibipeba', '5', 'holograma']);
    expect(r.headers.get('location')).toBe('https://ibipeba.vertho.ai/dashboard/temporada/semana/5');
  });

  it('🔴 O INVARIANTE: o destino é SEMPRE um subdomínio nosso', async () => {
    // Esta é a garantia que substitui a consulta ao banco — e é mais forte, por
    // não depender de I/O nem de service-role numa rota pública.
    for (const slug of ['ibipeba', 'macae', 'tenant-novo-qualquer', 'x1']) {
      const loc = (await chamar([slug, '5'])).headers.get('location');
      expect(new URL(loc!).host.endsWith('.vertho.ai'), loc!).toBe(true);
      expect(new URL(loc!).protocol, loc!).toBe('https:');
    }
  });

  it('🔴 não é open redirect: domínio externo no lugar do slug é recusado', async () => {
    for (const tentativa of [
      ['evil.com', '5'],
      ['..', '5'],
      ['ibipeba.evil.com', '5'],
      ['http:', '5'],
    ]) {
      const r = await chamar(tentativa);
      expect(r.status, tentativa.join('/')).toBe(404);
      // E o mais importante: nada de Location apontando para fora.
      expect(r.headers.get('location'), tentativa.join('/')).toBeNull();
    }
  });

  it('🔴 slug com barra embutida não escapa o domínio montado', async () => {
    // `caminho` já vem separado por `/`, mas um valor com caractere estranho não
    // pode virar parte do host.
    const r = await chamar(['ibipeba@evil.com', '5']);
    expect(r.status).toBe(404);
  });

  it('semana fora da faixa é recusada', async () => {
    expect((await chamar(['ibipeba', '0'])).status).toBe(404);
    expect((await chamar(['ibipeba', '999'])).status).toBe(404);
    expect((await chamar(['ibipeba', 'cinco'])).status).toBe(404);
  });

  it('302 e não 301 — o mapeamento pode mudar e 301 fica no cache para sempre', async () => {
    expect((await chamar(['ibipeba', '5'])).status).toBe(302);
  });
});
