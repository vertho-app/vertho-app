import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const callAI = vi.fn();
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => callAI(...a) }));
vi.mock('@/lib/season-engine/modulo-base-integration', () => ({ resolverModuloBaseParaConteudo: vi.fn() }));

import { resolverOuCriarBrief, parseDesafioBase, gerarDesafioBase, garantirDesafioBase, gerarKitDesafio, type KitBriefNucleo } from '@/lib/season-engine/kit/brief';

const nucleo: KitBriefNucleo = { ideia_central: 'Proteger uma pausa na semana real', pontos_chave: ['a', 'b', 'c'], exemplo_ancora: 'Uma coordenadora entre dois turnos' };
const base = { acao: 'Proteger uma pausa que já existe na rotina, sem demandas', dias: 4, limiar: 'em pelo menos 3 dos 4 dias' };
const p: any = { competencia: 'Autocuidado', descritor: 'D4', cargo: 'Coordenação', contexto: 'generico', empresaId: 'e1' };
const desafioJson = JSON.stringify({ desafio_texto: 'Proteja uma pausa em 4 dias.', acao_observavel: 'proteger a pausa', criterio_de_execucao: 'conta em quais dias cumpriu', por_que_cabe_na_semana: 'já existe na rotina' });

/**
 * Os quatro desafios de um tema saem de gerações independentes; sem uma âncora comum a exigência divergia (critério de
 * "3 de 3" a "7 de 7" no mesmo tema, 02/10/2026). A âncora (ação, dias, limiar) é gerada UMA vez por tema e entra no
 * prompt de cada DISC; só a forma varia.
 */
describe('parseDesafioBase', () => {
  it('aceita âncora válida e recusa ação curta, dias fora de 1 a 5 ou não inteiro, limiar curto, JSON ruim', () => {
    expect(parseDesafioBase(JSON.stringify(base))).toEqual(base);
    expect(parseDesafioBase('texto em volta ' + JSON.stringify(base) + ' fim')).toEqual(base);
    for (const ruim of [{ ...base, acao: 'curta' }, { ...base, dias: 0 }, { ...base, dias: 6 }, { ...base, dias: 2.5 }, { ...base, dias: 'três' }, { ...base, limiar: 'x' }]) {
      expect(parseDesafioBase(JSON.stringify(ruim)), JSON.stringify(ruim)).toBeNull();
    }
    expect(parseDesafioBase('não é json')).toBeNull();
  });
});

describe('gerarDesafioBase', () => {
  beforeEach(() => callAI.mockReset());
  it('reenvia quando a resposta é inválida e desiste com erro depois de 3 tentativas', async () => {
    callAI.mockResolvedValueOnce('lixo').mockResolvedValueOnce(JSON.stringify(base));
    expect(await gerarDesafioBase(p, nucleo)).toEqual(base);
    expect(callAI).toHaveBeenCalledTimes(2);
    callAI.mockReset(); callAI.mockResolvedValue('lixo');
    await expect(gerarDesafioBase(p, nucleo)).rejects.toThrow(/âncora do desafio inválida/);
    expect(callAI).toHaveBeenCalledTimes(3);
  });
});

describe('garantirDesafioBase', () => {
  beforeEach(() => callAI.mockReset());
  it('brief que JÁ tem âncora não gasta IA nem escreve', async () => {
    const sb = criarSupabaseMock();
    const r = await garantirDesafioBase(sb.client, 'b1', p, { ...nucleo, desafio_base: base });
    expect(r.desafio_base).toEqual(base);
    expect(callAI).not.toHaveBeenCalled();
    expect(sb.escritas).toHaveLength(0);
  });
  it('brief antigo recebe a âncora e ela é PERSISTIDA no brief, sem perder o núcleo', async () => {
    callAI.mockResolvedValue(JSON.stringify(base));
    const sb = criarSupabaseMock();
    const r = await garantirDesafioBase(sb.client, 'b1', p, nucleo);
    expect(r).toEqual({ ...nucleo, desafio_base: base });
    const upd = sb.escritas.find((e) => e.tabela === 'kit_briefs' && e.op === 'update')!;
    expect(upd.payload.brief).toEqual({ ...nucleo, desafio_base: base });
  });
  it('falha ao gravar LANÇA (devolver sem gravar faria o próximo DISC gerar outra âncora)', async () => {
    callAI.mockResolvedValue(JSON.stringify(base));
    const sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'kit_briefs', op: 'update', mensagem: 'timeout' });
    await expect(garantirDesafioBase(sb.client, 'b1', p, nucleo)).rejects.toThrow(/timeout/);
  });
});

describe('gerarKitDesafio: a âncora entra no prompt de cada perfil', () => {
  beforeEach(() => { callAI.mockReset(); callAI.mockResolvedValue(desafioJson); });
  const system = async (n: KitBriefNucleo, disc: 'D' | 'I' | 'S' | 'C' = 'I') => { await gerarKitDesafio(p, n, disc); return String(callAI.mock.calls[0][0]); };

  it('com âncora: ação, dias e limiar fixos no prompt, e a lente passa a variar só a FORMA', async () => {
    const s = await system({ ...nucleo, desafio_base: base });
    expect(s).toContain('ÂNCORA FIXA DO TEMA');
    expect(s).toContain(base.acao);
    expect(s).toContain('Dias de prática: 4');
    expect(s).toContain(base.limiar);
    expect(s).toContain('muda só a FORMA');
  });
  it('a MESMA âncora vai para os quatro perfis', async () => {
    const trechos = new Set<string>();
    for (const d of ['D', 'I', 'S', 'C'] as const) {
      callAI.mockClear();
      const s = await system({ ...nucleo, desafio_base: base }, d);
      trechos.add(s.slice(s.indexOf('ÂNCORA FIXA'), s.indexOf('LENTE DE PERFIL')));
    }
    expect(trechos.size).toBe(1);
  });
  it('sem âncora (brief antigo ainda não migrado): prompt como antes, sem bloco de âncora', async () => {
    const s = await system(nucleo);
    expect(s).not.toContain('ÂNCORA FIXA');
    expect(s).toContain('LENTE DE PERFIL');
  });
});

describe('resolverOuCriarBrief garante a âncora nos DOIS caminhos', () => {
  beforeEach(() => { callAI.mockReset(); callAI.mockResolvedValue(JSON.stringify(base)); });

  it('brief REUSADO sem âncora (os 68 anteriores): recebe e persiste a âncora', async () => {
    const sb = criarSupabaseMock({ resolver: (t) => (t === 'kit_briefs' ? { id: 'b1', brief: nucleo, modulo_base_id: 'mb', archived_at: null } : null) });
    const r = await resolverOuCriarBrief(sb.client, p);
    expect(r.reused).toBe(true);
    expect(r.brief.desafio_base).toEqual(base);
    expect(sb.escritas.find((e) => e.tabela === 'kit_briefs' && e.op === 'update')!.payload.brief.desafio_base).toEqual(base);
  });

  it('brief reusado que JÁ tem âncora: nenhuma chamada de IA, nenhuma escrita', async () => {
    const sb = criarSupabaseMock({ resolver: (t) => (t === 'kit_briefs' ? { id: 'b1', brief: { ...nucleo, desafio_base: base }, modulo_base_id: 'mb', archived_at: null } : null) });
    const r = await resolverOuCriarBrief(sb.client, p);
    expect(r.brief.desafio_base).toEqual(base);
    expect(callAI).not.toHaveBeenCalled();
    expect(sb.escritas).toHaveLength(0);
  });
});
