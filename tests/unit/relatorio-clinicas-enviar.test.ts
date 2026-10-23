import { describe, expect, it, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Envio do relatório por clínica (pacote de clínicas). O que se guarda aqui:
 *  - só empresa com a chave `pacote_clinicas`, e nunca a de demonstração;
 *  - vai às contas de RH com e-mail REAL (o e-mail interno do login por WhatsApp fica fora);
 *  - sem RH, é falha visível (o relatório é o produto);
 *  - uma vez por dia por destinatário: o cron e o disparo sob demanda no mesmo dia não mandam em dobro;
 *  - a simulação monta o e-mail e não envia.
 */

let empresas: any[] = [];
let rh: any[] = [];
let entreguesHoje: any[] = [];

const banco = criarSupabaseMock({
  lista: (tabela: string) => {
    if (tabela === 'empresas') return empresas;
    if (tabela === 'colaboradores') return rh;
    if (tabela === 'notification_deliveries') return entreguesHoje;
    return [];
  },
});

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: (t: string) => banco.client.from(t), raw: banco.client }) }));
vi.mock('@/lib/relatorio-clinicas/coletar', () => ({
  coletarDadosRelatorioClinicas: async () => ({
    clinicas: [{ id: 'k1', nome: 'Clínica Sol' }],
    pessoas: [{ id: 'a', nome: 'Ana', cargo: 'Secretária', escolaId: 'k1', temPerfil: false }],
    competenciasPorCargo: new Map([['Secretária', [{ nome: 'Experiência e Continuidade', ids: ['c1'] }]]]),
    respostasPorPessoa: new Map(),
    inicioDaTurmaPorPessoa: new Map([['a', '2026-11-10']]),
    trilhaPorPessoa: new Map(),
  }),
}));

const { executarRelatorioClinicas, chaveDoEnvio } = await import('@/lib/relatorio-clinicas/enviar');

const ONLABEL = { id: 'emp-1', nome: 'onlabel', is_demo: false, sys_config: { pacote_clinicas: true } };
const AGORA = new Date('2026-11-04T10:00:00Z'); // 07h de Brasília

function enviarEmail() {
  const chamadas: Array<{ para: string; assunto: string; meta: any }> = [];
  const fn = async (para: string, assunto: string, _html: string, meta: any) => { chamadas.push({ para, assunto, meta }); return { ok: true }; };
  return { fn, chamadas };
}

beforeEach(() => {
  banco.reset();
  empresas = [ONLABEL];
  rh = [{ email: 'carla@onlabel.com.br' }];
  entreguesHoje = [];
});

describe('executarRelatorioClinicas', () => {
  it('envia ao RH da empresa com a chave, uma vez, com a chave de deduplicação do dia', async () => {
    const e = enviarEmail();
    const r = await executarRelatorioClinicas(banco.client, { agora: AGORA, enviarEmail: e.fn });
    expect(r.hoje).toBe('2026-11-04');
    expect(r.empresas[0].enviados).toEqual(['carla@onlabel.com.br']);
    expect(e.chamadas).toHaveLength(1);
    expect(e.chamadas[0].assunto).toBe('Relatório das clínicas · onlabel · 04/11');
    expect(e.chamadas[0].meta).toEqual({ kind: 'relatorio_clinicas', empresaId: 'emp-1', dedupeKey: chaveDoEnvio('emp-1', '2026-11-04', 'carla@onlabel.com.br') });
  });

  it('quem já recebeu hoje não recebe de novo (cron e disparo sob demanda no mesmo dia)', async () => {
    entreguesHoje = [{ dedupe_key: chaveDoEnvio('emp-1', '2026-11-04', 'carla@onlabel.com.br') }];
    const e = enviarEmail();
    const r = await executarRelatorioClinicas(banco.client, { agora: AGORA, enviarEmail: e.fn });
    expect(e.chamadas).toHaveLength(0);
    expect(r.empresas[0].jaRecebidosHoje).toEqual(['carla@onlabel.com.br']);
  });

  it('empresa sem a chave e empresa de demonstração não recebem nada', async () => {
    empresas = [
      { id: 'emp-2', nome: 'rede', is_demo: false, sys_config: {} },
      { id: 'emp-3', nome: 'demo', is_demo: true, sys_config: { pacote_clinicas: true } },
    ];
    const e = enviarEmail();
    const r = await executarRelatorioClinicas(banco.client, { agora: AGORA, enviarEmail: e.fn });
    expect(r.empresas).toEqual([]);
    expect(e.chamadas).toHaveLength(0);
  });

  it('sem conta de RH com e-mail real, é falha visível (o e-mail interno do login por WhatsApp não conta)', async () => {
    rh = [{ email: 'wa.emp-1.5511999990000@nao-email.vertho.ai' }, { email: '' }];
    const e = enviarEmail();
    const r = await executarRelatorioClinicas(banco.client, { agora: AGORA, enviarEmail: e.fn });
    expect(r.empresas[0].destinatarios).toEqual([]);
    expect(r.empresas[0].erro).toMatch(/nenhuma conta de RH/);
    expect(e.chamadas).toHaveLength(0);
  });

  it('a simulação monta o e-mail e não envia', async () => {
    const e = enviarEmail();
    const r = await executarRelatorioClinicas(banco.client, { agora: AGORA, enviar: false, enviarEmail: e.fn });
    expect(e.chamadas).toHaveLength(0);
    expect(r.empresas[0].html).toContain('Clínica Sol');
    expect(r.empresas[0].html).toContain('Prazo: 09/11');
    expect(r.empresas[0].destinatarios).toEqual(['carla@onlabel.com.br']);
  });
});
