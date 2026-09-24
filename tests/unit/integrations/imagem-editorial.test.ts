import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Contrato da imagem editorial do PDF (`lib/imagem-editorial.ts`).
 *
 * Por que existe: de 24/06 a 24/09/2026 nenhum PDF de texto/case ganhou imagem.
 * O projeto da OpenAI perdeu acesso ao `gpt-image-2` (`403 model_not_found`) e o
 * único rastro era um `console.warn` — os PDFs caíram de ~3,7 MB para ~200 KB sem
 * ninguém ver. O que este teste protege:
 *   1. principal caiu → o fallback Gemini gera, e a queda VIRA LINHA em
 *      `degradacao_log` (senão é o mesmo silêncio de antes);
 *   2. o formato vem dos BYTES: o Gemini devolve JPEG, e um JPEG servido como
 *      `image/png` quebra o render do PDF;
 *   3. a imagem paga vai ao ledger com o preço por MODALIDADE (imagem a 60,
 *      texto a 3 no Gemini) — antes a imagem não aparecia em custo nenhum;
 *   4. imagem gerada que não grava no cache também registra (paga de novo calada).
 *
 * As respostas de erro e do Gemini copiam a FORMA das chamadas reais de
 * 24/09/2026 (`scratchpad/probe-gerar-imagem.mjs`). A resposta 200 da OpenAI
 * segue a forma documentada do Image API: o projeto não tem acesso ao 2.5, então
 * ela ainda não foi observada ao vivo. `fetch` é stubado; nada sai daqui.
 */

const gravadas: any[] = [];
vi.mock('@/lib/ia-ledger', () => ({
  gravarLinhaLedger: async (linha: any) => { gravadas.push(linha); return true; },
}));

const quedas: any[] = [];
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: async (input: any) => { quedas.push(input); } };
});

import { gerarImagemEditorial, resolverImagemPdf, mimeDaImagem } from '@/lib/imagem-editorial';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(2048, 1)]);
const JPEG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(2048, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(2048)]);

/** Corpo LITERAL do 403 de 24/09/2026 (só o nome do modelo muda com o env). */
function openai403() {
  return new Response(JSON.stringify({
    error: {
      message: 'Project `proj_jlRtlxOIkvMzFVb7HMwrqsgB` does not have access to model `gpt-image-2.5-flare`',
      type: 'invalid_request_error', param: null, code: 'model_not_found',
    },
  }), { status: 403 });
}

function openaiOk(buf = PNG, usage: any = { total_tokens: 830, input_tokens: 400, output_tokens: 430, input_tokens_details: { text_tokens: 400, image_tokens: 0 } }) {
  return new Response(JSON.stringify({ created: 1, data: [{ b64_json: buf.toString('base64') }], usage }), { status: 200 });
}

/** Forma real do 200 do Gemini (24/09): a imagem e o `thoughtSignature` na MESMA parte. */
function geminiOk(parts?: any[]) {
  return new Response(JSON.stringify({
    candidates: [{
      content: { role: 'model', parts: parts ?? [{ inlineData: { mimeType: 'image/jpeg', data: JPEG.toString('base64') }, thoughtSignature: 'sig' }] },
      finishReason: 'STOP',
    }],
    usageMetadata: {
      promptTokenCount: 64,
      candidatesTokenCount: 1543,
      totalTokenCount: 1607,
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: 64 }],
      candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1120 }],
      serviceTier: 'standard',
    },
    modelVersion: 'gemini-3.1-flash-image',
  }), { status: 200 });
}

const ledger = { feature: 'conteudo_imagem_capa', empresaId: 'emp-1' };
let chamadas: Array<{ url: string; init: any }>;

function stubFetch(openai: () => Response, gemini: () => Response) {
  chamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    chamadas.push({ url: String(url), init });
    return String(url).includes('api.openai.com') ? openai() : gemini();
  }));
}

