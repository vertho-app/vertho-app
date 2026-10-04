import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import baseline from '../fixtures/emails-cadencia-ptbr.json';

/**
 * Onda D, d-mail (04/10/2026): os e-mails que a plataforma manda à pessoa saem no
 * idioma DELA (pt-BR, pt-PT, es-ES, en-US), e não só em pt-BR.
 *
 * O que se prova aqui:
 *  1. o pt-BR é BYTE A BYTE o que saía antes (cópia congelada em
 *     `tests/fixtures/emails-cadencia-ptbr.json`, gerada do código anterior à onda);
 *  2. cada um dos 7 e-mails da cadência sai nos 4 idiomas, sem marcador solto,
 *     sem travessão nem emoji, com o rodapé de privacidade no idioma;
 *  3. em en-US e es-ES não sobra português; o dado do banco entra escapado;
 *  4. os textos têm os mesmos `{marcadores}` nos 4 idiomas (o tipo não vê isso);
 *  5. os três disparos do admin (perfil, convite, mensagem customizada) escolhem o
 *     idioma POR DESTINATÁRIO: o da pessoa, senão o da empresa, senão pt-BR.
 *
 * A cadência em si (cron diário, locale vindo do banco) está em
 * `tests/unit/emails-cadencia-idioma.test.ts`.
 */

const sendEmail = vi.fn(async (_b: any) => ({ ok: true, provider: 'resend' }));
vi.mock('@/lib/email-provider', () => ({
  sendEmail: (b: any) => sendEmail(b),
  emailConfigurationError: () => null,
  emailProviderName: () => 'resend',
}));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(async () => sbAtual.client),
  requireEmpresaSupabase: vi.fn(async () => sbAtual.client),
}));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sbAtual.client }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/demo/envio-guard', () => ({ gateEnvioDemo: vi.fn(async () => ({ blocked: false })) }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ assertWhatsappAvailable: vi.fn(), sendWhatsapp: vi.fn() }));
vi.mock('@/lib/turmas/escopo', () => ({ idsDoEscopoOuFalhar: vi.fn(async () => null), mensagemEscopoObrigatorio: () => null }));

let sbAtual = criarSupabaseMock();

import type { AppLocale } from '@/i18n/routing';
import { locales } from '@/i18n/routing';
import {
  emailAvaliacaoFinal, emailEvidencia, emailMissao, emailPilula, emailPilulaPendente, emailSemanaPendente,
  labelFormatoEmail, temaPilula,
} from '@/lib/notifications/pilula-envio';
import { COPIA_EMAIL, copiaEmail, escaparHtml, preencher } from '@/lib/i18n-email-templates';
import { ROTULO_PRIVACIDADE } from '@/lib/notifications/rodape-privacidade';
import { enviarLinksPerfil } from '@/actions/fase5/relatorios-envios';
import { dispararEmails } from '@/actions/fase2';
import { dispararMensagemCustomizada } from '@/app/admin/whatsapp/actions';

const BASE = 'https://acme.vertho.ai';
const TRAVESSAO = /[\u2013\u2014]/;
const EMOJI = /\p{Extended_Pictographic}/u;

// ── 1. pt-BR byte a byte ──────────────────────────────────────────────────────

