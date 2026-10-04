import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-139 (04/10/2026): falha de LEITURA que virava estado vazio.
 *
 *  1. O painel do gestor devolvia lista vazia quando a consulta de liderados falhava, e o
 *     gestor lia "você não tem liderados". O mesmo valia para as trilhas ("todos sem
 *     trilha") e para os checkpoints ("nenhum pendente").
 *  2. A Evolução da equipe nem checava o erro da consulta: "nenhuma jornada encerrada".
 *  3. O acesso aos simuladores tratava erro de banco como "sem acesso", sem registro: o
 *     item sumia do menu e a página mandava a pessoa de volta ao início.
 *
 * Agora a tela diz "indisponível" com "tentar de novo", e a falha vai para o
 * `degradacao_log`.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  ctx: null as any,
  degradacao: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: (t: string) => h.sb.client.from(t), raw: h.sb.client }) }));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => h.ctx,
  mesmoEmail: (a: string, b: string) => String(a || '').toLowerCase().trim() === String(b || '').toLowerCase().trim(),
  canViewColabJourney: () => true,
  findColabByEmail: async () => null,
}));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: async () => 'rh@x.com' }));
vi.mock('@/lib/degradacao', async (orig) => ({ ...(await orig<any>()), registrarDegradacao: h.degradacao }));
vi.mock('@/lib/demo/envio-guard', () => ({ isTenantDemo: async () => false }));
vi.mock('@/actions/temporada-concluida', () => ({ loadTemporadaConcluida: vi.fn() }));

import { resolverEscopoDoGestor, getGestorHomeData, getEngajamentoDoTime } from '@/app/dashboard/gestor/actions';
import { listarEquipeEvolucao, listarCheckpointsPendentes } from '@/app/dashboard/gestor/equipe-evolucao/actions';
import { acessoSimuladoresDoColaborador } from '@/lib/simuladores/acesso';
import { SEM_ACESSO, ACESSO_ATUAL } from '@/lib/simuladores/acesso-cargo';
import LeituraIndisponivel from '@/components/gestor/leitura-indisponivel';

const GESTOR = { id: 'g1', email: 'gestor@x.com', empresa_id: 'emp-1' };
const LIDERADOS = [
  { id: 'l1', nome_completo: 'Ana', cargo: 'Professora', email: 'ana@x.com', perfil_dominante: 'S', gestor_email: 'gestor@x.com', role: 'colaborador' },
  { id: 'l2', nome_completo: 'Bia', cargo: 'Professora', email: 'bia@x.com', perfil_dominante: 'D', gestor_email: 'gestor@x.com', role: 'colaborador' },
];

const registros = () => h.degradacao.mock.calls.map((c: any[]) => c[0]);

beforeEach(() => {
  h.degradacao.mockReset();
  h.ctx = { colaborador: GESTOR, role: 'gestor', empresaId: 'emp-1', isPlatformAdmin: false };
  h.sb = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? { sys_config: {} } : null),
    lista: (tabela) => {
      if (tabela === 'colaboradores') return LIDERADOS;
      if (tabela === 'trilhas') return [{ id: 't1', colaborador_id: 'l1', numero_temporada: 1, status: 'ativa', criado_em: '2026-09-01', data_inicio: '2026-09-01', programa_modo: 'jornada' }];
      return [];
    },
  });
});

