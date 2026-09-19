import { describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

/**
 * Acompanhamento do Simulador de liderança (decisão do dono, 18/09/2026): RH e
 * gestor veem quem faz e os resultados, pela régua da jornada. Aqui se prova
 * quem vê quem e que o detalhe não carrega a conversa, a preparação nem a
 * reflexão da pessoa (só a devolutiva, com seus trechos de evidência).
 */
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
const modulo = { ligado: true };
vi.mock('@/lib/prontidao-lideranca/habilitado', () => ({
  prontidaoLiderancaHabilitada: vi.fn(async () => modulo.ligado),
}));

import { contextoEquipe, detalhePessoa, painelEquipe } from '@/lib/simulador-lideranca/equipe';
import { gravarAvaliacao, linhasDoEncontro } from '@/lib/simulador-lideranca/avaliacao';
import { estado, episodio, avaliacao, FALA } from '../fixtures/simulador-lideranca';

const EMP = '10000000-0000-4000-8000-000000000001';
const colabs = [
  { id: 'ana', nome_completo: 'Ana', cargo: 'Analista', email: 'ana@x.test', role: 'colaborador', gestor_email: 'gestor@x.test' },
  { id: 'bia', nome_completo: 'Bia', cargo: 'Analista', email: 'bia@x.test', role: 'colaborador', gestor_email: 'outra@x.test' },
  { id: 'rh', nome_completo: 'RH', cargo: 'RH', email: 'rh@x.test', role: 'rh', gestor_email: null },
];
const matriz = estado().matriz;
const concluido = {
  ...episodio(0),
  encerradoEm: '2026-09-18T12:00:00Z',
  reflexao: 'Minha reflexão particular sobre como conduzi a conversa.',
  avaliacao: gravarAvaliacao(avaliacao(), episodio(0), linhasDoEncontro(matriz, 0)),
  consequencia: {
    narrativa: 'A equipe combinou revisar os pedidos.',
    acordos: [{ descricao: 'Revisar os pedidos amanhã.', turno: 1, trecho: FALA }],
    pendencias: [],
  },
};

let regras: Record<string, unknown> | undefined;
function banco() {
  return criarSupabaseMock({
    resolver: (tabela, _cols, cadeia) => {
      if (tabela === 'empresas')
        return {
          id: EMP, nome: 'Fictícia',
          sys_config: { prontidao_lideranca: { cargo_alvo: 'Gerente' }, ...(regras ? { simuladores_por_cargo: regras } : {}) },
        };
      if (tabela === 'sim_lideranca_jornadas') {
        const id = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'colaborador_id')?.args[1];
        return id === 'ana'
          ? { id: 'j-ana', updated_at: '2026-09-18T12:00:00Z', estado: { ...estado(), concluidos: [concluido] } }
          : null;
      }
      return null;
    },
    lista: (tabela, cols) => {
      if (tabela === 'colaboradores' && cols.includes('nome_completo')) return colabs;
      if (tabela === 'colaboradores') return colabs.map((c) => ({ id: c.id, gestor_email: c.gestor_email }));
      if (tabela === 'cargos_empresa') return [{ id: 'c1', nome: 'Analista' }, { id: 'c2', nome: 'Gerente' }];
      if (tabela === 'sim_lideranca_jornadas')
        return [{ id: 'j-ana', colaborador_id: 'ana', updated_at: '2026-09-18T12:00:00Z', concluidos: [concluido], ativoIndice: '1', cargoMatriz: 'Líder' }];
      return [];
    },
  });
}
const auth = (role: string, email = 'gestor@x.test') =>
  ({ role, email, isPlatformAdmin: false, empresaId: EMP, colaborador: { id: 'eu', empresa_id: EMP, email } }) as any;

describe('acompanhamento do simulador de liderança', () => {
  it('gestor vê só os liderados; RH vê a população do programa (sem o próprio RH)', async () => {
    sb = banco();
    const g = await painelEquipe(await contextoEquipe(auth('gestor')));
    expect(g.pessoas.map((p) => p.nome)).toEqual(['Ana']);
    expect(g.pessoas[0]).toMatchObject({ encontrosConcluidos: 1, emAndamento: 1, variante: 'lider' });
    expect(g.pessoas[0].sintese?.encontrosConcluidos).toBe(1);
    const r = await painelEquipe(await contextoEquipe(auth('rh', 'rh@x.test')));
    expect(r.pessoas.map((p) => p.nome)).toEqual(['Ana', 'Bia']);
    expect(r).toMatchObject({ populacao: 2, iniciaram: 1, concluiram: 0 });
    // Todas as leituras de tenant vão escopadas pela empresa.
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('sim_lideranca_jornadas', 'eq', 'empresa_id')).toBe(true);
  });

  it('quem não acompanha é recusado, e o módulo desligado também', async () => {
    sb = banco();
    await expect(contextoEquipe(auth('colaborador'))).rejects.toMatchObject({ status: 403 });
    modulo.ligado = false;
    await expect(contextoEquipe(auth('rh', 'rh@x.test'))).rejects.toMatchObject({ status: 403 });
    modulo.ligado = true;
  });

  it('o detalhe entrega a devolutiva, nunca a conversa, a preparação ou a reflexão', async () => {
    sb = banco();
    const d = await detalhePessoa(await contextoEquipe(auth('gestor')), 'ana');
    expect(d.encontros).toHaveLength(1);
    const e = d.encontros[0] as Record<string, unknown>;
    for (const campo of ['mensagens', 'plano', 'reflexao', 'antecedentes', 'contexto']) expect(e).not.toHaveProperty(campo);
    expect(JSON.stringify(d)).not.toContain('Minha reflexão particular');
    expect(d.encontros[0].consequencia?.acordos).toEqual(['Revisar os pedidos amanhã.']);
    expect(d.matriz[0]).not.toHaveProperty('perguntas_alvo');
  });

  it('gestor não abre quem está fora da equipe dele', async () => {
    sb = banco();
    await expect(detalhePessoa(await contextoEquipe(auth('gestor')), 'bia')).rejects.toMatchObject({ status: 404 });
  });

  it('falha de leitura vira erro, nunca "equipe vazia"', async () => {
    sb = banco();
    sb.falharEm({ tabela: 'sim_lideranca_jornadas', op: 'select', mensagem: 'timeout no pool' });
    await expect(painelEquipe(await contextoEquipe(auth('rh', 'rh@x.test')))).rejects.toMatchObject({ status: 503 });
  });

  it('cargo grafado de outro jeito segue a regra do cargo na população (19/09/2026)', async () => {
    // Analista fora do simulador; Bia está cadastrada com o cargo em outra caixa e espaçamento.
    regras = { c1: { vendas: true, atendimento: true, lideranca: false } };
    const bia = colabs.find((p) => p.id === 'bia')!;
    bia.cargo = '  ANALISTA ';
    try {
      sb = banco();
      const r = await painelEquipe(await contextoEquipe(auth('rh', 'rh@x.test')));
      expect(r.pessoas).toEqual([]);
      expect(r.populacao).toBe(0);
    } finally {
      bia.cargo = 'Analista';
      regras = undefined;
    }
  });
});
