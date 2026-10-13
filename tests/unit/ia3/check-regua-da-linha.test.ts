import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type Tabelas } from '../../helpers/tabelas-em-memoria';

/**
 * O check de um cenário usa a régua DA LINHA (`alertas_check.versao_prompt`), nunca a da
 * empresa (plano de cenários de 11/10/2026, 0.2). Um cenário v1 já entregue não é rechecado
 * pela régua v2, que ele não conheceu: um recheck poderia tirá-lo do ar pelo corte de nota
 * mínima (Amazon: 80). Na v2 o auditor do A passa a ver a ficha do cargo e os outros
 * cenários do cargo (até 13/10/2026 via só o nome do cargo e 500 caracteres do PPP).
 */

let tabelas: Tabelas;
let sb: ReturnType<typeof bancoEmMemoria>;
const h = vi.hoisted(() => ({ chamadas: [] as Array<{ system: string; user: string }>, ficha: vi.fn() }));

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/ia2-gabarito', () => ({
  buscarContextoPPP: vi.fn(async () => ''), buscarValores: vi.fn(async () => []),
  carregarContextoIA2: vi.fn(), montarPromptIA2: vi.fn(), validarGabaritoIA2: vi.fn(),
  persistirGabaritoIA2: vi.fn(), gerarGabaritosIA2Core: vi.fn(),
}));
vi.mock('@/lib/matriz-por-cargo', async (orig) => ({
  ...(await orig<typeof import('@/lib/matriz-por-cargo')>()),
  buscarDescritoresDaCompetencia: vi.fn(async () => []),
}));
vi.mock('@/lib/cargo-contexto', async (orig) => ({
  ...(await orig<typeof import('@/lib/cargo-contexto')>()),
  carregarFichaParaCenario: (...a: any[]) => h.ficha(...a),
}));
vi.mock('@/lib/ai-tasks', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai-tasks')>()),
  getModelForTask: vi.fn(async () => 'gpt-5.6-terra'),
}));
vi.mock('@/actions/utils', () => ({ extractJSON: vi.fn(async (t: string) => JSON.parse(t)) }));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (system: string, user: string) => {
    h.chamadas.push({ system, user });
    return JSON.stringify({ nota: 84, justificativa: 'j', fatos_sem_fonte: ['sensor genérico'] });
  }),
}));

import { montarCheckIA3Prompt, checkCenarioIA3Core, buildCheckIA3SystemPrompt } from '@/lib/ia3-cenarios';
import { CONFERENCIA_FATOS_E_PAPEL_V2 } from '@/lib/ia3-cenarios-v2';

const FICHA = ['Cargo: Supervisor de Manutenção', 'Stakeholders: Supervisores, Gerência e fornecedores'];

function cenario(id: string, extra: Record<string, any> = {}) {
  return {
    id, empresa_id: 'emp', cargo: 'Infra e Mecânica', competencia_id: 'c-1', ppp_escola_id: null, tipo_cenario: null,
    titulo: `Título ${id}`, descricao: `Descrição ${id}`, alternativas: { perguntas: [{ numero: 1, texto: 'P1' }] },
    alertas_check: {}, created_at: '2026-10-01T10:00:00Z', ...extra,
  };
}

beforeEach(() => {
  h.chamadas = [];
  h.ficha.mockReset();
  h.ficha.mockResolvedValue({ linhas: FICHA, info: {} });
  tabelas = {
    // A empresa JÁ está na v2: mesmo assim a linha v1 é auditada na v1.
    empresas: [{ id: 'emp', nome: 'Empresa', segmento: null, sys_config: { cenarios_v2: true } }],
    competencias: [{ id: 'c-1', empresa_id: 'emp', nome: 'Foco no cliente', cod_comp: 'C1', cargo: 'Infra e Mecânica', descricao: null }],
    banco_cenarios: [
      cenario('v1'),
      cenario('v2', { alertas_check: { versao_prompt: 'ia3-p2' } }),
      cenario('irmao', { competencia_id: 'c-2', titulo: 'Festa de 40 pessoas', descricao: 'Sábado, 40 pessoas na pista 3.' }),
      cenario('mesma-comp', { titulo: 'Mesma competência' }),
      cenario('b-fech', { tipo_cenario: 'cenario_b', competencia_id: 'c-3', titulo: 'Cenário B' }),
    ],
  };
  sb = bancoEmMemoria(tabelas);
});