/** As mesmas entradas com que a cópia congelada foi gerada (código de antes da onda). */
function gerarComoAntes(locale?: AppLocale) {
  const l = locale ? { locale } : {};
  const item = { competencia: 'Comunicação', descritor: 'Escuta ativa', conteudo: { core_titulo: 'Escuta ativa' } };
  const out: Record<string, any> = {};
  for (const formato of ['video', 'audio', 'texto', 'case', 'pdf', null]) {
    out[`pilula-${formato}`] = emailPilula('Maria Souza', item, { semana: 3, baseUrl: BASE, formato: formato as any, pilula: 1, ...l });
    out[`pendente-${formato}`] = emailPilulaPendente('Maria Souza', item, { semana: 3, baseUrl: BASE, formato: formato as any, pilula: 2, ...l });
    out[`label-${formato}`] = labelFormatoEmail(formato as any, locale);
  }
  out['pilula-vazio'] = emailPilula('', {}, { semana: 2, baseUrl: BASE, formato: 'texto', ...l });
  out['pilula-sem-base'] = emailPilula('Ana', item, { semana: 2, baseUrl: '', formato: 'texto', ...l });
  out['tema-vazio'] = temaPilula({});
  out['evidencia'] = emailEvidencia('Maria Souza', { semana: 3, baseUrl: BASE, ...l });
  out['evidencia-sem-nome'] = emailEvidencia('', { semana: 3, baseUrl: BASE, ...l });
  out['final-abertura'] = emailAvaliacaoFinal('Maria Souza', { semana: 7, baseUrl: BASE, momento: 'abertura', ...l });
  out['final-cobranca'] = emailAvaliacaoFinal('Maria Souza', { semana: 7, baseUrl: BASE, momento: 'cobranca', ...l });
  out['missao'] = emailMissao('Maria Souza', { semana: 4, baseUrl: BASE, ...l });
  out['missao-acao'] = emailMissao('Maria Souza', { semana: 8, baseUrl: BASE, acaoPrincipal: 'Aplicar a escuta ativa', ...l });
  out['semana-pendente'] = emailSemanaPendente('Maria Souza', { semana: 4, semanaPendente: 3, baseUrl: BASE, ...l });
  return out;
}

describe('pt-BR: o texto é o que saía antes da onda, byte a byte', () => {
  it('sem locale (quem não passa idioma, como os scripts) sai idêntico à cópia congelada', () => {
    expect(gerarComoAntes()).toEqual(baseline);
  });

  it('com locale pt-BR sai idêntico à cópia congelada', () => {
    expect(gerarComoAntes('pt-BR')).toEqual(baseline);
  });
});

// ── 2. cada e-mail em cada idioma ─────────────────────────────────────────────

// Dados NEUTROS de propósito (sem acento, sem palavra de nenhuma língua): assim o que sobra
// de texto visível depois de tirá-los é só copy fixa, e o teste de "português que sobra" é justo.
const NOME = 'Ana Souza';
const ITEM = { competencia: 'ZZCOMP', descritor: 'ZZDESC' };

const GERADORES: Array<[string, (locale: AppLocale) => { subject: string; html: string }]> = [
  ['conteúdo da semana', (locale) => emailPilula(NOME, ITEM, { semana: 3, baseUrl: BASE, formato: 'texto', pilula: 1, locale })],
  ['conteúdo da semana, formato sem rótulo', (locale) => emailPilula(NOME, ITEM, { semana: 3, baseUrl: BASE, formato: 'pdf', locale })],
  ['conteúdo pendente', (locale) => emailPilulaPendente(NOME, ITEM, { semana: 3, baseUrl: BASE, formato: 'video', pilula: 2, locale })],
  ['evidências', (locale) => emailEvidencia(NOME, { semana: 3, baseUrl: BASE, locale })],
  ['avaliação final (abertura)', (locale) => emailAvaliacaoFinal(NOME, { semana: 7, baseUrl: BASE, momento: 'abertura', locale })],
  ['avaliação final (cobrança)', (locale) => emailAvaliacaoFinal(NOME, { semana: 7, baseUrl: BASE, momento: 'cobranca', locale })],
  ['desafio de aplicação', (locale) => emailMissao(NOME, { semana: 4, baseUrl: BASE, acaoPrincipal: 'ZZACAO', locale })],
  ['desafio de aplicação, sem resumo', (locale) => emailMissao(NOME, { semana: 4, baseUrl: BASE, locale })],
  ['semana pendente', (locale) => emailSemanaPendente(NOME, { semana: 4, semanaPendente: 3, baseUrl: BASE, locale })],
];