beforeEach(() => {
  gravadas.length = 0;
  quedas.length = 0;
  vi.stubEnv('OPENAI_API_KEY', 'sk-test');
  vi.stubEnv('GEMINI_API_KEY', 'gm-test');
  vi.stubEnv('OPENAI_IMAGE_MODEL', '');
  vi.stubEnv('GEMINI_IMAGE_MODEL', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('imagem editorial · principal OpenAI', () => {
  it('usa gpt-image-2.5-flare em medium, no tamanho do formato, e não aciona o fallback', async () => {
    stubFetch(() => openaiOk(), () => { throw new Error('fallback não deveria rodar'); });
    const r = await gerarImagemEditorial('p', 'retrato', { ledger });

    expect(r).toMatchObject({ provedor: 'openai', modelo: 'gpt-image-2.5-flare', mimeType: 'image/png', falhaPrincipal: null });
    expect(chamadas).toHaveLength(1);
    expect(JSON.parse(chamadas[0].init.body)).toMatchObject({ model: 'gpt-image-2.5-flare', size: '1024x1536', quality: 'medium' });
    expect(quedas).toEqual([]);
  });

  it('grava a imagem paga no ledger com o preço do catálogo (texto 5, imagem 30 por 1M)', async () => {
    stubFetch(() => openaiOk(), () => geminiOk());
    await gerarImagemEditorial('p', 'retrato', { ledger });

    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({
      feature: 'conteudo_imagem_capa', empresa_id: 'emp-1', provider: 'openai',
      model: 'gpt-image-2.5-flare', source: 'imagem:openai', status: 'ok',
      input_tokens: 400, output_tokens: 430,
    });
    expect(gravadas[0].cost_usd).toBeCloseTo((400 * 5 + 430 * 30) / 1e6, 10);
  });
});

describe('imagem editorial · fallback Gemini', () => {
  it('403 no principal → Gemini gera em 1K na proporção certa, e a queda vira degradação', async () => {
    stubFetch(openai403, () => geminiOk());
    const r = await gerarImagemEditorial('p', 'paisagem', { ledger });

    expect(r).toMatchObject({ provedor: 'gemini', modelo: 'gemini-3.1-flash-image', mimeType: 'image/jpeg' });
    expect(r.falhaPrincipal).toContain('403');

    const gem = chamadas.find((c) => c.url.includes('generativelanguage'))!;
    expect(gem.url).toContain('models/gemini-3.1-flash-image:generateContent');
    expect(gem.init.headers['x-goog-api-key']).toBe('gm-test');
    expect(JSON.parse(gem.init.body).generationConfig).toEqual({
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '3:2', imageSize: '1K' },
    });

    expect(quedas).toHaveLength(1);
    expect(quedas[0]).toMatchObject({ fluxo: 'build', tipo: 'imagem-pdf-degradada', empresaId: 'emp-1', severidade: 'aviso' });
    expect(quedas[0].detalhe).toMatchObject({ fase: 'fallback', feature: 'conteudo_imagem_capa' });
    expect(String(quedas[0].detalhe.erro)).toContain('model_not_found');
  });

  it('o 403 não vai ao ledger (não é cobrado) e o Gemini vai com a tarifa por modalidade', async () => {
    stubFetch(openai403, () => geminiOk());
    await gerarImagemEditorial('p', 'retrato', { ledger });

    expect(gravadas).toHaveLength(1);
    const g = gravadas[0];
    expect(g).toMatchObject({ provider: 'gemini', model: 'gemini-3.1-flash-image', source: 'imagem:gemini', input_tokens: 64, output_tokens: 1543, status: 'ok' });
    // 1.120 tokens de imagem a US$ 60/1M + 423 de texto a US$ 3/1M + 64 de entrada a US$ 0,50/1M.
    expect(g.cost_usd).toBeCloseTo((64 * 0.5 + 1120 * 60 + 423 * 3) / 1e6, 10);
  });

  it('ignora a imagem de rascunho (`thought: true`) e devolve a final', async () => {
    const rascunho = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(2048, 9)]);
    stubFetch(openai403, () => geminiOk([
      { inlineData: { mimeType: 'image/jpeg', data: rascunho.toString('base64') }, thought: true },
      { inlineData: { mimeType: 'image/jpeg', data: JPEG.toString('base64') }, thoughtSignature: 'sig' },
    ]));
    const r = await gerarImagemEditorial('p', 'retrato', { ledger });
    expect(r.buffer.equals(JPEG)).toBe(true);
  });

  it('a régua é a marca `thought`, não a posição: rascunho no FIM também é ignorado', async () => {
    // A doc não garante a ordem das partes. Com o rascunho antes, "pegar a última"
    // acertaria por acaso — foi o que a prova por mutação mostrou.
    const rascunho = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(2048, 9)]);
    stubFetch(openai403, () => geminiOk([
      { inlineData: { mimeType: 'image/jpeg', data: JPEG.toString('base64') }, thoughtSignature: 'sig' },
      { inlineData: { mimeType: 'image/jpeg', data: rascunho.toString('base64') }, thought: true },
    ]));
    const r = await gerarImagemEditorial('p', 'retrato', { ledger });
    expect(r.buffer.equals(JPEG)).toBe(true);
  });

  it('200 do principal SEM imagem é pago: entra no ledger fora de `ok` e cai para o fallback', async () => {
    stubFetch(() => new Response(JSON.stringify({ data: [{}], usage: { input_tokens: 400, output_tokens: 0 } }), { status: 200 }), () => geminiOk());
    const r = await gerarImagemEditorial('p', 'retrato', { ledger });

    expect(r.provedor).toBe('gemini');
    expect(gravadas.map((l) => [l.provider, l.status])).toEqual([['openai', 'sem_imagem'], ['gemini', 'ok']]);
  });

  it('formato que o PDF não desenha (WEBP) no principal também aciona o fallback', async () => {
    stubFetch(() => openaiOk(WEBP), () => geminiOk());
    const r = await gerarImagemEditorial('p', 'retrato', { ledger });
    expect(r.provedor).toBe('gemini');
  });

  it('os dois falham → lança com os dois motivos e registra `sem-imagem`', async () => {
    stubFetch(openai403, () => new Response('{"error":{"code":503}}', { status: 503 }));
    await expect(gerarImagemEditorial('p', 'retrato', { ledger })).rejects.toThrow(/principal: OpenAI image 403.*fallback: Gemini image 503/);
    expect(quedas.map((q) => q.detalhe.fase)).toEqual(['sem-imagem']);
  });
});