describe('montarCheckIA3Prompt: a régua da linha', () => {
  it('linha sem carimbo (v1): o auditor de sempre, sem ficha nem irmãos, mesmo com a empresa na v2', async () => {
    const r = await montarCheckIA3Prompt(sb.client, tabelas.banco_cenarios[0]);
    expect(r.versao).toBe('v1');
    expect(r.system).toBe(buildCheckIA3SystemPrompt());
    expect(r.user).not.toContain('FICHA DO CARGO');
    expect(r.user).not.toContain('OUTROS CENÁRIOS');
    expect(h.ficha).not.toHaveBeenCalled();
  });

  it('linha v2: conferência de fatos e papel, a ficha inteira e os outros cenários do cargo (sem ela mesma, sem a mesma competência, sem B)', async () => {
    const r = await montarCheckIA3Prompt(sb.client, tabelas.banco_cenarios[1]);
    expect(r.versao).toBe('v2');
    expect(r.system).toBe(buildCheckIA3SystemPrompt() + CONFERENCIA_FATOS_E_PAPEL_V2);
    for (const l of FICHA) expect(r.user).toContain(l);
    expect(h.ficha).toHaveBeenCalledWith(undefined, 'emp', 'Infra e Mecânica');
    expect(r.user).toContain('═══ OUTROS CENÁRIOS DO MESMO CARGO');
    expect(r.user).toContain('- Festa de 40 pessoas: Sábado, 40 pessoas na pista 3.');
    expect(r.user).not.toContain('Mesma competência');
    expect(r.user).not.toContain('Cenário B');
    expect(r.user).not.toContain('Título v2:');
  });

  it('a versão pedida vence o carimbo (a candidata em memória ainda não tem carimbo)', async () => {
    const r = await montarCheckIA3Prompt(sb.client, tabelas.banco_cenarios[0], { versao: 'v2' });
    expect(r.system).toContain('CONFERÊNCIA DE FATOS E DE PAPEL');
  });

  it('falha ao ler os outros cenários na v2: lança (o check não audita às cegas)', async () => {
    sb.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'timeout' });
    await expect(montarCheckIA3Prompt(sb.client, tabelas.banco_cenarios[1])).rejects.toThrow(/outros cenários do cargo: timeout/);
  });
});

describe('checkCenarioIA3Core: ponta a ponta', () => {
  it('linha v1 numa empresa v2: auditada e carimbada na v1, sem as listas da régua nova', async () => {
    const r = await checkCenarioIA3Core(sb.client, { cenarioId: 'v1' });
    expect(r).toMatchObject({ success: true, nota: 84 });
    expect(h.chamadas[0].system).not.toContain('CONFERÊNCIA DE FATOS');
    const linha = tabelas.banco_cenarios.find((c) => c.id === 'v1');
    expect(linha.alertas_check).toMatchObject({ versao_prompt: 'ia3-p1', versao_regua: 'ia3-r1' });
    expect(linha.alertas_check).not.toHaveProperty('fatos_sem_fonte');
  });

  it('linha v2: auditada na v2 e as listas vão para alertas_check (a Fase 1 mostra)', async () => {
    await checkCenarioIA3Core(sb.client, { cenarioId: 'v2' });
    expect(h.chamadas[0].system).toContain('CONFERÊNCIA DE FATOS');
    const linha = tabelas.banco_cenarios.find((c) => c.id === 'v2');
    expect(linha.alertas_check).toMatchObject({ versao_prompt: 'ia3-p2', versao_regua: 'ia3-r2', fatos_sem_fonte: ['sensor genérico'] });
  });
});
