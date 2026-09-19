import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

let sb: SupabaseMock;
const mock = vi.hoisted(() => ({ auth: null as any, permitido: true, callAI: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: async () => mock.permitido }));
vi.mock('@/lib/auth/request-context', () => ({ requireUser: async () => mock.auth }));
vi.mock('@/lib/simuladores/acesso', () => ({
  acessoSimuladoresDoColaborador: async () => ({ vendas: true, atendimento: true, lideranca: true }),
}));
vi.mock('@/actions/ai-client', () => ({ callAI: mock.callAI }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'modelo-de-teste' }));
import { contextoRecepcao } from '@/lib/recepcao/access';
import { catalogo, editarCenario } from '@/lib/recepcao/cenarios';
import { casoEmBranco, LIMITES_PADRAO } from '@/lib/recepcao/caso-em-branco';
import { gerarRascunho, promptRascunho } from '@/lib/recepcao/rascunho';
import { cenarioSchema } from '@/lib/recepcao/schema';
import { DOMINIOS, dominioAtendimento } from '@/lib/recepcao/dominio';

/**
 * Segmento por empresa (mig 263, decisão do dono de 18/09/2026): a empresa vê
 * só os casos do segmento dela, cria casos nele e ganha um ponto de partida
 * (caso em branco ou rascunho por IA) quando o segmento ainda não tem casos.
 */
const EMPRESA = '10000000-0000-4000-8000-000000000001';
const colaborador = { email: 'ana@cliente.test', empresaId: EMPRESA, isPlatformAdmin: false, role: 'colaborador', colaborador: { id: 'ana', empresa_id: EMPRESA } };
const req = new Request('http://localhost/api/recepcao');
const ctx = (dominio: string) =>
  ({ auth: colaborador, empresaId: EMPRESA, empresaNome: 'Loja Fictícia', habilitado: true, soAcompanha: false, sb: sb.client, owner: colaborador.email, ownerKey: 'colab:ana', dominio }) as any;
const MEDICO = /\bpacientes?\b|secretária|\bcl[ií]nic|\bm[eé]dic|\bsintoma|\bconsulta/i;

function banco(config: Record<string, unknown> | null, cenario?: Record<string, unknown>) {
  sb = criarSupabaseMock({
    resolver: (t) =>
      t === 'empresas'
        ? { id: EMPRESA, nome: 'Loja Fictícia' }
        : t === 'recepcao_config'
          ? config
          : t === 'platform_admins'
            ? { id: 'adm' }
            : t === 'recepcao_cenarios'
              ? cenario ?? null
              : null,
  });
}
const valor = (tabela: string, coluna: string) =>
  sb.chamadas.find((c) => c.tabela === tabela && c.metodo === 'eq' && c.args[0] === coluna)?.args[1];

beforeEach(() => {
  mock.auth = colaborador;
  mock.permitido = true;
  mock.callAI.mockReset();
});

describe('contexto: o segmento vem da configuração da empresa', () => {
  it('lê o segmento gravado', async () => {
    banco({ habilitado: true, dominio: 'atendimento_loja' });
    const c = (await contextoRecepcao(req, null)) as any;
    expect(c.dominio).toBe('atendimento_loja');
  });

  it('sem configuração, o segmento é o médico (o único com catálogo)', async () => {
    banco(null);
    mock.auth = { ...colaborador, isPlatformAdmin: true };
    const c = (await contextoRecepcao(req, EMPRESA)) as any;
    expect(c.dominio).toBe('recepcao_medica');
  });

  it('segmento desconhecido não vira outro em silêncio', async () => {
    banco({ habilitado: true, dominio: 'oficina' });
    await expect(contextoRecepcao(req, null)).rejects.toMatchObject({ status: 503 });
  });
});