/** O texto que a pessoa lê: sem tag, sem URL e sem os dados do banco que o teste injetou. */
function textoVisivel(html: string): string {
  return html
    .replace(/<img[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/ZZCOMP|ZZDESC|ZZACAO/g, ' ')
    .replace(/\bAna\b/g, ' ');
}

/** Palavra inteira, com acento: `\b` do JS não vê letra acentuada como letra (CLAUDE.md). */
const palavra = (w: string) => new RegExp(`(?<![a-zà-úñ])${w}(?![a-zà-úñ])`, 'i');

describe.each(locales)('e-mails da jornada em %s', (locale) => {
  it.each(GERADORES)('%s: assunto e corpo completos, sem marcador solto, sem travessão nem emoji', (_n, gerar) => {
    const { subject, html } = gerar(locale);
    expect(subject.length).toBeGreaterThan(5);
    expect(html.length).toBeGreaterThan(200);
    for (const t of [subject, html]) {
      expect(t).not.toMatch(/\{\w+\}/);
      expect(t).not.toMatch(/undefined|null|\[object/);
      expect(t).not.toMatch(TRAVESSAO);
      expect(t).not.toMatch(EMOJI);
    }
    // o dado do banco entra; só o primeiro nome vai na saudação
    expect(html).toContain('Ana');
    expect(html).not.toContain('Souza');
    // o rodapé de privacidade é o do idioma
    expect(html).toContain(`>${ROTULO_PRIVACIDADE[locale]}</a>`);
    // o link da semana continua sendo o do tenant
    expect(html).toContain(`href="${BASE}/dashboard/temporada/semana/`);
  });

});

describe('es-ES abre toda exclamação (R-121)', () => {
  it.each(GERADORES)('%s', (_n, gerar) => {
    const { subject, html } = gerar('es-ES');
    for (const t of [subject, textoVisivel(html)]) {
      expect((t.match(/!/g) || []).length, t).toBe((t.match(/¡/g) || []).length);
    }
  });

  it('o assunto e a saudação do convite e do perfil também (copy fixa)', () => {
    const c = COPIA_EMAIL['es-ES'];
    for (const t of [c.saudacao, c.perfil.saudacao, c.convite.saudacao, c.convite.saudacaoSemNome, c.missao.nota]) {
      expect((t.match(/!/g) || []).length, t).toBe((t.match(/¡/g) || []).length);
    }
  });
});

describe('idiomas: o texto muda de verdade e não sobra português', () => {
  it('os 3 idiomas novos diferem do pt-BR em todos os e-mails (assunto ou corpo)', () => {
    for (const locale of ['pt-PT', 'es-ES', 'en-US'] as const) {
      for (const [nome, gerar] of GERADORES) {
        const novo = gerar(locale);
        const ptBR = gerar('pt-BR');
        expect(novo.subject + novo.html, `${locale}: ${nome}`).not.toBe(ptBR.subject + ptBR.html);
      }
    }
  });

  it('en-US: assunto e texto visível só em ASCII (inglês não tem acento) e sem uma palavra de português', () => {
    const PT = ['semana', 'você', 'sua', 'seu', 'jornada', 'equipe', 'conteúdo', 'pendente', 'abrir', 'olá', 'desafio', 'evidências', 'avaliação', 'plataforma', 'ver', 'registrar'];
    for (const [nome, gerar] of GERADORES) {
      const { subject, html } = gerar('en-US');
      const texto = `${subject} ${textoVisivel(html)}`;
      expect(texto.replace(/[→·]/g, ''), nome).toMatch(/^[\x20-\x7E\r\n]*$/);
      for (const p of PT) expect(texto, `${nome}: "${p}"`).not.toMatch(palavra(p));
      // o alt da imagem também é copy
      expect(html, nome).not.toContain('Vídeo explicativo');
    }
  });

  it('es-ES: sem letra nem palavra que só existe em português', () => {
    const SO_PT = ['você', 'sua', 'seu', 'jornada', 'equipe', 'conteúdo', 'pendente', 'olá', 'não', 'está na', 'já'];
    for (const [nome, gerar] of GERADORES) {
      const { subject, html } = gerar('es-ES');
      const texto = `${subject} ${textoVisivel(html)}`;
      expect(texto, nome).not.toMatch(/[ãõçêâô]/i);
      for (const p of SO_PT) expect(texto, `${nome}: "${p}"`).not.toMatch(palavra(p));
    }
  });

  it('pt-PT: português de Portugal (equipa, registo), não o do Brasil', () => {
    const evid = emailEvidencia(NOME, { semana: 3, baseUrl: BASE, locale: 'pt-PT' }).html;
    expect(evid).toContain('Equipa Vertho');
    expect(evid).toContain('registo de evidências');
    expect(evid).toContain('Registar a minha evidência');
    expect(evid).not.toMatch(/Equipe|registro|Registrar|você/);
  });

  it('o rótulo do formato e o tema padrão seguem o idioma', () => {
    expect(labelFormatoEmail('texto', 'en-US')).toBe('text');
    expect(labelFormatoEmail('case', 'es-ES')).toBe('estudio de caso');
    expect(labelFormatoEmail('pdf', 'en-US')).toBe('content');
    expect(labelFormatoEmail('outro', 'pt-BR')).toBe('conteúdo');
    expect(labelFormatoEmail(null, 'es-ES')).toBe('contenido');
    expect(emailPilula('', {}, { semana: 2, baseUrl: BASE, locale: 'en-US' }).subject).toBe('Your week 2 content: new content for the week');
    expect(emailPilula('', {}, { semana: 2, baseUrl: BASE, locale: 'es-ES' }).subject).toBe('Tu contenido de la semana 2: nuevo contenido de la semana');
  });

  it('sem nome no cadastro: "Employee" em inglês (não "User") e "Colaborador" nos demais', () => {
    expect(emailEvidencia('', { semana: 3, baseUrl: BASE, locale: 'en-US' }).html).toContain('Hi, Employee.');
    expect(emailEvidencia('', { semana: 3, baseUrl: BASE, locale: 'es-ES' }).html).toContain('Hola, Colaborador.');
    expect(emailEvidencia('', { semana: 3, baseUrl: BASE, locale: 'pt-PT' }).html).toContain('Olá, Colaborador.');
  });

  it('assunto e frases-chave nos 4 idiomas (o sentido de cada e-mail)', () => {
    const s = (l: AppLocale) => ({
      pilula: emailPilula(NOME, ITEM, { semana: 3, baseUrl: BASE, formato: 'texto', locale: l }).subject,
      evid: emailEvidencia(NOME, { semana: 3, baseUrl: BASE, locale: l }).subject,
      abre: emailAvaliacaoFinal(NOME, { semana: 7, baseUrl: BASE, momento: 'abertura', locale: l }).subject,
      cobra: emailAvaliacaoFinal(NOME, { semana: 7, baseUrl: BASE, momento: 'cobranca', locale: l }).subject,
      desafio: emailMissao(NOME, { semana: 4, baseUrl: BASE, locale: l }).subject,
      pend: emailPilulaPendente(NOME, ITEM, { semana: 3, baseUrl: BASE, locale: l }).subject,
      semPend: emailSemanaPendente(NOME, { semana: 4, semanaPendente: 3, baseUrl: BASE, locale: l }).subject,
    });
    expect(s('pt-PT')).toEqual({
      pilula: 'O seu conteúdo da semana 3: ZZCOMP · ZZDESC', evid: 'Evidências da semana 3: pendente',
      abre: 'A sua avaliação final está aberta', cobra: 'Avaliação final pendente',
      desafio: 'Semana 4: o seu desafio de aplicação', pend: 'Semana 3: ZZCOMP · ZZDESC (pendente)',
      semPend: 'Semana 3: pendente na sua jornada',
    });
    expect(s('es-ES')).toEqual({
      pilula: 'Tu contenido de la semana 3: ZZCOMP · ZZDESC', evid: 'Evidencias de la semana 3: pendiente',
      abre: 'Tu evaluación final está abierta', cobra: 'Evaluación final pendiente',
      desafio: 'Semana 4: tu desafío de aplicación', pend: 'Semana 3: ZZCOMP · ZZDESC (pendiente)',
      semPend: 'Semana 3: pendiente en tu recorrido',
    });
    expect(s('en-US')).toEqual({
      pilula: 'Your week 3 content: ZZCOMP · ZZDESC', evid: 'Week 3 evidence: pending',
      abre: 'Your final assessment is open', cobra: 'Final assessment pending',
      desafio: 'Week 4: your application challenge', pend: 'Week 3: ZZCOMP · ZZDESC (pending)',
      semPend: 'Week 3: pending in your journey',
    });
  });
});

describe('o dado do banco entra no corpo ESCAPADO e no assunto como está', () => {
  const PERIGO = '<b>"A&B"</b>';
  it.each(locales)('%s: tema, resumo do desafio e nome não injetam HTML; o assunto (texto) não é escapado', (locale) => {
    const item = { competencia: PERIGO, descritor: 'x' };
    const p = emailPilula("O'Brien <i>", item, { semana: 3, baseUrl: BASE, formato: 'texto', locale });
    expect(p.html).not.toContain('<b>');
    expect(p.html).not.toContain('<i>');
    expect(p.html).toContain('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
    expect(p.html).toContain('O&#39;Brien');
    expect(p.subject).toContain(PERIGO);
    const m = emailMissao('Ana', { semana: 4, baseUrl: BASE, acaoPrincipal: PERIGO, locale });
    expect(m.html).not.toContain('<b>');
    expect(m.html).toContain('<em>&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;</em>');
    const pend = emailPilulaPendente('Ana', item, { semana: 3, baseUrl: BASE, locale });
    expect(pend.html).not.toContain('<b>');
    expect(pend.subject).toContain(PERIGO);
  });

  it('o escape cobre os cinco caracteres e o preencher não interpreta "$&" do valor', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(preencher('Oi {nome}!', { nome: '$& $1' })).toBe('Oi $&amp; $1!');
    expect(preencher('Oi {nome}!', { nome: '$& $1' }, 'texto')).toBe('Oi $& $1!');
    // marcador sem valor fica como está (o teste de cobertura é quem o impede de chegar ao e-mail)
    expect(preencher('Oi {nome} {x}', { nome: 'A' })).toBe('Oi A {x}');
    // chave herdada do Object não vira valor
    expect(preencher('{constructor}', {})).toBe('{constructor}');
  });
});

describe('idioma desconhecido: cai no pt-BR e nunca lança', () => {
  it.each([undefined, null, 'xx-YY', 'constructor', '__proto__', 'toString'])('%s', (valor) => {
    const esperado = emailEvidencia(NOME, { semana: 3, baseUrl: BASE, locale: 'pt-BR' });
    expect(emailEvidencia(NOME, { semana: 3, baseUrl: BASE, locale: valor as any })).toEqual(esperado);
    expect(copiaEmail(valor as any)).toBe(COPIA_EMAIL['pt-BR']);
  });
});

// ── 4. os textos são paralelos nos 4 idiomas ──────────────────────────────────

function folhas(o: any, caminho = ''): Array<[string, string]> {
  if (typeof o === 'string') return [[caminho, o]];
  return Object.entries(o).flatMap(([k, v]) => folhas(v, caminho ? `${caminho}.${k}` : k));
}
const marcadores = (s: string) => [...new Set(s.match(/\{\w+\}/g) || [])].sort();

describe('os textos têm a mesma forma nos 4 idiomas', () => {
  const porLocale = Object.fromEntries(locales.map((l) => [l, new Map(folhas(COPIA_EMAIL[l]))]));

  it('as mesmas chaves, nenhuma vazia', () => {
    const base = [...porLocale['pt-BR'].keys()];
    expect(base.length).toBeGreaterThan(50);
    for (const l of locales) {
      expect([...porLocale[l].keys()], l).toEqual(base);
      for (const [k, v] of porLocale[l]) expect(v.trim().length, `${l}: ${k}`).toBeGreaterThan(0);
    }
  });

  it('os mesmos {marcadores} em cada chave (um idioma sem {semana} mandaria um e-mail sem a semana)', () => {
    for (const [chave, texto] of porLocale['pt-BR']) {
      for (const l of locales) {
        expect(marcadores(porLocale[l].get(chave)!), `${l}: ${chave}`).toEqual(marcadores(texto));
      }
    }
  });

  it('as mesmas tags HTML, na mesma quantidade', () => {
    const tags = (s: string) => (s.match(/<\/?\w+>/g) || []).sort();
    for (const [chave, texto] of porLocale['pt-BR']) {
      for (const l of locales) expect(tags(porLocale[l].get(chave)!), `${l}: ${chave}`).toEqual(tags(texto));
    }
  });

  it('vocabulário canônico: sem travessão, emoji nem jargão de software, e sem as palavras que o produto aposentou', () => {
    const PROIBIDO: Record<AppLocale, RegExp> = {
      'pt-BR': /trilha|pílula|miss(ão|ões)|mentora|temporada|ciclo|dashboard|magic link|checklist/i,
      'pt-PT': /trilha|pílula|miss(ão|ões)|mentora|temporada|ciclo|dashboard|magic link|checklist/i,
      'es-ES': /temporada|píldora|pildora|misión|mision|ruta\b|itinerario|dashboard|magic link|checklist/i,
      'en-US': /\bseasons?\b|learning pill|\bmission\b|\buser\b|dashboard|magic link|checklist/i,
    };
    for (const l of locales) {
      for (const [chave, texto] of porLocale[l]) {
        expect(texto, `${l}: ${chave}`).not.toMatch(TRAVESSAO);
        expect(texto, `${l}: ${chave}`).not.toMatch(EMOJI);
        expect(texto, `${l}: ${chave}`).not.toMatch(PROIBIDO[l]);
      }
    }
  });

  it('o nome de cada coisa é o do vocabulário (Jornada/Recorrido/Journey, Desafio/Desafío/Challenge, Employee)', () => {
    const todo = (l: AppLocale) => [...porLocale[l].values()].join(' | ');
    expect(todo('pt-BR')).toMatch(/jornada/);
    expect(todo('pt-PT')).toMatch(/jornada/);
    expect(todo('es-ES')).toMatch(/recorrido/);
    expect(todo('en-US')).toMatch(/journey/);
    expect(todo('es-ES')).toMatch(/desafío/);
    expect(todo('en-US')).toMatch(/challenge/);
    expect(COPIA_EMAIL['en-US'].nomePadrao).toBe('Employee');
  });
});

// ── 5. os disparos do admin escolhem o idioma por destinatário ────────────────

/** Faz o mock devolver só as colunas pedidas, como o PostgREST: select sem `locale` não traz `locale`. */
function projetar(linhas: any[], cols: string): any[] {
  const pedidas = new Set(cols.split(',').map((c) => c.trim()));
  return linhas.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => pedidas.has(k))));
}