describe('painel do gestor: a leitura que falhou não é "sem liderados"', () => {
  it('🔴 o escopo que não leu devolve `indisponivel` e REGISTRA, em vez de uma lista vazia calada', async () => {
    h.sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    const r = await resolverEscopoDoGestor(h.sb.client, { empresaId: 'emp-1', meuId: 'g1', meuEmail: 'gestor@x.com', isGestor: true });
    expect(r).toMatchObject({ liderados: [], liderIds: [], indisponivel: true });
    expect(registros()[0]).toMatchObject({ fluxo: 'leitura', tipo: 'leitura-indisponivel', chave: 'escopo-do-gestor:emp-1', empresaId: 'emp-1', severidade: 'aviso' });
    expect(registros()[0].detalhe.motivo).toContain('timeout no pool');
  });

  it('o escopo que leu bem não traz a marca', async () => {
    const r = await resolverEscopoDoGestor(h.sb.client, { empresaId: 'emp-1', meuId: 'g1', meuEmail: 'gestor@x.com', isGestor: true });
    expect(r.indisponivel).toBeUndefined();
    expect(r.liderIds).toEqual(['l1', 'l2']);
    expect(registros()).toHaveLength(0);
  });

  it('🔴 a home do gestor responde `indisponivel`, não "ok com zero liderados"', async () => {
    h.sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await getGestorHomeData();
    expect(r.ok).toBe(false);
    expect(r.indisponivel).toBe(true);
    expect(r.kpis).toBeUndefined();
  });

  it('🔴 trilhas que não leram: a home não rotula todo mundo como SEM TRILHA', async () => {
    h.sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await getGestorHomeData();
    expect(r).toMatchObject({ ok: false, indisponivel: true });
    expect(registros().some((x: any) => x.chave === 'home-gestor-trilhas:emp-1')).toBe(true);
  });

  it('🔴 checkpoints que não leram: a home não diz "nenhum pendente"', async () => {
    h.sb.falharEm({ tabela: 'checkpoints_gestor', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await getGestorHomeData();
    expect(r).toMatchObject({ ok: false, indisponivel: true });
    expect(registros().some((x: any) => x.chave === 'home-gestor-checkpoints:emp-1')).toBe(true);
  });

  it('com tudo lendo, a home responde normalmente', async () => {
    const r: any = await getGestorHomeData();
    expect(r.ok).toBe(true);
    expect(r.kpis.liderados.total).toBe(2);
  });

  it('o engajamento do time do gestor também responde `indisponivel` (o RH, que não depende do escopo, não)', async () => {
    h.sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await getEngajamentoDoTime(null, null);
    expect(r).toMatchObject({ ok: false, indisponivel: true });
  });
});

describe('Evolução da equipe: a leitura que falhou não é "nenhuma jornada encerrada"', () => {
  it('🔴 pessoas que não leram: `indisponivel`, registrado', async () => {
    h.sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await listarEquipeEvolucao();
    expect(r).toMatchObject({ indisponivel: true });
    expect(r.rows).toBeUndefined();
    expect(registros()[0]).toMatchObject({ chave: 'evolucao-da-equipe-pessoas:emp-1' });
  });

  it('🔴 trilhas que não leram: não vira "todos sem trilha"', async () => {
    h.sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await listarEquipeEvolucao();
    expect(r).toMatchObject({ indisponivel: true });
    expect(registros()[0]).toMatchObject({ chave: 'evolucao-da-equipe-trilhas:emp-1' });
  });

  it('lendo bem, devolve as linhas', async () => {
    const r: any = await listarEquipeEvolucao();
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(2);
  });

  it('os checkpoints: pessoas ou registros que não leram também são `indisponivel`', async () => {
    h.sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    expect(await listarCheckpointsPendentes()).toMatchObject({ ok: false, indisponivel: true, rows: [] });

    h.sb.reset();
    h.sb.falharEm({ tabela: 'checkpoints_gestor', op: 'select', mensagem: 'timeout no pool' });
    expect(await listarCheckpointsPendentes()).toMatchObject({ ok: false, indisponivel: true, rows: [] });
  });
});

describe('acesso aos simuladores: erro de banco não é "sem acesso"', () => {
  const colab = { empresa_id: 'emp-1', cargo: 'Professora' };

  it('🔴 a configuração da empresa que não leu: continua FECHADO (nunca abre por falha), mas com a marca e o registro', async () => {
    h.sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' });
    const r = await acessoSimuladoresDoColaborador(colab);
    expect(r).toMatchObject({ ...SEM_ACESSO, indisponivel: true });
    expect(registros()[0]).toMatchObject({ fluxo: 'leitura', tipo: 'leitura-indisponivel', chave: 'acesso-simuladores:emp-1' });
    expect(registros()[0].detalhe.onde).toBe('configuração da empresa');
  });

  it('🔴 os cargos que não leram: também indisponível', async () => {
    h.sb = criarSupabaseMock({ resolver: (t) => (t === 'empresas' ? { sys_config: { simuladores_por_cargo: {} } } : null) });
    h.sb.falharEm({ tabela: 'cargos_empresa', op: 'select', mensagem: 'timeout no pool' });
    const r = await acessoSimuladoresDoColaborador(colab);
    expect(r.indisponivel).toBe(true);
    expect(registros()[0].detalhe.onde).toBe('cargos da empresa');
  });

  it('empresa que não existe é "sem acesso" de verdade, sem marca de falha e sem registro', async () => {
    h.sb = criarSupabaseMock({ resolver: () => null });
    const r = await acessoSimuladoresDoColaborador(colab);
    expect(r).toEqual({ ...SEM_ACESSO });
    expect(registros()).toHaveLength(0);
  });

  it('lendo bem, sem regra por cargo: o acesso atual, sem marca', async () => {
    const r = await acessoSimuladoresDoColaborador(colab);
    expect(r).toEqual({ ...ACESSO_ATUAL });
  });

  it('pessoa sem empresa: sem acesso, sem consulta', async () => {
    expect(await acessoSimuladoresDoColaborador({ empresa_id: null })).toEqual({ ...SEM_ACESSO });
    expect(await acessoSimuladoresDoColaborador(null)).toEqual({ ...SEM_ACESSO });
  });
});

describe('quem consome a marca', () => {
  const fonte = (rel: string) => readFileSync(rel, 'utf-8');

  it('🔴 os gates dos três simuladores respondem 503 (e não 403 "não liberado") quando a leitura falhou', () => {
    expect(fonte('lib/simulador-vendas/access.ts')).toMatch(/acesso\.indisponivel\) throw new SimuladorError\(503/);
    expect(fonte('lib/recepcao/access.ts')).toMatch(/acesso\.indisponivel\) throw new RecepcaoError\(503/);
    expect(fonte('lib/simulador-lideranca/access.ts')).toMatch(/acesso\.indisponivel\)\s*\n\s*throw new LiderancaError\(\s*\n\s*503/);
    // A página não manda a pessoa de volta ao início como se ela não tivesse acesso.
    expect(fonte('lib/simuladores/pagina.ts')).toMatch(/if \(acesso\.indisponivel\) throw new Error\(/);
  });

  it('o menu (`/api/me`) não esconde o item por falha de leitura: o gate refaz a pergunta', () => {
    const me = fonte('app/api/me/route.ts');
    expect(me).toContain('acessoLido.indisponivel ? ACESSO_ATUAL : acessoLido');
  });

  it('a plenária devolve 503 (e não 403) para leitura que falhou', () => {
    expect(fonte('app/api/gestor/plenaria/pdf/route.ts')).toContain('(r as any).indisponivel ? 503 : 403');
  });
});

describe('LeituraIndisponivel: o que a tela mostra', () => {
  const t = (loc: string) => {
    const m = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf-8'));
    return createTranslator({ locale: loc, messages: m, namespace: 'ManagerDashboard' }) as any;
  };

  it('🔴 diz que NÃO sabe (e que não é equipe vazia) e oferece tentar de novo, nos 4 idiomas', () => {
    for (const loc of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const html = renderToStaticMarkup(createElement(LeituraIndisponivel, { onRetry: () => {}, t: t(loc) }));
      expect(html, loc).toContain('role="alert"');
      expect(html, loc).toContain('<button');
      const m = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf-8')).ManagerDashboard;
      expect(html, loc).toContain(m.retry);
      expect(m.unavailable, loc).not.toMatch(/[\u2013\u2014]/);
    }
    expect(renderToStaticMarkup(createElement(LeituraIndisponivel, { onRetry: () => {}, t: t('pt-BR') })))
      .toContain('Isso não quer dizer que não haja pessoas na equipe');
  });

  it('as três telas usam o componente', () => {
    expect(readFileSync('app/dashboard/gestor/page.tsx', 'utf-8')).toContain('<LeituraIndisponivel onRetry={carregar}');
    expect(readFileSync('app/dashboard/gestor/engajamento/team-engagement.tsx', 'utf-8')).toContain('<LeituraIndisponivel');
    expect(readFileSync('app/dashboard/gestor/equipe-evolucao/page.tsx', 'utf-8')).toContain('<LeituraIndisponivel');
  });
});