describe('catálogo e edição ficam no segmento da empresa', () => {
  it('a lista de casos filtra pelo segmento', async () => {
    banco({ habilitado: true, dominio: 'secretaria_escolar' });
    await catalogo(ctx('secretaria_escolar'));
    expect(valor('recepcao_cenarios', 'conteudo->>dominio')).toBe('secretaria_escolar');
  });

  it('caso de outro segmento é recusado na criação', async () => {
    banco({ habilitado: true, dominio: 'atendimento_loja' });
    await expect(
      editarCenario(ctx('atendimento_loja'), { acao: 'salvar', conteudo: casoEmBranco('recepcao_medica') }),
    ).rejects.toMatchObject({ status: 400 });
    expect(sb.escritas).toHaveLength(0);
  });

  it('linha de outro segmento não é encontrada para editar, publicar ou arquivar', async () => {
    banco(
      { habilitado: true, dominio: 'atendimento_loja' },
      { id: 'c1', empresa_id: EMPRESA, estado: 'rascunho', revisao: 0, conteudo: { dominio: 'recepcao_medica' } },
    );
    await expect(
      editarCenario(ctx('atendimento_loja'), { acao: 'arquivar', id: '20000000-0000-4000-8000-000000000001', revisao: 0 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(sb.escritas).toHaveLength(0);
  });
});

describe('ponto de partida para um segmento sem casos', () => {
  it.each(DOMINIOS.map((d) => d.id))('%s: o caso em branco é válido e nasce no segmento', (id) => {
    const c = cenarioSchema.parse(casoEmBranco(id));
    expect(c.dominio).toBe(id);
    expect(c.ocorrenciasCriticas).toEqual(dominioAtendimento(id).ocorrencias.map((o) => o.id));
    expect(c.matriz?.competencias).toHaveLength(5);
    expect(c.rubrica.map((r) => r.peso)).toEqual([20, 20, 20, 20, 20]);
  });

  const pessoa = (nome: string) => ({
    nome,
    abertura: 'Comprei um fone há 40 dias e ele parou de funcionar. Quero trocar hoje.',
    comportamento: 'Apressado e desconfiado; aceita uma saída clara com prazo.',
    fatos: ['Não tem a nota fiscal, mas tem o comprovante do cartão.'],
  });
  const saida = {
    titulo: 'Troca fora do prazo',
    objetivo: 'Explicar a regra de troca e combinar a assistência autorizada.',
    contexto: 'Um cliente escreve pelo chat da loja pedindo a troca de um fone comprado há 40 dias.',
    agora: '14/09/2026 às 10h',
    secoes: [{ titulo: 'Política de troca', itens: ['Troca direta em até 30 dias.', 'Depois disso, assistência técnica autorizada.'] }],
    procedimentos: ['Explique a regra de troca.', 'Ofereça o envio à assistência com protocolo.', 'Não prometa troca imediata.'],
    pessoa: pessoa('Rui'),
    variante: pessoa('Clara'),
    criterios: {
      acolhimento: 'Reconhece a frustração sem culpar o cliente.',
      compreensao: 'Pergunta pela nota e pela data da compra.',
      clareza: 'Explica a diferença entre troca e assistência.',
      resolucao: 'Combina o envio à assistência com protocolo e prazo.',
      procedimentos: 'Não promete troca fora da política.',
    },
  };

  it('rascunho por IA: monta o caso no segmento da empresa e não salva nada', async () => {
    banco({ habilitado: true, dominio: 'atendimento_loja' });
    mock.callAI.mockResolvedValue(JSON.stringify(saida));
    const c = await gerarRascunho(ctx('atendimento_loja'), 'Cliente quer trocar um produto fora do prazo.');
    expect(c).toMatchObject({ dominio: 'atendimento_loja', statusEditorial: 'rascunho_ia' });
    expect(c.variantes).toHaveLength(1);
    expect(c.paciente.limites).toBe(LIMITES_PADRAO);
    expect(c.rubrica.find((r) => r.id === 'clareza')?.criterio).toBe(saida.criterios.clareza);
    expect(mock.callAI.mock.calls[0][4]).toMatchObject({ taskKey: 'recepcao_rascunho', empresaId: EMPRESA });
    expect(sb.escritas).toHaveLength(0);
  });

  it('saída incompleta ou falha da IA viram 502, com o caso em branco como saída', async () => {
    mock.callAI.mockResolvedValue('{"titulo":"Só o título"}');
    await expect(gerarRascunho(ctx('atendimento_loja'), 'Cliente quer trocar um produto.')).rejects.toMatchObject({ status: 502 });
    mock.callAI.mockRejectedValue(new Error('timeout'));
    await expect(gerarRascunho(ctx('atendimento_loja'), 'Cliente quer trocar um produto.')).rejects.toMatchObject({ status: 502 });
  });

  it('o pedido de rascunho fora do segmento médico não fala de saúde', () => {
    for (const d of DOMINIOS.filter((x) => x.id !== 'recepcao_medica')) expect(promptRascunho(d.id)).not.toMatch(MEDICO);
  });
});
