/**
 * `acesso_vertho_v2` (R-47, revisão de 02/10/2026): o template do magic link por
 * WhatsApp com a validade certa, 1 hora em vez dos "15 minutos" do `acesso_vertho`.
 * Submetido à Meta em 05/10/2026; só passa a valer quando a env
 * `WHATSAPP_TEMPLATE_ACESSO` apontar para ele, DEPOIS de APPROVED.
 *
 * O que este arquivo congela, e por quê:
 *
 *  1. O corpo do código é byte a byte o submetido (a Meta compara o corpo), e o
 *     texto antigo errado não volta.
 *  2. O `acesso_vertho` legado CONTINUA registrado e com contrato: a env de
 *     produção (Sensitive, não se lê de volta) pode ainda apontar para ele, e sem
 *     contrato o login por WhatsApp pararia de mandar o link.
 *  3. O que sai pela Cloud API: corpo sem componente de corpo, a credencial só no
 *     botão, e a caixa de entrada grava o texto aprovado SEM a credencial.
 *  4. A R13 do health enxerga a troca de nome: env na v2 enquanto PENDING é crítico
 *     (a mensagem não sai), APPROVED/UTILITY é verde.
 *
 * O estado real na Meta (PENDING ou APPROVED) se confere lá, não aqui.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../../helpers/supabase-mock';
import { ACESSO_VERTHO_ANTIGO, ACESSO_VERTHO_V2 } from '../../helpers/template-submetido-acesso-vertho-v2';

const h = vi.hoisted(() => ({ sb: null as any, degradacoes: [] as any[] }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<any>()),
  registrarDegradacao: async (d: any) => { h.degradacoes.push(d); },
}));

const {
  TEMPLATES, NOMES_DO_TEMPLATE_DE_ACESSO, corpoDoTemplatePorNome, ehTemplateDeAcesso, payloadDaMeta, renderTemplate,
} = await import('@/lib/whatsapp/templates');
const { contratoDoTemplate, enviarPorTemplate } = await import('@/lib/notifications/pilula-template');
const { listarTemplatesDisparaveis } = await import('@/lib/notifications/envio-template-lote');
const { inspecionarTemplatesLigados } = await import('@/lib/whatsapp/templates-ligados');
const { checarTemplatesLigados } = await import('@/lib/pipeline-health/regras');

const def = TEMPLATES.acesso_vertho_v2 as any;
const CREDENCIAL = 'ibipeba~pkce_segredo_de_teste';

const corpos: any[] = [];
const urls: string[] = [];

function stubarFetch(resposta: (url: string) => any) {
  global.fetch = vi.fn(async (url: any, init: any) => {
    urls.push(String(url));
    corpos.push(init?.body ? JSON.parse(String(init.body)) : null);
    return resposta(String(url));
  }) as any;
}
const okComWamid = () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.ACESSO' }] }) });
const enviadas = (sb: SupabaseMock) => sb.escritas.filter((e) => e.tabela === 'whatsapp_mensagens_enviadas');

function limparEnv() {
  for (const k of Object.keys(process.env)) if (k.startsWith('WHATSAPP_TEMPLATE_')) delete process.env[k];
  delete process.env.META_WHATSAPPBUSINESS_API;
  delete process.env.PHONE_NUMBER_ID;
  delete process.env.WABA_ID;
}

let sb: SupabaseMock;
beforeEach(() => {
  corpos.length = 0;
  urls.length = 0;
  h.degradacoes.length = 0;
  limparEnv();
  process.env.META_WHATSAPPBUSINESS_API = 'token-de-teste';
  process.env.PHONE_NUMBER_ID = '123456';
  sb = criarSupabaseMock();
  h.sb = sb;
  stubarFetch(okComWamid);
});
afterEach(limparEnv);

const base = {
  telefone: '5574999225966', nome: 'Ana', semana: 1, tema: '', slug: '', baseUrl: '',
  formato: null, pilula: null, empresaId: 'e1', colaboradorId: 'c1',
};

describe('o registro do `acesso_vertho_v2` é o que foi submetido', () => {
  it('o corpo é BYTE A BYTE o submetido: sem variável, 1 hora', () => {
    expect(def.body).toBe(ACESSO_VERTHO_V2.body);
    expect(def.body).toContain('O link vale por 1 hora e só pode ser usado uma vez.');
    expect(def.body).not.toMatch(/\{\{|15 minutos|https?:/);
    expect(def.example).toEqual(ACESSO_VERTHO_V2.example);
  });

  it('nome na Meta = chave, UTILITY, pt_BR', () => {
    expect(def.name).toBe('acesso_vertho_v2');
    expect(def.category).toBe('UTILITY');
    expect(def.language).toBe('pt_BR');
  });

  it('o botão é o submetido: URL fixa com {{1}} no fim', () => {
    expect(def.botao).toEqual({
      texto: ACESSO_VERTHO_V2.botao.texto,
      url: ACESSO_VERTHO_V2.botao.url,
      exemplo: ACESSO_VERTHO_V2.botao.exemplo,
    });
    expect(def.botao.url.endsWith('?t={{1}}')).toBe(true);
  });

  it('o payload da Graph API leva o corpo submetido e o botão (o rodapé só existe na Meta)', () => {
    const p: any = payloadDaMeta(def);
    expect(p).toMatchObject({ name: 'acesso_vertho_v2', language: 'pt_BR', category: 'UTILITY' });
    expect(p.components[0].text).toBe(ACESSO_VERTHO_V2.body);
    const botoes = p.components.find((c: any) => c.type === 'BUTTONS').buttons;
    expect(botoes).toEqual([{
      type: 'URL', text: ACESSO_VERTHO_V2.botao.texto, url: ACESSO_VERTHO_V2.botao.url, example: [ACESSO_VERTHO_V2.botao.exemplo],
    }]);
    expect(JSON.stringify(p)).not.toContain(ACESSO_VERTHO_V2.rodape);
  });

  it('o texto de nenhum dos dois acesso tem travessão', () => {
    for (const nome of NOMES_DO_TEMPLATE_DE_ACESSO) {
      const t = (TEMPLATES as any)[nome];
      for (const s of [t.body, t.botao.texto, t.botao.exemplo]) {
        for (const codigo of [0x2013, 0x2014]) expect(s.includes(String.fromCharCode(codigo))).toBe(false);
      }
    }
  });

  it('o texto antigo errado (15 minutos) não é o da v2', () => {
    expect(def.body).not.toBe(ACESSO_VERTHO_ANTIGO);
    expect(def.body).not.toContain('15 minutos');
  });
});

describe('o legado `acesso_vertho` continua vivo até a env virar v2', () => {
  it('segue registrado com o texto antigo (a caixa de entrada precisa dele)', () => {
    expect(TEMPLATES.acesso_vertho.name).toBe('acesso_vertho');
    expect(TEMPLATES.acesso_vertho.body).toBe(ACESSO_VERTHO_ANTIGO);
    expect(corpoDoTemplatePorNome('acesso_vertho', [])).toBe(ACESSO_VERTHO_ANTIGO);
  });

  it('os dois nomes têm contrato, e é o MESMO: corpo vazio, credencial só no botão', () => {
    const args = { ...base, acessoParam: CREDENCIAL };
    const v2 = contratoDoTemplate('acesso_vertho_v2')!(args);
    const v1 = contratoDoTemplate('acesso_vertho')!(args);
    expect(v2).toEqual({ params: [], botaoParam: CREDENCIAL });
    expect(v1).toEqual(v2);
    // Sem credencial, nada de botão vazio.
    expect(contratoDoTemplate('acesso_vertho_v2')!({ ...base, acessoParam: null }).botaoParam).toBeNull();
  });

  it('os dois nomes são reconhecidos como acesso, o novo primeiro; nenhum outro', () => {
    expect([...NOMES_DO_TEMPLATE_DE_ACESSO]).toEqual(['acesso_vertho_v2', 'acesso_vertho']);
    expect(ehTemplateDeAcesso('acesso_vertho_v2')).toBe(true);
    expect(ehTemplateDeAcesso('acesso_vertho')).toBe(true);
    for (const outro of ['otp_acesso', 'acesso_vertho_v3', 'boas_vindas_v2', '', null, undefined]) {
      expect(ehTemplateDeAcesso(outro as any)).toBe(false);
    }
  });

  it('a tela de Envios não oferece nenhum dos dois: carregam credencial', () => {
    const nomes = listarTemplatesDisparaveis().map((t) => t.template);
    expect(nomes).not.toContain('acesso_vertho_v2');
    expect(nomes).not.toContain('acesso_vertho');
  });

  it('a tela de Envios classifica os dois como credencial, pelo mesmo helper do Beto', async () => {
    const { readFileSync } = await import('node:fs');
    const actions = readFileSync('app/admin/whatsapp/actions.ts', 'utf8');
    expect(actions).toContain('ehTemplateDeAcesso(tp.template)');
    expect(actions).not.toMatch(/tp\.template === 'acesso_vertho'/);
    const beto = readFileSync('lib/whatsapp/suporte-auto.ts', 'utf8');
    expect(beto).toContain('ehTemplateDeAcesso(x.template_nome)');
    expect(beto).not.toMatch(/template_nome === 'acesso_vertho'/);
  });
});

describe('o que sai pela Cloud API e o que a caixa de entrada grava', () => {
  it('🔴 env na v2: o template da Meta é a v2, sem componente de corpo, com a credencial só no botão', async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho_v2';
    const r = await enviarPorTemplate('acesso', { ...base, acessoParam: CREDENCIAL });

    expect(r).toMatchObject({ tentou: true, ok: true });
    const t = corpos[0].template;
    expect(t.name).toBe('acesso_vertho_v2');
    expect(t.language).toEqual({ code: 'pt_BR' });
    // Corpo sem variável NÃO leva componente: `parameters: []` faria a Meta recusar.
    expect(t.components.map((c: any) => c.type)).toEqual(['button']);
    expect(t.components[0]).toEqual({
      type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: CREDENCIAL }],
    });
  });

  it('a caixa grava o corpo APROVADO da v2 (1 hora) e nunca a credencial', async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho_v2';
    await enviarPorTemplate('acesso', { ...base, acessoParam: CREDENCIAL, origem: 'suporte-auto' });

    const [linha] = enviadas(sb);
    expect(linha.payload.template_nome).toBe('acesso_vertho_v2');
    expect(linha.payload.texto).toBe(ACESSO_VERTHO_V2.body);
    expect(linha.payload.origem).toBe('suporte-auto');
    expect(JSON.stringify(corpos[0])).toContain(CREDENCIAL);
    expect(JSON.stringify(linha.payload)).not.toContain('pkce_segredo_de_teste');
  });

  it('legado e caixa de entrada saem IGUAIS ao texto aprovado: renderTemplate = corpoDoTemplatePorNome = submetido', () => {
    expect(renderTemplate(def, [])).toBe(ACESSO_VERTHO_V2.body);
    expect(corpoDoTemplatePorNome('acesso_vertho_v2', [])).toBe(ACESSO_VERTHO_V2.body);
  });

  it('🔴 env ainda no legado: o envio continua saindo, pelo nome antigo e com o texto antigo gravado', async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho';
    const r = await enviarPorTemplate('acesso', { ...base, acessoParam: CREDENCIAL });

    expect(r).toMatchObject({ tentou: true, ok: true });
    expect(corpos[0].template.name).toBe('acesso_vertho');
    expect(corpos[0].template.components.map((c: any) => c.type)).toEqual(['button']);
    expect(enviadas(sb)[0].payload.texto).toBe(ACESSO_VERTHO_ANTIGO);
  });

  it('🔴 env com nome sem contrato (typo, versão futura): NÃO envia e diz, em vez de mandar parâmetro errado', async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho_v3';
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await enviarPorTemplate('acesso', { ...base, acessoParam: CREDENCIAL });
    expect(r).toEqual({ tentou: false });
    expect(corpos).toHaveLength(0);
    expect(erro.mock.calls.flat().join(' ')).toMatch(/acesso_vertho_v3.*sem contrato|não tem contrato/);
    erro.mockRestore();
  });

  it('env desligada: não tenta, e o chamador decide o que fazer', async () => {
    const r = await enviarPorTemplate('acesso', { ...base, acessoParam: CREDENCIAL });
    expect(r).toEqual({ tentou: false });
    expect(corpos).toHaveLength(0);
  });
});

describe('R13: o health enxerga a troca de nome do papel `acesso`', () => {
  const metaTem = (lista: Array<{ name: string; status: string; category: string }>) =>
    stubarFetch(() => ({ ok: true, status: 200, json: async () => ({ data: lista }) }));

  async function ligadoNoAcesso() {
    process.env.WABA_ID = 'waba-teste';
    const ligados = await inspecionarTemplatesLigados();
    return { ligados, acesso: ligados.find((t) => t.papel === 'acesso')!, achados: checarTemplatesLigados(ligados) };
  }

  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('🔴 env trocada na v2 ANTES de APPROVED: crítico, a mensagem não sai (132001)', async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho_v2';
    metaTem([{ name: 'acesso_vertho_v2', status: 'PENDING', category: 'UTILITY' }, { name: 'acesso_vertho', status: 'APPROVED', category: 'UTILITY' }]);
    const { acesso, achados } = await ligadoNoAcesso();
    expect(acesso).toMatchObject({ nome: 'acesso_vertho_v2', status: 'PENDING' });
    const a = achados.find((x) => x.id === 'template-ligado-nao-aprovado')!;
    expect(a.severidade).toBe('critico');
    expect(a.amostra).toEqual(['acesso → acesso_vertho_v2 (PENDING)']);
  });

  it('env na v2 APPROVED/UTILITY: nenhum achado, e o log mostra o nome novo', async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho_v2';
    metaTem([{ name: 'acesso_vertho_v2', status: 'APPROVED', category: 'UTILITY' }]);
    const { acesso, achados } = await ligadoNoAcesso();
    expect(acesso).toMatchObject({ nome: 'acesso_vertho_v2', status: 'APPROVED', categoria: 'UTILITY' });
    expect(achados).toEqual([]);
    const log = (console.log as any).mock.calls.map((c: any[]) => c.join(' ')).find((l: string) => l.startsWith('[templates-ligados]'));
    expect(log).toContain('acesso=acesso_vertho_v2[APPROVED/UTILITY]');
  });

  it('env ainda no legado APPROVED: nenhum achado (a transição não alarma)', async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho';
    metaTem([{ name: 'acesso_vertho', status: 'APPROVED', category: 'UTILITY' }, { name: 'acesso_vertho_v2', status: 'APPROVED', category: 'UTILITY' }]);
    const { achados } = await ligadoNoAcesso();
    expect(achados).toEqual([]);
  });

  it('v2 que a Meta reclassificou para MARKETING: aviso (custa 6x)', async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho_v2';
    metaTem([{ name: 'acesso_vertho_v2', status: 'APPROVED', category: 'MARKETING' }]);
    const { achados } = await ligadoNoAcesso();
    expect(achados.map((x) => x.id)).toEqual(['template-ligado-marketing']);
  });

  it('nome que a Meta não conhece (typo na env): INEXISTENTE, crítico', async () => {
    process.env.WHATSAPP_TEMPLATE_ACESSO = 'acesso_vertho_v2_';
    metaTem([{ name: 'acesso_vertho_v2', status: 'APPROVED', category: 'UTILITY' }]);
    const { acesso, achados } = await ligadoNoAcesso();
    expect(acesso.status).toBe('INEXISTENTE');
    expect(achados.map((x) => x.id)).toEqual(['template-ligado-inexistente']);
  });
});
