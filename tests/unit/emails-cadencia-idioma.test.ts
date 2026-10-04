import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Onda D, d-mail (04/10/2026): o e-mail da cadência sai no idioma do DESTINATÁRIO.
 *
 * O cron diário é exercitado de verdade (os canais são stubs): o idioma sai de
 * `colaboradores.locale`, senão de `empresas.default_locale`, senão pt-BR, e cada um
 * dos cinco pontos que mandam e-mail (pílula, conteúdo pendente, semana pendente,
 * desafio de aplicação, avaliação final e evidência) entrega o texto no idioma certo.
 * Os builders em si (4 idiomas, escape, byte a byte do pt-BR) estão em
 * `tests/unit/emails-4-idiomas.test.ts`.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  templates: {} as Record<string, string | null>,
  envioTemplate: vi.fn(),
  envioPilula: vi.fn(),
  email: vi.fn(),
  push: vi.fn(),
  fila: vi.fn(),
  degradacao: vi.fn(),
}));

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ ...h.sb.client, raw: h.sb.client }) }));
vi.mock('@/lib/degradacao', () => ({ registrarDegradacao: h.degradacao, DEGRADACAO: new Proxy({}, { get: (_t, p) => String(p) }) }));
vi.mock('@/lib/whatsapp', () => ({ assertFilaDoProvedorLimpa: vi.fn(async () => {}) }));
vi.mock('@/lib/qstash-publish', () => ({ publicarWhatsappCis: h.fila }));
vi.mock('@/lib/notifications/push-core', () => ({ enviarPush: h.push }));
vi.mock('@/lib/season-engine/formato-anunciado', () => ({
  formatosEntregaveis: async () => ['texto'],
  escolherFormatoAnunciado: () => 'texto',
}));
vi.mock('@/lib/notifications/pilula-template', () => ({
  templateAtivo: (papel: string) => h.templates[papel] ?? null,
  enviarPorTemplate: h.envioTemplate,
  enviarPilulaPorTemplate: h.envioPilula,
}));
vi.mock('@/lib/notifications/pilula-envio', async (orig) => ({
  ...(await orig<any>()),
  enviarEmailPilula: h.email,
}));

import { processarEmpresaDiario } from '@/lib/fase4/trigger-diario-empresa';
import { ROTULO_PRIVACIDADE } from '@/lib/notifications/rodape-privacidade';

// Novembro de 2026, numa semana sem feriado nacional.
const SEGUNDA = { hoje: 1, hojeUTC: '2026-11-09', agora: '2026-11-09T12:00:00Z' };
const TERCA = { hoje: 2, hojeUTC: '2026-11-10', agora: '2026-11-10T12:00:00Z' };
const QUINTA = { hoje: 4, hojeUTC: '2026-11-12', agora: '2026-11-12T12:00:00Z' };

const EMPRESA = { id: 'emp-1', slug: 'escola', is_demo: false, sys_config: {} };

const conteudo = (semana: number) => ({
  semana, tipo: 'conteudo', descritor: `D${semana}`,
  conteudos_dia: [{ descritor: `D${semana}`, conteudo: { titulo: `Tema ${semana}` } }, { descritor: `D${semana}b`, conteudo: { titulo: `Tema ${semana}b` } }],
});
const PLANO_JORNADA = [1, 2, 3, 4, 5, 6].map(conteudo).concat([{ semana: 7, tipo: 'avaliacao' } as any]);
const PLANO_COM_DESAFIO = [1, 2, 3].map(conteudo).concat([{ semana: 4, tipo: 'aplicacao' } as any]);

interface Cenario {
  semanaAtual: number;
  dataInicio: string;
  concluidas: number[];
  plano?: any[];
  /** O `colaboradores.locale` da pessoa (`null`/`undefined`: sem idioma próprio). */
  locale?: string | null;
  /** O `empresas.default_locale` (`null`/`undefined`: coluna vazia). */
  empresaLocale?: string | null;
  nome?: string | null;
}

function cron(c: Cenario) {
  h.sb = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? { default_locale: c.empresaLocale ?? null } : null),
    lista: (tabela) => {
      if (tabela === 'fase4_envios') {
        const colab: any = {
          nome_completo: c.nome === undefined ? 'Maria Souza' : c.nome,
          whatsapp: '+5571999990000', email: 'maria@x.br', perfil_dominante: 'S', cargo: 'Professora',
        };
        return [{ id: 'env-1', colaborador_id: 'c1', semana_atual: c.semanaAtual, status: 'ativo', colaboradores: colab }];
      }
      // A leitura do idioma pede só quem tem `locale` próprio (`.not('locale', 'is', null)`).
      if (tabela === 'colaboradores') return c.locale ? [{ id: 'c1', locale: c.locale }] : [];
      if (tabela === 'trilhas') {
        return [{ id: 't1', colaborador_id: 'c1', numero_temporada: 1, temporada_plano: c.plano ?? PLANO_JORNADA, competencia_foco: 'Planejamento', data_inicio: c.dataInicio }];
      }
      if (tabela === 'temporada_semana_progresso') {
        return c.concluidas.map((s) => ({ trilha_id: 't1', colaborador_id: 'c1', semana: s, status: 'concluido' }));
      }
      return [];
    },
  });
}