const PESSOAS = [
  { id: 'c-ptbr', nome_completo: 'Ana Souza', email: 'ana@escola.test', locale: 'pt-BR' },
  { id: 'c-ptpt', nome_completo: 'Rui Costa', email: 'rui@escola.test', locale: 'pt-PT' },
  { id: 'c-en', nome_completo: 'Kim Lee', email: 'kim@escola.test', locale: 'en-US' },
  { id: 'c-sem', nome_completo: 'Eva Ruiz', email: 'eva@escola.test', locale: null },
  { id: 'c-ruim', nome_completo: 'Zed Zorn', email: 'zed@escola.test', locale: 'klingon' },
];
const COM_CARGO_E_DISC = (p: any) => ({ ...p, cargo: 'Professora', telefone: null, perfil_dominante: 'D', d_natural: 60 });

function mockDaEmpresa(defaultLocale: string | null) {
  return criarSupabaseMock({
    resolver: (t, cols) => (t === 'empresas' ? projetar([{ nome: 'Escola Teste', slug: 'escolateste', default_locale: defaultLocale }], cols)[0] : null),
    escritaUnica: (_t, _op, payload) => ({ ...payload, id: 'env-1' }),
    lista: (t, cols) => (t === 'colaboradores' ? projetar(PESSOAS.map(COM_CARGO_E_DISC), cols) : []),
  });
}