describe('imagem editorial · cache do PDF', () => {
  function storage(arquivos: Record<string, Buffer>, uploadErro: string | null = null) {
    const uploads: Array<{ caminho: string; contentType: string }> = [];
    const sb = {
      storage: {
        from: () => ({
          download: async (caminho: string) => arquivos[caminho]
            ? { data: new Blob([new Uint8Array(arquivos[caminho])]), error: null }
            : { data: null, error: { message: 'Object not found' } },
          upload: async (caminho: string, _buf: Buffer, o: any) => {
            uploads.push({ caminho, contentType: o.contentType });
            return { error: uploadErro ? { message: uploadErro } : null };
          },
        }),
      },
    };
    return { sb, uploads };
  }
  const conteudo = { id: 'c1', competencia: 'Gerenciamento de Conflitos', descritor: 'Escuta ativa', empresaId: 'emp-1' };
  const base = 'final/covers/cd/gerenciamento_de_conflitos_escuta_ativa';

  it('acha no cache um JPEG do fallback e serve com o mime REAL, sem gerar', async () => {
    const { sb } = storage({ [`${base}.jpg`]: JPEG });
    stubFetch(() => { throw new Error('não deveria gerar'); }, () => { throw new Error('não deveria gerar'); });
    const r = await resolverImagemPdf(sb, 'capa', conteudo);

    expect(r.origem).toBe('cache');
    expect(r.dataUri!.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('o PNG antigo do cache continua servindo como PNG', async () => {
    const { sb } = storage({ [`${base}.png`]: PNG });
    stubFetch(() => { throw new Error('não deveria gerar'); }, () => { throw new Error('não deveria gerar'); });
    const r = await resolverImagemPdf(sb, 'capa', conteudo);
    expect(r.dataUri!.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('sem cache: gera pelo fallback e grava com a extensão e o contentType do formato real', async () => {
    const { sb, uploads } = storage({});
    stubFetch(openai403, () => geminiOk());
    const r = await resolverImagemPdf(sb, 'capa', conteudo);

    expect(r.origem).toBe('gerada');
    expect(r.dataUri!.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(uploads).toEqual([{ caminho: `${base}.jpg`, contentType: 'image/jpeg' }]);
    expect(gravadas[0]).toMatchObject({ feature: 'conteudo_imagem_capa', empresa_id: 'emp-1' });
  });

  it('a seção usa a pasta, a feature e o formato dela', async () => {
    const { sb, uploads } = storage({});
    stubFetch(() => openaiOk(), () => geminiOk());
    await resolverImagemPdf(sb, 'secao', conteudo);

    expect(JSON.parse(chamadas[0].init.body).size).toBe('1536x1024');
    expect(uploads[0].caminho).toBe('final/sections/cd/gerenciamento_de_conflitos_escuta_ativa.png');
    expect(gravadas[0].feature).toBe('conteudo_imagem_secao');
  });

  it('upload do cache falhou: a imagem serve o PDF E a falha vira degradação `cache`', async () => {
    const { sb } = storage({}, 'The resource already exists');
    stubFetch(() => openaiOk(), () => geminiOk());
    const r = await resolverImagemPdf(sb, 'capa', conteudo);

    expect(r.dataUri).not.toBeNull();
    expect(quedas.map((q) => q.detalhe.fase)).toEqual(['cache']);
  });

  it('os dois provedores falham: nunca lança, devolve null e o motivo', async () => {
    const { sb } = storage({});
    stubFetch(openai403, () => new Response('{}', { status: 500 }));
    const r = await resolverImagemPdf(sb, 'capa', conteudo);
    expect(r).toMatchObject({ dataUri: null, origem: null });
    expect(r.erro).toContain('fallback');
  });
});

describe('mimeDaImagem', () => {
  it('reconhece PNG e JPEG pelos bytes e recusa o que o PDF não desenha', () => {
    expect(mimeDaImagem(PNG)).toBe('image/png');
    expect(mimeDaImagem(JPEG)).toBe('image/jpeg');
    expect(mimeDaImagem(WEBP)).toBeNull();
    expect(mimeDaImagem(Buffer.alloc(0))).toBeNull();
  });
});