const emailEnviado = () => {
  expect(h.email).toHaveBeenCalledTimes(1);
  const [para, subject, html, meta] = h.email.mock.calls[0];
  return { para, subject: subject as string, html: html as string, meta };
};

describe('cadência: o idioma do e-mail é o do destinatário', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    h.templates = {};
    for (const f of [h.envioTemplate, h.envioPilula, h.email, h.push, h.fila, h.degradacao]) f.mockReset();
    h.envioTemplate.mockResolvedValue({ tentou: true, ok: true });
    h.envioPilula.mockResolvedValue({ tentou: true, ok: true });
    h.email.mockResolvedValue({ ok: true });
    h.push.mockResolvedValue({ entregues: 0, falhas: 0 });
  });
  afterEach(() => { vi.useRealTimers(); });

  // Trilha de 19/10: a segunda 09/11 é a semana 4 e as semanas 1 a 3 estão concluídas.
  const NA_SEMANA_4 = { semanaAtual: 4, dataInicio: '2026-10-19', concluidas: [1, 2, 3] };

  it('🔴 pessoa en-US numa empresa pt-BR: a pílula de segunda sai em inglês, com o rodapé em inglês', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron({ ...NA_SEMANA_4, locale: 'en-US', empresaLocale: 'pt-BR' });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    const e = emailEnviado();
    expect(e.subject).toBe('Your week 4 content: D4');
    expect(e.html).toContain('Hi, Maria!');
    expect(e.html).toContain('Your <strong>week 4 content</strong> is now available.');
    expect(e.html).toContain(`>${ROTULO_PRIVACIDADE['en-US']}</a>`);
    expect(e.meta).toMatchObject({ kind: 'pilula', empresaId: 'emp-1', colaboradorId: 'c1' });
  });

  it('o WhatsApp e o push NÃO mudam (fora da onda): a mensagem do template não recebe o idioma', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron({ ...NA_SEMANA_4, locale: 'en-US', empresaLocale: 'pt-BR' });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(h.envioPilula).toHaveBeenCalledTimes(1);
    const dadosDoTemplate = h.envioPilula.mock.calls[0][0];
    expect(dadosDoTemplate).toMatchObject({ semana: 4, nome: 'Maria Souza' });
    expect(JSON.stringify(dadosDoTemplate)).not.toMatch(/en-US|locale/);
  });

  // pessoa, empresa → o que sai
  it.each([
    ['en-US', 'pt-BR', 'Your week 4 content: D4', 'a pessoa vence a empresa'],
    ['pt-PT', 'en-US', 'O seu conteúdo da semana 4: D4', 'a pessoa vence a empresa (pt-PT)'],
    [null, 'es-ES', 'Tu contenido de la semana 4: D4', 'sem idioma na pessoa, o da empresa'],
    ['klingon', 'es-ES', 'Tu contenido de la semana 4: D4', 'idioma inválido na pessoa, o da empresa'],
    [null, null, 'Seu conteúdo da semana 4: D4', 'sem idioma em nenhum, pt-BR'],
    [undefined, undefined, 'Seu conteúdo da semana 4: D4', 'nada cadastrado: pt-BR, como antes da onda'],
  ])('pessoa %s, empresa %s: assunto "%s" (%s)', async (pessoa, da_empresa, assunto) => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron({ ...NA_SEMANA_4, locale: pessoa as any, empresaLocale: da_empresa as any });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(emailEnviado().subject).toBe(assunto);
  });

  it('semana da avaliação final: a abertura (segunda) e a cobrança (quinta) saem em inglês', async () => {
    const INICIO_SEMANA_7 = '2026-09-28';
    const dados = { semanaAtual: 7, dataInicio: INICIO_SEMANA_7, concluidas: [1, 2, 3, 4, 5, 6], locale: 'en-US' };
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron(dados);
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    let e = emailEnviado();
    expect(e.subject).toBe('Your final assessment is open');
    expect(e.html).toContain('<strong>final assessment</strong> is now open.');
    expect(e.html).toContain('The Evolution Report is generated once the final assessment is completed.');
    expect(e.meta).toMatchObject({ kind: 'avaliacao_final' });

    h.email.mockClear();
    vi.setSystemTime(new Date(QUINTA.agora));
    cron(dados);
    await processarEmpresaDiario(EMPRESA, QUINTA);
    e = emailEnviado();
    expect(e.subject).toBe('Final assessment pending');
    expect(e.html).toContain('is still <strong>pending</strong>');
  });

  it('quinta: a cobrança das evidências sai em espanhol quando a empresa é es-ES', async () => {
    vi.setSystemTime(new Date(QUINTA.agora));
    cron({ ...NA_SEMANA_4, locale: null, empresaLocale: 'es-ES' });
    await processarEmpresaDiario(EMPRESA, QUINTA);
    const e = emailEnviado();
    expect(e.subject).toBe('Evidencias de la semana 4: pendiente');
    expect(e.html).toContain('Estás en la <strong>semana 4</strong> de tu recorrido.');
    expect(e.html).toContain(`>${ROTULO_PRIVACIDADE['es-ES']}</a>`);
    expect(e.meta).toMatchObject({ kind: 'evidencia' });
  });

  it('semana de aplicação: o desafio sai em pt-PT, com o vídeo explicativo e o alt no idioma', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron({ ...NA_SEMANA_4, plano: PLANO_COM_DESAFIO, locale: 'pt-PT' });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    const e = emailEnviado();
    expect(e.subject).toBe('Semana 4: o seu desafio de aplicação');
    expect(e.html).toContain('Equipa Vertho');
    expect(e.html).toContain('Ver o meu desafio');
    expect(e.meta).toMatchObject({ kind: 'missao' });
  });

  it('conteúdo pendente (segunda, travado na semana 1): em inglês', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    h.templates = { conteudo_pendente: 'conteudo_semana_pendente' };
    // Trilha de 12/10: a segunda 09/11 é a semana 5, mas nada foi concluído: a pessoa só abre a 1.
    cron({ semanaAtual: 5, dataInicio: '2026-10-12', concluidas: [], locale: 'en-US' });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    const e = emailEnviado();
    expect(e.subject).toBe('Week 1: D1 (pending)');
    expect(e.html).toContain('it is only completed in the <strong>evidence conversation</strong>');
    expect(e.meta).toMatchObject({ kind: 'pilula' });
  });

  it('semana pendente (terça, travado na semana 1): em espanhol, com a semana do relógio e a pendente', async () => {
    vi.setSystemTime(new Date(TERCA.agora));
    h.templates = { pendencia: 'semana_pendente_v2' };
    cron({ semanaAtual: 5, dataInicio: '2026-10-12', concluidas: [], locale: 'es-ES' });
    await processarEmpresaDiario(EMPRESA, TERCA);
    const e = emailEnviado();
    expect(e.subject).toBe('Semana 1: pendiente en tu recorrido');
    expect(e.html).toContain('Tu recorrido está en la <strong>semana 5</strong>, y la <strong>semana 1</strong> sigue pendiente.');
    expect(e.meta).toMatchObject({ kind: 'pendencia' });
  });

  it('cadastro sem nome: o e-mail usa o nome padrão do idioma ("Employee"), e o WhatsApp segue com o de sempre', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron({ ...NA_SEMANA_4, locale: 'en-US', nome: null });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(emailEnviado().html).toContain('Hi, Employee!');
    expect(h.envioPilula.mock.calls[0][0]).toMatchObject({ nome: 'Colaborador' });
  });

  it('a leitura do idioma falha: o e-mail SAI no padrão (pt-BR), a falha fica registrada e a empresa não cai', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron({ ...NA_SEMANA_4, locale: 'en-US', empresaLocale: 'es-ES' });
    h.sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    // a leitura da EMPRESA deu certo: o e-mail cai no idioma dela, não no da pessoa que não se leu
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(emailEnviado().subject).toBe('Tu contenido de la semana 4: D4');
    expect(h.degradacao).toHaveBeenCalledTimes(1);
    expect(h.degradacao.mock.calls[0][0]).toMatchObject({
      fluxo: 'envio', tipo: 'IDIOMA_DO_EMAIL_INDISPONIVEL', chave: 'idioma:emp-1', empresaId: 'emp-1', severidade: 'aviso',
    });
    expect(h.degradacao.mock.calls[0][0].detalhe.motivo).toContain('timeout no pool');
  });

  it('as duas leituras falham: pt-BR, que é o que saía antes, e uma única degradação', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron({ ...NA_SEMANA_4, locale: 'en-US', empresaLocale: 'es-ES' });
    h.sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    h.sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(emailEnviado().subject).toBe('Seu conteúdo da semana 4: D4');
    expect(h.degradacao).toHaveBeenCalledTimes(1);
  });

  it('leitura sem falha não registra degradação', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron({ ...NA_SEMANA_4, locale: 'en-US' });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(h.degradacao).not.toHaveBeenCalled();
  });

  it('o idioma é lido UMA vez por empresa (não por pessoa) e só de quem tem idioma próprio', async () => {
    vi.setSystemTime(new Date(SEGUNDA.agora));
    cron({ ...NA_SEMANA_4, locale: 'en-US' });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    const leituras = h.sb.chamadas.filter((c: any) => c.tabela === 'colaboradores' && c.metodo === 'select');
    expect(leituras).toHaveLength(1);
    expect(leituras[0].args[0]).toBe('id, locale');
    expect(h.sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    expect(h.sb.usou('colaboradores', 'not', 'locale')).toBe(true);
  });
});