const enviadoPara = (email: string) => sendEmail.mock.calls.map((c) => c[0]).find((b) => b.to === email);

describe('disparos do admin: o idioma é o do destinatário (pessoa, senão empresa, senão pt-BR)', () => {
  beforeEach(() => { sendEmail.mockClear(); });

  it('perfil de evolução (enviarLinksPerfil)', async () => {
    sbAtual = mockDaEmpresa('es-ES');
    const r: any = await enviarLinksPerfil('emp-1');
    expect(r.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(PESSOAS.length);
    const ptbr = enviadoPara('ana@escola.test');
    expect(ptbr.subject).toBe('[Escola Teste] Seu Perfil de Evolução');
    expect(ptbr.html).toContain('<p>Olá Ana Souza!</p><p>Seu perfil está disponível.</p>');
    expect(ptbr.html).toContain('>Acessar Perfil</a>');
    expect(enviadoPara('rui@escola.test').subject).toBe('[Escola Teste] O seu Perfil de Evolução');
    expect(enviadoPara('rui@escola.test').html).toContain('Aceder ao Perfil');
    const en = enviadoPara('kim@escola.test');
    expect(en.subject).toBe('[Escola Teste] Your Evolution Profile');
    expect(en.html).toContain('Hi, Kim Lee!');
    expect(en.html).toContain('>View Profile</a>');
    expect(en.html).toContain(`>${ROTULO_PRIVACIDADE['en-US']}</a>`);
    // sem locale na pessoa: o da EMPRESA (es-ES); locale inválido: também o da empresa
    for (const email of ['eva@escola.test', 'zed@escola.test']) {
      expect(enviadoPara(email).subject, email).toBe('[Escola Teste] Tu Perfil de Evolución');
      expect(enviadoPara(email).html, email).toContain('Acceder al Perfil');
      expect(enviadoPara(email).html, email).toContain(`>${ROTULO_PRIVACIDADE['es-ES']}</a>`);
    }
  });

  it('perfil de evolução: sem locale na pessoa nem na empresa sai em pt-BR', async () => {
    sbAtual = mockDaEmpresa(null);
    await enviarLinksPerfil('emp-1');
    expect(enviadoPara('eva@escola.test').subject).toBe('[Escola Teste] Seu Perfil de Evolução');
    expect(enviadoPara('zed@escola.test').html).toContain(`>${ROTULO_PRIVACIDADE['pt-BR']}</a>`);
  });

  it('convite de avaliação (dispararEmails)', async () => {
    sbAtual = mockDaEmpresa('es-ES');
    const r: any = await dispararEmails('emp-1');
    expect(r.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(PESSOAS.length);
    const ptbr = enviadoPara('ana@escola.test');
    expect(ptbr.subject).toBe('[Escola Teste] Avaliação de Competências');
    expect(ptbr.html).toContain('<p>Olá Ana!</p>');
    expect(ptbr.html).toContain('Você foi convidado(a) para participar da avaliação de competências da <strong>Escola Teste</strong>.');
    expect(ptbr.html).toContain('>Iniciar Avaliação</a>');
    expect(ptbr.html).toContain('Ou acesse: https://escolateste.vertho.ai/avaliacao/');
    const en = enviadoPara('kim@escola.test');
    expect(en.subject).toBe('[Escola Teste] Competency Assessment');
    expect(en.html).toContain('<p>Hi, Kim!</p>');
    expect(en.html).toContain('You have been invited to take part in the competency assessment at <strong>Escola Teste</strong>.');
    expect(en.html).toContain('Or open: https://escolateste.vertho.ai/avaliacao/');
    expect(en.html).toContain(`>${ROTULO_PRIVACIDADE['en-US']}</a>`);
    const es = enviadoPara('eva@escola.test');
    expect(es.subject).toBe('[Escola Teste] Evaluación de Competencias');
    expect(es.html).toContain('<p>¡Hola, Eva!</p>');
    expect(es.html).toContain(`>${ROTULO_PRIVACIDADE['es-ES']}</a>`);
    expect(enviadoPara('rui@escola.test').html).toContain('Foi convidado(a) a participar na avaliação');
  });

  it('cadastro sem nome: o convite abre sem nome e o perfil usa o nome-padrão do idioma', async () => {
    const semNome = { ...COM_CARGO_E_DISC({ id: 'c-x', email: 'x@escola.test', locale: 'es-ES' }), nome_completo: null };
    sbAtual = criarSupabaseMock({
      resolver: (t, cols) => (t === 'empresas' ? projetar([{ nome: 'Escola Teste', slug: 'escolateste', default_locale: null }], cols)[0] : null),
      escritaUnica: (_t, _op, payload) => ({ ...payload, id: 'env-1' }),
      lista: (t, cols) => (t === 'colaboradores' ? projetar([semNome], cols) : []),
    });
    await dispararEmails('emp-1');
    expect(enviadoPara('x@escola.test').html).toContain('<p>¡Hola!</p>');
    sendEmail.mockClear();
    await enviarLinksPerfil('emp-1');
    expect(enviadoPara('x@escola.test').html).toContain('<p>¡Hola, Colaborador!</p>');
  });

  it('mensagem customizada: o corpo é do operador e fica como ele escreveu; rodapé e assunto padrão seguem o destinatário', async () => {
    sbAtual = mockDaEmpresa('es-ES');
    const r: any = await dispararMensagemCustomizada('emp-1', 'Texto do operador para {{nome}}', 'email', {}, '');
    expect(r.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(PESSOAS.length);
    const ptbr = enviadoPara('ana@escola.test');
    expect(ptbr.subject).toBe('[Escola Teste] Avaliação');
    expect(ptbr.html.startsWith('Texto do operador para Ana<p ')).toBe(true);
    expect(ptbr.html).toContain(`>${ROTULO_PRIVACIDADE['pt-BR']}</a>`);
    const en = enviadoPara('kim@escola.test');
    expect(en.subject).toBe('[Escola Teste] Assessment');
    expect(en.html.startsWith('Texto do operador para Kim<p ')).toBe(true);
    expect(en.html).toContain(`>${ROTULO_PRIVACIDADE['en-US']}</a>`);
    expect(enviadoPara('eva@escola.test').subject).toBe('[Escola Teste] Evaluación');
    expect(enviadoPara('rui@escola.test').html).toContain(`>${ROTULO_PRIVACIDADE['pt-PT']}</a>`);
  });

  it('mensagem customizada: o assunto que o operador escreve não é traduzido nem trocado', async () => {
    sbAtual = mockDaEmpresa('en-US');
    await dispararMensagemCustomizada('emp-1', 'Oi', 'email', {}, 'Aviso importante');
    for (const p of PESSOAS) expect(enviadoPara(p.email).subject, p.email).toBe('Aviso importante');
  });
});
