import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';
import type { ResultadoBusca } from '@/lib/mercado-potencial/enriquecimento/busca-web';
import type { ClienteHunter } from '@/lib/mercado-potencial/enriquecimento/hunter';
import {
  TAMANHO_LOTE, TETO_DIARIO, TETO_RODADA, classificar, contarBuscasDoDia, enriquecerLote, inicioDoDiaBRT, montarPlano, normalizarCodigos,
} from '@/lib/mercado-potencial/enriquecimento/lote';
import { contatosParaExportacao, paraContatoEnriquecido, suprimirEmail } from '@/lib/mercado-potencial/enriquecimento/persistencia';
import type { LinhaContato } from '@/lib/mercado-potencial/enriquecimento/tipos';
import { paginaDeHtml, type BuscaPagina } from '@/lib/mercado-potencial/enriquecimento/verificar';

/**
 * Lote e plano: tudo que roda ENTRE o gate da action e o orquestrador por escola. Banco em memória (o
 * `criarSupabaseMock` sabe falhar), busca e Hunter injetados. O que cada grupo prova está no título.
 */

const AGORA = new Date('2026-10-16T15:00:00.000Z');           // 12:00 em Brasília
const FONTE = 'https://www.colegioexemplo.com.br/contato';
const web: BuscaPagina = async (url) => (url === FONTE ? paginaDeHtml('Diretora Maria Lima (19) 3251-0000 secretaria@colegioexemplo.com.br') : { tipo: 'inacessivel' });

const busca = (): ResultadoBusca => ({
  escola_identificada: 'x', site_oficial: 'https://www.colegioexemplo.com.br', site_confere_com_endereco: true,
  telefones: [{ numero: '(19) 3251-0000', rotulo: 'a', fonte_url: FONTE }], emails: [{ endereco: 'secretaria@colegioexemplo.com.br', rotulo: 'a', fonte_url: FONTE }],
  whatsapp: [], responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE }], observacoes: '',
});

function linhaContato(inep: string, parcial: Partial<LinhaContato> = {}): LinhaContato {
  return {
    codigo_inep: inep, site: 'https://www.colegioexemplo.com.br', site_confere_endereco: true,
    telefones: [{ numero: '(19) 3251-0000', rotulo: 's', fonte_url: FONTE }], emails: [{ endereco: 'secretaria@colegioexemplo.com.br', rotulo: 's', fonte_url: FONTE }],
    whatsapp: [], responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE, email: 'maria@colegioexemplo.com.br', email_status: 'valid', email_origem: 'hunter_finder' }],
    nivel: 'A', hunter_status: 'ok', observacao: null, custo_usd: 0.09, hunter_creditos: 1, coletado_por: 'a@vertho.ai',
    coletado_em: '2026-10-10T12:00:00.000Z', expira_em: '2027-04-08T12:00:00.000Z', ...parcial,
  };
}

// ── banco em memória ──
let contatos: LinhaContato[];
let supressao: string[];
let escolas: any[];
let censo: any[];
let buscasHoje: number;
let sb: ReturnType<typeof criarSupabaseMock>;

const valorDoIn = (cadeia: Chamada[]): string[] => (cadeia.find((c) => c.metodo === 'in')?.args[1] as string[]) ?? [];

function novoBanco() {
  contatos = []; supressao = []; buscasHoje = 0;
  escolas = [1, 2, 3, 4, 5, 6].map((i) => ({ codigo_inep: `3500000${i}`, nome: `Escola ${i}`, municipio: 'Campinas', uf: 'SP' }));
  censo = escolas.map((e) => ({ codigo_inep: e.codigo_inep, endereco: `Rua ${e.codigo_inep}, 10`, bairro: 'Centro', cep: '13000000' }));
  sb = criarSupabaseMock({
    lista: (tabela, _c, cadeia) => {
      if (tabela === 'mercado_escola_contatos') { const ids = valorDoIn(cadeia); return ids.length ? contatos.filter((l) => ids.includes(l.codigo_inep)) : contatos; }
      if (tabela === 'mercado_contatos_supressao') return supressao.map((email) => ({ email }));
      if (tabela === 'diag_mv_mercado_escola') return escolas.filter((e) => valorDoIn(cadeia).includes(e.codigo_inep));
      if (tabela === 'diag_censo_infra') return censo.filter((e) => valorDoIn(cadeia).includes(e.codigo_inep));
      return [];
    },
    contagem: (tabela) => (tabela === 'mercado_escola_contatos' ? buscasHoje : null),
  });
}

