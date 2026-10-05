/**
 * `votacao_pendente_v3` (R-117, revisão de 02/10/2026): o lembrete de votação SEM
 * prazo. A v2 (`votacao_pendente`) prometia "O prazo para registro do voto é
 * {{4}}, às 23h59", mas a votação só fecha quando o admin a desliga: o sistema
 * não fecha sozinho às 23h59. Submetido à Meta em 05/10/2026; só dispara depois
 * de APPROVED (a tela de Envios mostra o template indisponível enquanto PENDING).
 *
 * O que este arquivo congela, e por quê:
 *
 *  1. O corpo do código é byte a byte o submetido (a Meta compara o corpo), com
 *     3 variáveis, na ordem nome, instituição e link, e SEM `{{4}}` nem prazo.
 *  2. O contrato manda 3 parâmetros: mandar 4 para um corpo de 3 variáveis faria a
 *     Meta recusar a mensagem.
 *  3. A v2 saiu de TEMPLATES e dos CONTRATOS: nada mais envia o texto com o prazo
 *     falso. A v1 (`votacao_competencias`, MARKETING) segue sem contrato.
 *  4. O que sai pela Cloud API é o texto aprovado, e a caixa de entrada grava o
 *     mesmo texto que o legado de texto livre renderizaria.
 *
 * O estado real na Meta (PENDING ou APPROVED) se confere lá, não aqui.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../../helpers/supabase-mock';
import { VOTACAO_PENDENTE_V2_ANTIGA, VOTACAO_PENDENTE_V3 } from '../../helpers/template-submetido-votacao-pendente-v3';

const h = vi.hoisted(() => ({ sb: null as any, degradacoes: [] as any[] }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<any>()),
  registrarDegradacao: async (d: any) => { h.degradacoes.push(d); },
}));

const {
  TEMPLATES, contarVariaveis, corpoDoTemplatePorNome, payloadDaMeta, renderTemplate,
} = await import('@/lib/whatsapp/templates');
const { contratoDoTemplate } = await import('@/lib/notifications/pilula-template');
const { enviarTemplateCloud } = await import('@/lib/whatsapp/cloud-api');
const { listarTemplatesDisparaveis } = await import('@/lib/notifications/envio-template-lote');

const def = TEMPLATES.votacao_pendente_v3 as any;

const corpos: any[] = [];
function stubarFetch() {
  global.fetch = vi.fn(async (_url: any, init: any) => {
    corpos.push(JSON.parse(String(init?.body ?? '{}')));
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.VOTO' }] }) };
  }) as any;
}
const enviadas = (sb: SupabaseMock) => sb.escritas.filter((e) => e.tabela === 'whatsapp_mensagens_enviadas');

let sb: SupabaseMock;
beforeEach(() => {
  corpos.length = 0;
  h.degradacoes.length = 0;
  process.env.META_WHATSAPPBUSINESS_API = 'token-de-teste';
  process.env.PHONE_NUMBER_ID = '123456';
  sb = criarSupabaseMock();
  h.sb = sb;
  stubarFetch();
});
afterEach(() => {
  delete process.env.META_WHATSAPPBUSINESS_API;
  delete process.env.PHONE_NUMBER_ID;
});

describe('o registro do `votacao_pendente_v3` é o que foi submetido', () => {
  it('o corpo é BYTE A BYTE o submetido', () => {
    expect(def.body).toBe(VOTACAO_PENDENTE_V3.body);
    expect([...def.example]).toEqual(VOTACAO_PENDENTE_V3.example);
  });

  it('nome na Meta = chave, UTILITY, pt_BR, sem botão (o link vai no corpo, em {{3}})', () => {
    expect(def.name).toBe('votacao_pendente_v3');
    expect(def.category).toBe('UTILITY');
    expect(def.language).toBe('pt_BR');
    expect(def.botao).toBeUndefined();
    expect(def.body).toContain('Você pode votar em:\n{{3}}\n\n');
  });

  it('tem 3 variáveis, {{1}} nome, {{2}} instituição, {{3}} link, uma vez cada e nessa ordem', () => {
    expect(contarVariaveis(def.body)).toBe(VOTACAO_PENDENTE_V3.variaveis);
    expect([...def.body.matchAll(/\{\{(\d+)\}\}/g)].map((m: RegExpMatchArray) => Number(m[1]))).toEqual([1, 2, 3]);
    expect(def.example).toHaveLength(3);
    expect(def.body).toMatch(/^Olá, \{\{1\}\}\./);
    expect(def.body).toContain('no programa da {{2}},');
  });

  it('🔴 sem {{4}} e sem prazo: a votação só fecha quando o admin a desliga (R-117)', () => {
    expect(def.body).not.toContain('{{4}}');
    expect(def.body).not.toMatch(/23h59|prazo|fica aberta/i);
  });

  it('o texto da v2 antiga (com o prazo falso) não voltou', () => {
    expect(def.body).not.toBe(VOTACAO_PENDENTE_V2_ANTIGA);
    expect(VOTACAO_PENDENTE_V2_ANTIGA).toContain('{{4}}');
  });

  it('o corpo não abre nem fecha com variável e termina em frase neutra (molde UTILITY)', () => {
    expect(def.body.trimStart().startsWith('{{')).toBe(false);
    expect(def.body.trimEnd().endsWith('}}')).toBe(false);
    expect(def.body.trimEnd().endsWith('trabalhadas na Jornada.')).toBe(true);
  });

  it('o payload da Graph API leva o corpo submetido e o exemplo de 3 valores, sem botão', () => {
    const p: any = payloadDaMeta(def);
    expect(p).toMatchObject({ name: 'votacao_pendente_v3', language: 'pt_BR', category: 'UTILITY' });
    expect(p.components).toHaveLength(1);
    expect(p.components[0].text).toBe(VOTACAO_PENDENTE_V3.body);
    expect(p.components[0].example.body_text).toEqual([VOTACAO_PENDENTE_V3.example]);
  });

  it('nenhum travessão no que sai para a pessoa', () => {
    for (const s of [def.body, ...def.example]) {
      for (const codigo of [0x2013, 0x2014]) expect(s.includes(String.fromCharCode(codigo))).toBe(false);
    }
  });
});

describe('a v2 e a v1 não são mais enviáveis', () => {
  it('a v2 (`votacao_pendente`) saiu de TEMPLATES e dos CONTRATOS, e a caixa não monta corpo para ela', () => {
    expect(Object.keys(TEMPLATES)).not.toContain('votacao_pendente');
    expect((Object.values(TEMPLATES) as any[]).map((t) => t.name)).not.toContain('votacao_pendente');
    expect(contratoDoTemplate('votacao_pendente')).toBeNull();
    expect(corpoDoTemplatePorNome('votacao_pendente', ['Maria', '4Life', 'https://x', 'sábado, 26/09'])).toBeNull();
  });

  it('a v1 (`votacao_competencias`, MARKETING) segue registrada como contraste e sem contrato', () => {
    expect(TEMPLATES.votacao_competencias.category).toBe('MARKETING');
    expect(contratoDoTemplate('votacao_competencias')).toBeNull();
  });

  it('só a v3 está na tela de Envios', () => {
    const nomes = listarTemplatesDisparaveis().map((t) => t.template);
    expect(nomes).toContain('votacao_pendente_v3');
    expect(nomes).not.toContain('votacao_pendente');
    expect(nomes).not.toContain('votacao_competencias');
  });
});

describe('o contrato manda 3 parâmetros, na ordem do corpo', () => {
  const args = {
    telefone: '5511999999999', nome: 'Maria', semana: 1, tema: '', slug: '4life-educacao',
    baseUrl: 'https://4life-educacao.vertho.ai', instituicao: '4Life Educação',
  };

  it('nome, instituição e link da cédula, sem botão e sem prazo', () => {
    expect(contratoDoTemplate('votacao_pendente_v3')!(args)).toEqual({
      params: ['Maria', '4Life Educação', 'https://4life-educacao.vertho.ai/dashboard/votacao'],
      botaoParam: null,
    });
  });

  it('o contrato renderizado no corpo dá o texto aprovado (ordem do contrato = ordem do corpo)', () => {
    const { params } = contratoDoTemplate('votacao_pendente_v3')!(args);
    expect(renderTemplate(def, params)).toBe(VOTACAO_PENDENTE_V3.renderizadoComExemplo);
  });
});

describe('o que sai pela Cloud API e o que a caixa de entrada grava', () => {
  const exemplo = [...VOTACAO_PENDENTE_V3.example];

  it('a Meta recebe o template v3 com 3 parâmetros de corpo, na ordem, e nenhum botão', async () => {
    const r = await enviarTemplateCloud(
      { phone: '5511999998888', template: 'votacao_pendente_v3', params: exemplo },
      { motivo: 'votacao_pendente_v3', empresaId: 'e1', colaboradorId: 'c1' },
    );
    expect(r.ok).toBe(true);
    const t = corpos[0].template;
    expect(t.name).toBe('votacao_pendente_v3');
    expect(t.language).toEqual({ code: 'pt_BR' });
    expect(t.components).toEqual([
      { type: 'body', parameters: exemplo.map((text) => ({ type: 'text', text })) },
    ]);
  });

  it('a caixa de entrada grava o corpo APROVADO, igual ao que o legado de texto livre renderiza', async () => {
    await enviarTemplateCloud(
      { phone: '5511999998888', template: 'votacao_pendente_v3', params: exemplo },
      { motivo: 'votacao_pendente_v3', empresaId: 'e1', colaboradorId: 'c1' },
    );
    const [linha] = enviadas(sb);
    expect(linha.payload.template_nome).toBe('votacao_pendente_v3');
    expect(linha.payload.texto).toBe(VOTACAO_PENDENTE_V3.renderizadoComExemplo);
    // Caminho legado (texto livre) e caixa saem do MESMO corpo e dão o mesmo texto.
    expect(renderTemplate(def, exemplo)).toBe(linha.payload.texto);
    expect(corpoDoTemplatePorNome('votacao_pendente_v3', exemplo)).toBe(VOTACAO_PENDENTE_V3.renderizadoComExemplo);
  });

  it('🔴 4 parâmetros (o contrato da v2) não renderizam: o legado LANÇA e a caixa não inventa corpo', () => {
    const comPrazo = [...exemplo, 'sábado, 26/09'];
    expect(() => renderTemplate(def, comPrazo)).toThrow(/esperava 3 variáveis, recebeu 4/);
    expect(corpoDoTemplatePorNome('votacao_pendente_v3', comPrazo)).toBeNull();
  });
});
