import { beforeEach, describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { instalarMatrizLideranca, estadoMatrizLideranca, MARCA_ANCORA } from '@/lib/simuladores/lideranca/instalar';
import { COMPETENCIAS_LIDERANCA, VARIANTES } from '@/lib/simuladores/lideranca/matriz-global';

/**
 * O instalador materializa a matriz global no tenant. O que se prova aqui é o
 * que o silêncio custaria: escrita idempotente (reinstalar não duplica), erro de
 * leitura que NÃO vira "instalado", e a recusa contra cargo homônimo, que é o
 * único caminho pelo qual isto poderia destruir dado de cliente.
 */
const NOMES = Object.values(VARIANTES);

describe('instalarMatrizLideranca', () => {
  let sb = criarSupabaseMock();
  const mock = (cargos: any[] = [], competencias: any[] = []) => criarSupabaseMock({
    lista: (tabela) => {
      if (tabela === 'cargos_empresa') return cargos;
      if (tabela === 'competencias') return competencias;
      return [];
    },
  });

  beforeEach(() => { sb = mock(); });

  it('tenant limpo: cria os 2 cargos-âncora e insere as 60 linhas', async () => {
    const r = await instalarMatrizLideranca(sb.client, 'emp-A');
    expect(r.ok).toBe(true);
    expect(r.descritoresInseridos).toBe(60);
    expect(r.descritoresAtualizados).toBe(0);
    expect(r.cargos.map((c) => c.nome).sort()).toEqual([...NOMES].sort());
    expect(r.cargos.every((c) => c.criado)).toBe(true);

    const inserts = sb.escritas.filter((e) => e.op === 'insert');
    const cargosCriados = inserts.filter((e) => e.tabela === 'cargos_empresa');
    expect(cargosCriados).toHaveLength(2);
    // O cargo-âncora leva as 5 da matriz no Top 5: é daí que a fila da IA3 sai.
    expect(cargosCriados[0].payload.top5_workshop).toEqual([...COMPETENCIAS_LIDERANCA]);
    // E NÃO leva gabarito: o eixo de estilo usa o do cargo-alvo real da empresa.
    expect(cargosCriados[0].payload.gabarito).toBeUndefined();
    expect(cargosCriados[0].payload.empresa_id).toBe('emp-A');
  });

  it('reinstalar é idempotente: atualiza em vez de duplicar', async () => {
    const jaInstalado = [
      { id: 'c-gc', nome: VARIANTES.lider, top5_workshop: [...COMPETENCIAS_LIDERANCA] },
      { id: 'c-fl', nome: VARIANTES.futuro, top5_workshop: [...COMPETENCIAS_LIDERANCA] },
    ];
    const comps = [{ id: 'x1', cod_comp: 'LD01', cod_desc: 'LD01_D1', cargo: VARIANTES.lider }];
    sb = mock(jaInstalado, comps);

    const r = await instalarMatrizLideranca(sb.client, 'emp-A');
    expect(r.ok).toBe(true);
    expect(r.cargos.every((c) => c.criado)).toBe(false);
    expect(r.descritoresAtualizados).toBe(1);   // a linha que já existia
    expect(r.descritoresInseridos).toBe(59);    // as demais
    expect(sb.escritas.filter((e) => e.tabela === 'cargos_empresa' && e.op === 'insert')).toHaveLength(0);
  });

  /**
   * 🔴 O caso que justifica o fail-loud. "Líder" é nome que uma empresa pode
   * ter cadastrado como cargo de verdade. Gravar por cima
   * reescreveria o `top5_workshop` e o `gabarito` dele, e o gabarito é o que
   * alimenta o eixo de estilo do Ranking. Recusa a instalação INTEIRA.
   */
  it('cargo homônimo REAL recusa sem escrever nada', async () => {
    const real = [{ id: 'c-real', nome: VARIANTES.lider, top5_workshop: ['Negociação', 'Prospecção'], gabarito: { tela4: {} } }];
    sb = mock(real);
    const r = await instalarMatrizLideranca(sb.client, 'emp-A');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/já tem cargo com o nome/);
    expect(r.erro).toMatch(VARIANTES.lider);
    expect(sb.escritas).toHaveLength(0);
  });

  /**
   * 🔴 O caso que quase custou a troca de matriz (medido em 14/09). A âncora
   * gravada por uma versão ANTERIOR carrega o Top 5 antigo; comparar só o Top 5
   * a leria como cargo real da empresa e recusaria a instalação inteira, sem a
   * matriz nunca atualizar. A marca na descrição é estável entre versões.
   */
  it('âncora de uma versão ANTERIOR da matriz é reconhecida como nossa e atualizada', async () => {
    const antiga = [
      { id: 'c-1', nome: VARIANTES.lider, top5_workshop: ['Competência Velha A', 'Competência Velha B'], descricao: `${MARCA_ANCORA} Criado pela plataforma.` },
      { id: 'c-2', nome: VARIANTES.futuro, top5_workshop: ['Competência Velha A'], descricao: `${MARCA_ANCORA} Criado pela plataforma.` },
    ];
    sb = mock(antiga);
    const r = await instalarMatrizLideranca(sb.client, 'emp-A');
    expect(r.ok).toBe(true);
    expect(r.cargos.every((c) => c.criado)).toBe(false);
    const updates = sb.escritas.filter((e) => e.tabela === 'cargos_empresa' && e.op === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[0].payload.top5_workshop).toEqual([...COMPETENCIAS_LIDERANCA]);
  });

  /** Âncora de uma variante que não existe mais vira lixo: relatada, nunca apagada sozinha. */
  it('relata âncora ÓRFÃ (variante extinta) sem apagá-la', async () => {
    const comOrfa = [
      { id: 'c-velho', nome: 'Gestor Comercial', top5_workshop: ['X'], descricao: `${MARCA_ANCORA} Criado pela plataforma.` },
    ];
    sb = mock(comOrfa);
    const r = await instalarMatrizLideranca(sb.client, 'emp-A');
    expect(r.ok).toBe(true);
    expect(r.ancorasOrfas).toEqual(['Gestor Comercial']);
    expect(sb.escritas.filter((e) => e.op === 'delete')).toHaveLength(0);
  });

  it('erro de leitura dos cargos não vira instalação', async () => {
    sb.falharEm({ tabela: 'cargos_empresa', op: 'select', mensagem: 'timeout' });
    const r = await instalarMatrizLideranca(sb.client, 'emp-A');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/timeout/);
    expect(sb.escritas).toHaveLength(0);
  });

  it('erro na escrita das competências volta como erro, não como sucesso', async () => {
    sb.falharEm({ tabela: 'competencias', op: 'insert', mensagem: 'constraint' });
    const r = await instalarMatrizLideranca(sb.client, 'emp-A');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/constraint/);
  });
});

describe('estadoMatrizLideranca', () => {
  it('erro de leitura não responde "instalada"', async () => {
    const sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'sem rede' });
    const r = await estadoMatrizLideranca(sb.client, 'emp-A');
    expect(r.instalada).toBe(false);
    expect(r.erro).toMatch(/sem rede/);
  });
});
