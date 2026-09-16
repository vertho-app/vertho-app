import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseMock } from '../helpers/supabase-mock';
import { criarMockDeTabelas } from '../helpers/tabela-filtrada';
import { cargoServe } from '@/lib/season-engine/kit/desafio-semana';
import { resolverKitDaSemana, precarregarKits } from '@/lib/season-engine/kit/entrega-semana';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

/**
 * KIT GENÉRICO ('todos') SERVE A QUALQUER CARGO — como a decisão de 29/07 e o
 * docs/KIT-SEMANAL.md dizem ("brief sem cargo segue curinga do legado").
 *
 * O código só tratava o VAZIO como curinga, e o genérico é gravado como `'todos'`
 * (`kit_briefs.cargo` NOT NULL DEFAULT 'todos'; é também o padrão da tela). Então
 * o kit genérico era barrado para todo colaborador com cargo. Não afetou ninguém
 * (0 kits 'todos' em 16/09/2026), mas é o caminho de quem quiser um kit por matriz.
 *
 * O que NÃO muda: kit de OUTRO cargo específico segue barrado, e o do próprio cargo
 * vence o genérico. Os dois resolvedores precisam concordar (kit-entrega-paridade).
 */

let sb: SupabaseMock;
let tabelas: Record<string, any[]> = {};

const COORD = 'Coordenação Pedagógica';
const TEMA = { competencia: 'Planejamento', descritor: 'Gestão de riscos' };
const brief = (id: string, cargo: string) => ({ id, ...TEMA, cargo, empresa_id: 'e1', status: 'published', archived_at: null });
const kit = (id: string, brief_id: string) => ({ id, brief_id, disc: 'S', status: 'published', desafio: { desafio_texto: `desafio ${id}` }, created_at: '2026-09-01' });
const texto = (id: string, kit_id: string) => ({ id, kit_id, formato: 'texto', url: null, titulo: id, created_at: '2026-09-01' });
const COLAB = { empresaId: 'e1', disc: 'S', cargo: COORD };
const ARGS = { ...COLAB, ...TEMA };
const chave = `${TEMA.competencia} ::: ${normDescritor(TEMA.descritor)}`;

beforeEach(() => {
  tabelas = { kit_briefs: [], kits: [], micro_conteudos: [] };
  sb = criarMockDeTabelas(() => tabelas);
});

describe('cargoServe', () => {
  it("'todos' e vazio são curinga; outro cargo específico não; colaborador sem cargo aceita qualquer um", () => {
    expect(cargoServe('todos', COORD)).toBe(true);
    expect(cargoServe(' Todos ', COORD)).toBe(true);
    expect(cargoServe('', COORD)).toBe(true);
    expect(cargoServe(COORD, COORD)).toBe(true);
    expect(cargoServe('Gestão Escolar', COORD)).toBe(false);
    expect(cargoServe('Gestão Escolar', '')).toBe(true);
  });
});

describe("kit 'todos' nos dois resolvedores", () => {
  it('só existe o genérico → os dois entregam', async () => {
    tabelas.kit_briefs = [brief('b-todos', 'todos')];
    tabelas.kits = [kit('k-todos', 'b-todos')];
    tabelas.micro_conteudos = [texto('t-todos', 'k-todos')];

    expect((await resolverKitDaSemana(sb.client, ARGS))?.kitId).toBe('k-todos');
    const cache = await precarregarKits(sb.client, COLAB);
    expect(cache.get(chave)?.kitId).toBe('k-todos');
    expect(cache.get(chave)?.barradoPorCargo).toBeUndefined();
  });

  it('existem o do cargo e o genérico → os dois escolhem o do cargo', async () => {
    tabelas.kit_briefs = [brief('b-todos', 'todos'), brief('b-coord', COORD)];
    tabelas.kits = [kit('k-todos', 'b-todos'), kit('k-coord', 'b-coord')];
    tabelas.micro_conteudos = [texto('t-todos', 'k-todos'), texto('t-coord', 'k-coord')];

    expect((await resolverKitDaSemana(sb.client, ARGS))?.kitId).toBe('k-coord');
    expect((await precarregarKits(sb.client, COLAB)).get(chave)?.kitId).toBe('k-coord');
  });

  it('só existe o de OUTRO cargo → segue barrado nos dois', async () => {
    tabelas.kit_briefs = [brief('b-gestao', 'Gestão Escolar')];
    tabelas.kits = [kit('k-gestao', 'b-gestao')];
    tabelas.micro_conteudos = [texto('t-gestao', 'k-gestao')];

    expect(await resolverKitDaSemana(sb.client, ARGS)).toBeNull();
    const entrada = (await precarregarKits(sb.client, COLAB)).get(chave);
    expect(entrada?.kitId).toBeNull();
    expect(entrada?.barradoPorCargo).toBe('Gestão Escolar');
  });
});