function hunterFalso(sobre: Partial<ClienteHunter> = {}) {
  const creditos = vi.fn(async () => 40);
  const h: ClienteHunter = {
    creditos, emailFinder: async (d, n) => ({ email: `${n.split(' ')[0].toLowerCase()}@${d}`, score: 90, status: 'valid' }),
    domainSearch: async () => ({ pessoas: [] }), verificar: async () => ({ status: 'valid' }), ...sobre,
  };
  return { h, creditos };
}

let espioes: Array<ReturnType<typeof vi.spyOn>> = [];
beforeEach(() => {
  novoBanco();
  espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => { espioes.forEach((e) => e.mockRestore()); vi.restoreAllMocks(); });

const rodar = (codigos: unknown, deps: Parameters<typeof enriquecerLote>[3] = {}) =>
  enriquecerLote(sb.client, 'rodrigo@vertho.ai', codigos, { buscar: async () => busca(), buscarPagina: web, agora: () => AGORA, hunter: hunterFalso().h, ...deps });
const upserts = () => sb.escritas.filter((e) => e.tabela === 'mercado_escola_contatos' && e.op === 'upsert');

describe('normalizarCodigos: o código vem do navegador', () => {
  it('aceita INEP de 8 dígitos, tira repetidos e respeita o teto de 5 por chamada', () => {
    expect(normalizarCodigos(['35000001', '35000001', ' 35000002 '])).toEqual({ ok: true, codigos: ['35000001', '35000002'] });
    expect(TAMANHO_LOTE).toBe(5);
    const seis = Array.from({ length: 6 }, (_, i) => `3500000${i}`);
    expect(normalizarCodigos(seis)).toMatchObject({ ok: false });
  });

  it('recusa vazio, não-array, INEP curto/longo, com letras ou com SQL', () => {
    for (const x of [[], null, undefined, 'x', {}, ['123'], ['350000011'], ['3500000A'], ["35000001'; drop table x;--"], [null], ['']]) {
      expect(normalizarCodigos(x as any).ok, JSON.stringify(x)).toBe(false);
    }
  });

  it('entrada inválida volta erro SEM tocar no banco nem na busca', async () => {
    const buscar = vi.fn(async () => busca());
    const r = await rodar(['abc'], { buscar });
    expect(r).toMatchObject({ ok: false });
    expect(sb.chamadas).toHaveLength(0);
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe('enriquecerLote: uma escola por vez, gravada ao terminar', () => {
  it('busca, confere, grava UMA linha por escola e soma custo e buscas', async () => {
    const buscar = vi.fn(async () => busca());
    const r: any = await rodar(['35000001', '35000002'], { buscar });
    expect(r.ok).toBe(true);
    expect(r.resultados.map((x: any) => [x.codigo_inep, x.ok, x.nivel, x.hunter_status])).toEqual([['35000001', true, 'A', 'ok'], ['35000002', true, 'A', 'ok']]);
    expect(r.buscas).toBe(2);
    expect(r.custoUsd).toBe(0.18);
    expect(upserts()).toHaveLength(2);
    expect(upserts()[0].payload).toMatchObject({ codigo_inep: '35000001', coletado_por: 'rodrigo@vertho.ai', nivel: 'A' });
    expect(sb.chamadas.find((c) => c.metodo === 'upsert')!.args[1]).toEqual({ onConflict: 'codigo_inep' });
  });

  it('o endereço do Censo (INEP → endereço) chega à busca', async () => {
    const buscar = vi.fn(async () => busca());
    await rodar(['35000003'], { buscar });
    expect(buscar).toHaveBeenCalledWith(expect.objectContaining({ codigo_inep: '35000003', endereco: 'Rua 35000003, 10', cep: '13000000', municipio: 'Campinas' }));
  });

  it('escola que não está na base volta erro e NÃO gasta busca', async () => {
    const buscar = vi.fn(async () => busca());
    const r: any = await rodar(['35000001', '99999999'], { buscar });
    expect(r.resultados[1]).toMatchObject({ codigo_inep: '99999999', ok: false });
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(upserts()).toHaveLength(1);
  });

  it('o erro de UMA escola não derruba as outras, e o log leva só o código e a classe do erro (nunca a mensagem)', async () => {
    let n = 0;
    const buscar = vi.fn(async () => { if (++n === 1) throw new Error('falhou para Maria Lima <maria@colegioexemplo.com.br>'); return busca(); });
    const r: any = await rodar(['35000001', '35000002'], { buscar });
    expect(r.resultados.filter((x: any) => x.ok)).toHaveLength(1);
    expect(r.resultados.filter((x: any) => !x.ok)).toHaveLength(1);
    expect(upserts()).toHaveLength(1);
    const logado = JSON.stringify(espioes.flatMap((e) => e.mock.calls));
    expect(logado).toContain('35000001');
    expect(logado).not.toMatch(/Maria Lima|maria@/);
  });

  it('busca paga que não grava: erro visível, custo contado, e a escola não vira "pronta"', async () => {
    sb.falharEm({ tabela: 'mercado_escola_contatos', op: 'upsert', mensagem: 'sem conexão' });
    const r: any = await rodar(['35000001']);
    expect(r.ok).toBe(true);
    expect(r.resultados[0]).toMatchObject({ ok: false, busca: true });
    expect(r.resultados[0].erro).toContain('sem conexão');
    expect(r.buscas).toBe(1);
    expect(r.custoUsd).toBe(0.09);
  });

  it('escola já pronta (vigente, Hunter resolvido): nem busca, nem Hunter, nem regravação', async () => {
    contatos = [linhaContato('35000001')];
    const buscar = vi.fn(async () => busca());
    const r: any = await rodar(['35000001'], { buscar });
    expect(r.resultados[0]).toMatchObject({ ok: true, busca: false, nivel: 'A', hunter_status: 'ok' });
    expect(buscar).not.toHaveBeenCalled();
    expect(upserts()).toHaveLength(0);
    expect(r.buscas).toBe(0);
  });

  it('Hunter pendente: completa SEM refazer a busca, e só o crédito novo entra na conta', async () => {
    contatos = [linhaContato('35000001', {
      hunter_status: 'sem_creditos', hunter_creditos: 0,
      responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE }],
    })];
    const buscar = vi.fn(async () => busca());
    const r: any = await rodar(['35000001'], { buscar });
    expect(buscar).not.toHaveBeenCalled();
    expect(r.resultados[0]).toMatchObject({ ok: true, busca: false, hunter_status: 'ok' });
    expect(r.buscas).toBe(0);
    expect(r.custoUsd).toBe(0);
    expect(r.hunterCreditosGastos).toBe(1);
    expect(upserts()[0].payload.coletado_em).toBe('2026-10-10T12:00:00.000Z');
  });
});

describe('frios de segurança do lote', () => {
  it('apaga o dado pessoal VENCIDO a cada lote (180 dias), pelo `expira_em`', async () => {
    await rodar(['35000001']);
    const apagou = sb.escritas.find((e) => e.tabela === 'mercado_escola_contatos' && e.op === 'delete');
    expect(apagou).toBeTruthy();
    const lt = sb.chamadas.find((c) => c.tabela === 'mercado_escola_contatos' && c.metodo === 'lt');
    expect(lt!.args).toEqual(['expira_em', AGORA.toISOString()]);
  });

  it('teto diário: com 499 buscas hoje, só UMA busca nova passa; a outra fica "adiada por teto"', async () => {
    buscasHoje = TETO_DIARIO - 1;
    const buscar = vi.fn(async () => busca());
    const r: any = await rodar(['35000001', '35000002', '35000003'], { buscar });
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(r.resultados.filter((x: any) => x.adiadaPor === 'teto_diario')).toHaveLength(2);
    expect(r.buscasRestantesHoje).toBe(0);
  });

  it('teto diário NÃO barra quem só completa o Hunter (não é busca nova)', async () => {
    buscasHoje = TETO_DIARIO;
    contatos = [linhaContato('35000001', { hunter_status: 'sem_creditos', responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE }] })];
    const r: any = await rodar(['35000001']);
    expect(r.resultados[0]).toMatchObject({ ok: true, hunter_status: 'ok' });
  });

  it('o teto conta a partir da meia-noite de BRASÍLIA (UTC-3), não de UTC', async () => {
    expect(inicioDoDiaBRT(new Date('2026-10-16T02:30:00.000Z'))).toBe('2026-10-15T03:00:00.000Z');   // 23:30 de 15/10 em Brasília
    expect(inicioDoDiaBRT(new Date('2026-10-16T15:00:00.000Z'))).toBe('2026-10-16T03:00:00.000Z');
    await contarBuscasDoDia(sb.client, AGORA);
    const gte = sb.chamadas.find((c) => c.tabela === 'mercado_escola_contatos' && c.metodo === 'gte');
    expect(gte!.args).toEqual(['coletado_em', '2026-10-16T03:00:00.000Z']);
  });

  it('lote lento: a escola que ainda não começou fica para a próxima chamada, sem gastar busca', async () => {
    const agoraReal = Date.now();
    const spy = vi.spyOn(Date, 'now');
    spy.mockReturnValueOnce(agoraReal).mockReturnValue(agoraReal + 200_000);
    const buscar = vi.fn(async () => busca());
    const r: any = await rodar(['35000001', '35000002'], { buscar });
    expect(buscar).not.toHaveBeenCalled();
    expect(r.resultados.every((x: any) => x.adiada && x.adiadaPor === 'prazo')).toBe(true);
  });

  it('sem a lista de e-mails bloqueados NADA roda (falha fechada): sem busca e sem gravação', async () => {
    sb.falharEm({ tabela: 'mercado_contatos_supressao', op: 'select', mensagem: 'timeout' });
    const buscar = vi.fn(async () => busca());
    const r: any = await rodar(['35000001'], { buscar });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('bloqueados');
    expect(buscar).not.toHaveBeenCalled();
    expect(upserts()).toHaveLength(0);
  });

  it('falha ao ler o endereço, os contatos ou a escola devolve erro e não busca', async () => {
    for (const tabela of ['diag_censo_infra', 'diag_mv_mercado_escola']) {
      novoBanco();
      sb.falharEm({ tabela, op: 'select', mensagem: 'caiu' });
      const buscar = vi.fn(async () => busca());
      const r: any = await rodar(['35000001'], { buscar });
      expect(r.ok, tabela).toBe(false);
      expect(buscar, tabela).not.toHaveBeenCalled();
    }
    novoBanco();
    sb.falharEm({ tabela: 'mercado_escola_contatos', op: 'delete', mensagem: 'sem permissão' });
    expect(((await rodar(['35000001'])) as any).ok).toBe(false);
  });

  it('o saldo do Hunter é lido UMA vez por lote e a reserva vale entre as escolas', async () => {
    const { h, creditos } = hunterFalso();
    creditos.mockResolvedValue(4);
    // As 3 escolas rodam EM PARALELO e partilham o saldo: com 4 créditos e reserva de 3, só UMA pode gastar.
    const r: any = await rodar(['35000001', '35000002', '35000003'], { hunter: h });
    expect(creditos).toHaveBeenCalledTimes(1);
    expect(r.resultados.map((x: any) => x.hunter_status).sort()).toEqual(['ok', 'sem_creditos', 'sem_creditos']);
    expect(r.hunterConfigurado).toBe(true);
  });

  it('sem Hunter configurado a busca web roda e cada escola grava "indisponivel"', async () => {
    const r: any = await rodar(['35000001'], { hunter: null });
    expect(r.hunterConfigurado).toBe(false);
    expect(r.resultados[0]).toMatchObject({ ok: true, hunter_status: 'indisponivel' });
  });
});

describe('plano: o que a rodada faria, sem gastar nada', () => {
  const ordem = (n: number) => Array.from({ length: n }, (_, i) => String(35000000 + i));

  it('classificar separa pronta, só-Hunter e a-enriquecer (vencida conta como a-enriquecer)', () => {
    const mapa = new Map<string, LinhaContato>([
      ['1', linhaContato('1')],
      ['2', linhaContato('2', { hunter_status: 'sem_creditos' })],
      ['3', linhaContato('3', { expira_em: '2026-10-01T00:00:00.000Z' })],
      ['4', linhaContato('4', { hunter_status: 'sem_nomes' })],
    ]);
    expect(classificar(['1', '2', '3', '4', '5'], mapa, AGORA, true)).toEqual({ prontas: ['1', '4'], hunterPendente: ['2'], aEnriquecer: ['3', '5'] });
    // Sem Hunter, "só falta o Hunter" não tem o que rodar: vira pronta.
    expect(classificar(['2'], mapa, AGORA, false)).toEqual({ prontas: ['2'], hunterPendente: [], aEnriquecer: [] });
  });

  it('a rodada tem no máximo 200 escolas, NA ORDEM DA TELA, com custo e créditos estimados; o resto vai para depois', async () => {
    const r = await montarPlano(sb.client, ordem(450), { totalNoBanco: 450, truncado: false }, AGORA, { hunter: hunterFalso().h });
    if (r.ok === false) throw new Error(r.error);
    expect(TETO_RODADA).toBe(200);
    expect(r.plano.codigos).toEqual(ordem(450).slice(0, 200));
    expect(r.plano.janela).toBe(450);
    expect(r.plano.aEnriquecer).toBe(450);
    expect(r.plano.paraDepois).toBe(250);
    expect(r.plano.buscasNovas).toBe(200);
    expect(r.plano.custoBuscaUsd).toBe(18);
    expect(r.plano.creditosHunterEstimados).toBe(460);
    expect(r.plano.buscasRestantesHoje).toBe(TETO_DIARIO);
    expect(r.plano.creditosHunter).toBe(40);
  });

  it('a janela é de 1.000 escolas e as prontas saem da fila (a rodada seguinte avança sozinha)', async () => {
    contatos = ordem(5).map((i) => linhaContato(i));
    const r = await montarPlano(sb.client, ordem(1500), { totalNoBanco: 1500, truncado: true }, AGORA, { hunter: hunterFalso().h });
    if (r.ok === false) throw new Error(r.error);
    expect(r.plano.janela).toBe(1000);
    expect(r.plano.lidas).toBe(1500);
    expect(r.plano.prontas).toBe(5);
    expect(r.plano.codigos[0]).toBe('35000005');
    expect(r.plano.truncado).toBe(true);
  });

  it('retomada do Hunter não cobra busca: custo só das escolas novas', async () => {
    contatos = [linhaContato('35000000', { hunter_status: 'sem_creditos' })];
    const r = await montarPlano(sb.client, ordem(3), { totalNoBanco: 3, truncado: false }, AGORA, { hunter: hunterFalso().h });
    if (r.ok === false) throw new Error(r.error);
    expect(r.plano).toMatchObject({ buscasNovas: 2, soHunter: 1, custoBuscaUsd: 0.18 });
  });

  it('sem chave do Hunter o plano avisa (hunterConfigurado false) e não tenta ler saldo', async () => {
    const r = await montarPlano(sb.client, ordem(2), { totalNoBanco: 2, truncado: false }, AGORA, { hunter: null });
    if (r.ok === false) throw new Error(r.error);
    expect(r.plano).toMatchObject({ hunterConfigurado: false, creditosHunter: null });
  });

  it('falha de leitura do banco vira erro, não plano vazio', async () => {
    sb.falharEm({ tabela: 'mercado_escola_contatos', op: 'select', mensagem: 'caiu' });
    const r = await montarPlano(sb.client, ordem(2), { totalNoBanco: 2, truncado: false }, AGORA, { hunter: null });
    expect(r.ok).toBe(false);
  });
});

describe('contato na planilha e remoção por pedido', () => {
  it('só e-mail VERIFICADO (valid) sai; accept_all e sem status ficam guardados mas fora da planilha', () => {
    const l = linhaContato('1', { responsaveis: [
      { nome: 'A Valido', cargo: 'Diretor', fonte_url: FONTE, email: 'a@x.com', email_status: 'valid' },
      { nome: 'B Aceita', cargo: 'Diretor', fonte_url: FONTE, email: 'b@x.com', email_status: 'accept_all' },
      { nome: 'C Sem', cargo: 'Diretor', fonte_url: FONTE, email: 'c@x.com', email_status: null },
    ] });
    const c = paraContatoEnriquecido(l, new Set());
    expect(c.responsaveis.map((p) => [p.nome, p.email])).toEqual([['A Valido', 'a@x.com'], ['B Aceita', null], ['C Sem', null]]);
  });

  it('quem está na supressão sai por INTEIRO (nome também), e o e-mail institucional bloqueado some', () => {
    const l = linhaContato('1', {
      emails: [{ endereco: 'secretaria@x.com', rotulo: '', fonte_url: FONTE }, { endereco: 'bloqueado@x.com', rotulo: '', fonte_url: FONTE }],
      responsaveis: [
        { nome: 'Pessoa Barrada', cargo: 'Diretor', fonte_url: FONTE, email: 'Barrada@X.com', email_status: 'valid' },
        { nome: 'Pessoa Livre', cargo: 'Diretor', fonte_url: FONTE, email: 'livre@x.com', email_status: 'valid' },
      ],
    });
    const c = paraContatoEnriquecido(l, new Set(['barrada@x.com', 'bloqueado@x.com']));
    expect(c.responsaveis.map((p) => p.nome)).toEqual(['Pessoa Livre']);
    expect(c.emails).toEqual(['secretaria@x.com']);
  });

  it('linha JÁ gravada com o mesmo número em vários ramais sai com um número só (a de produção tinha 10)', () => {
    const t = (numero: string) => ({ numero, rotulo: '', fonte_url: FONTE });
    const l = linhaContato('1', { telefones: [t('(19) 2138-8300'), t('(19) 2138-8300, ramal 1000'), t('(19) 2138-8300, ramais 1700 e 1703'), t('(19) 3303-1250')], whatsapp: [] });
    expect(paraContatoEnriquecido(l, new Set()).telefones).toEqual(['(19) 2138-8300', '(19) 3303-1250']);
  });

  it('nome vindo do Hunter leva a fonte no cargo; WhatsApp sai rotulado junto dos telefones', () => {
    const l = linhaContato('1', {
      whatsapp: [{ numero: '(19) 99999-0000', rotulo: '', fonte_url: FONTE }],
      responsaveis: [{ nome: 'Jorge Alves', cargo: 'Diretor', fonte_url: null, email: 'j@x.com', email_status: 'valid', email_origem: 'hunter_domain' }],
    });
    const c = paraContatoEnriquecido(l, new Set());
    expect(c.responsaveis[0].cargo).toBe('Diretor (fonte: Hunter)');
    expect(c.telefones).toEqual(['(19) 3251-0000', '(19) 99999-0000 (WhatsApp)']);
  });

  it('exportação lê só a linha VIGENTE, paginada e ordenada', async () => {
    contatos = [linhaContato('35000001'), linhaContato('35000002')];
    const r = await contatosParaExportacao(sb.client, AGORA, new Set());
    expect([...r.mapa.keys()]).toEqual(['35000001', '35000002']);
    const gt = sb.chamadas.find((c) => c.tabela === 'mercado_escola_contatos' && c.metodo === 'gt');
    expect(gt!.args).toEqual(['expira_em', AGORA.toISOString()]);
    expect(sb.usou('mercado_escola_contatos', 'order', 'codigo_inep')).toBe(true);
    expect(sb.usou('mercado_escola_contatos', 'range')).toBe(true);
  });

  it('suprimirEmail grava em minúsculas, tira a pessoa de toda linha e conta as escolas; e-mail inválido é recusado', async () => {
    contatos = [
      linhaContato('1', { responsaveis: [{ nome: 'Quem Saiu', cargo: 'Diretor', fonte_url: FONTE, email: 'saiu@x.com', email_status: 'valid' }, { nome: 'Fica Aqui', cargo: 'Diretor', fonte_url: FONTE, email: 'fica@x.com', email_status: 'valid' }] }),
      linhaContato('2', { responsaveis: [{ nome: 'Outra Escola', cargo: 'Diretor', fonte_url: FONTE, email: 'outra@x.com', email_status: 'valid' }] }),
      linhaContato('3', { responsaveis: [{ nome: 'Quem Saiu', cargo: 'Diretor', fonte_url: FONTE, email: 'SAIU@x.com', email_status: 'valid' }] }),
    ];
    const r = await suprimirEmail(sb.client, '  Saiu@X.com ', 'pediu por e-mail', 'rodrigo@vertho.ai');
    expect(r).toEqual({ ok: true, escolas: 2 });
    const grav = sb.escritas.find((e) => e.tabela === 'mercado_contatos_supressao');
    expect(grav!.payload).toEqual({ email: 'saiu@x.com', motivo: 'pediu por e-mail', criado_por: 'rodrigo@vertho.ai' });
    const atualizados = sb.escritas.filter((e) => e.tabela === 'mercado_escola_contatos' && e.op === 'update');
    expect(atualizados).toHaveLength(2);
    expect(atualizados[0].payload.responsaveis.map((p: any) => p.nome)).toEqual(['Fica Aqui']);

    sb.reset();
    for (const ruim of ['sem-arroba', '', 'a@b', 'x'.repeat(200) + '@a.com']) {
      const e = await suprimirEmail(sb.client, ruim, null, 'rodrigo@vertho.ai');
      expect(e.ok, ruim).toBe(false);
    }
    expect(sb.escritas).toHaveLength(0);
  });

  it('suprimir falha alto se não conseguir gravar a lista', async () => {
    sb.falharEm({ tabela: 'mercado_contatos_supressao', op: 'upsert', mensagem: 'caiu' });
    const r = await suprimirEmail(sb.client, 'a@b.com', null, 'rodrigo@vertho.ai');
    expect(r.ok).toBe(false);
    expect(sb.escritas.filter((e) => e.tabela === 'mercado_escola_contatos')).toHaveLength(0);
  });
});
