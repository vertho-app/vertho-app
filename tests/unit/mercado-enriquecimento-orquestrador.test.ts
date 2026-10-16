import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultadoBusca } from '@/lib/mercado-potencial/enriquecimento/busca-web';
import { dominioDaEscola, enriquecerEscola, RESERVA_CREDITOS_HUNTER, type Dependencias } from '@/lib/mercado-potencial/enriquecimento/enriquecer';
import type { ClienteHunter } from '@/lib/mercado-potencial/enriquecimento/hunter';
import { type EscolaAlvo, type LinhaContato } from '@/lib/mercado-potencial/enriquecimento/tipos';
import { paginaDeHtml, type BuscaPagina } from '@/lib/mercado-potencial/enriquecimento/verificar';

/**
 * Orquestrador por escola: busca → conferência → Hunter → linha. Dependências injetadas (nada de rede, banco
 * ou modelo). As garantias que cada teste prova: só dado CONFIRMADO grava; só decisor vai ao Hunter; o Hunter
 * faltando não perde a busca paga; refazer só roda o que falta; quem pediu para sair não volta.
 */

const AGORA = new Date('2026-10-16T15:00:00.000Z');
const ESCOLA: EscolaAlvo = { codigo_inep: '35000001', nome: 'Colégio Exemplo', municipio: 'Campinas', uf: 'SP', endereco: 'Rua A, 10', bairro: 'Centro', cep: '13000000' };
const FONTE = 'https://www.colegioexemplo.com.br/quem-somos';
const PAGINA = paginaDeHtml('<p>Diretora Geral Maria Lima. Coordenador Pedro Souza. Professora Ana Costa. (19) 3251-0000 secretaria@colegioexemplo.com.br</p>');
const web: BuscaPagina = async (url) => (url === FONTE ? PAGINA : { tipo: 'inacessivel' });

function resultado(parcial: Partial<ResultadoBusca> = {}): ResultadoBusca {
  return {
    escola_identificada: 'Colégio Exemplo', site_oficial: 'https://www.colegioexemplo.com.br', site_confere_com_endereco: true,
    telefones: [{ numero: '(19) 3251-0000', rotulo: 'Secretaria', fonte_url: FONTE }],
    emails: [{ endereco: 'secretaria@colegioexemplo.com.br', rotulo: 'Secretaria', fonte_url: FONTE }],
    whatsapp: [], responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE }], observacoes: '', ...parcial,
  };
}

/** Hunter de mentira que registra cada chamada. */
function hunterFalso(sobre: Partial<ClienteHunter> = {}) {
  const chamadas = { finder: [] as Array<[string, string]>, domain: [] as string[], verificar: [] as string[] };
  const base: ClienteHunter = {
    creditos: async () => 40,
    emailFinder: async (d, n) => ({ email: `${n.split(' ')[0].toLowerCase()}@${d}`, score: 90, status: 'valid' }),
    domainSearch: async () => ({ pessoas: [] }),
    verificar: async () => ({ status: 'valid' }),
    ...sobre,
  };
  // O registro das chamadas envolve QUALQUER implementação (a padrão ou a programada pelo teste).
  const h: ClienteHunter = {
    creditos: base.creditos,
    emailFinder: async (d, n) => { chamadas.finder.push([d, n]); return base.emailFinder(d, n); },
    domainSearch: async (d) => { chamadas.domain.push(d); return base.domainSearch(d); },
    verificar: async (e) => { chamadas.verificar.push(e); return base.verificar(e); },
  };
  return { h, chamadas };
}

function deps(parcial: Partial<Dependencias> & { busca?: ResultadoBusca } = {}): Dependencias & { buscar: ReturnType<typeof vi.fn> } {
  const buscar = vi.fn(async () => parcial.busca ?? resultado());
  return {
    buscar, buscarPagina: web, hunter: hunterFalso().h, orcamento: { creditos: 40, reserva: RESERVA_CREDITOS_HUNTER },
    supressao: new Set(), agora: () => AGORA, ...parcial,
  } as any;
}

let espioes: Array<ReturnType<typeof vi.spyOn>> = [];
beforeEach(() => { espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {})); });
afterEach(() => {
  // Nome e e-mail de pessoa não vão para o log em NENHUM teste deste arquivo.
  for (const e of espioes) for (const args of e.mock.calls) expect(JSON.stringify(args)).not.toMatch(/Maria Lima|Pedro Souza|@colegioexemplo/i);
  espioes.forEach((e) => e.mockRestore());
});

describe('só o dado CONFIRMADO grava', () => {
  it('nome inventado (que a página citada não contém) é descartado e contado, sem o nome', async () => {
    const busca = resultado({ responsaveis: [
      { nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE },
      { nome: 'Carlos Inventado Prado', cargo: 'Diretor', fonte_url: FONTE },
    ] });
    const { linha } = await enriquecerEscola(ESCOLA, 'rodrigo@vertho.ai', deps({ busca }));
    expect(linha.responsaveis.map((p) => p.nome)).toEqual(['Maria Lima']);
    expect(linha.observacao).toContain('nomes 1');
    expect(linha.observacao).not.toContain('Carlos');
  });

  it('a linha sai completa: INEP, quem pediu, custo da busca, validade de 180 dias e nível', async () => {
    const { linha, rodouBusca } = await enriquecerEscola(ESCOLA, 'rodrigo@vertho.ai', deps());
    expect(rodouBusca).toBe(true);
    expect(linha).toMatchObject({ codigo_inep: '35000001', coletado_por: 'rodrigo@vertho.ai', custo_usd: 0.09, nivel: 'A', site: 'https://www.colegioexemplo.com.br' });
    expect(new Date(linha.expira_em).getTime() - new Date(linha.coletado_em).getTime()).toBe(180 * 86_400_000);
    expect(linha.coletado_em).toBe(AGORA.toISOString());
  });

  it('o endereço do Censo vai para a busca (separa homônimos e unidades)', async () => {
    const d = deps();
    await enriquecerEscola(ESCOLA, 'a@vertho.ai', d);
    expect(d.buscar).toHaveBeenCalledWith(expect.objectContaining({ endereco: 'Rua A, 10', cep: '13000000' }));
  });
});

describe('só decisor vai ao Hunter', () => {
  it('professora, secretária e outros cargos NÃO são enviados; o decisor é, sem honorífico e com o domínio da escola', async () => {
    const busca = resultado({ responsaveis: [
      { nome: 'Ana Costa', cargo: 'Professora de Matemática', fonte_url: FONTE },
      { nome: 'Pedro Souza', cargo: 'Coordenador Pedagógico', fonte_url: FONTE },
      { nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE },
    ] });
    const { h, chamadas } = hunterFalso();
    const { linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ busca, hunter: h }));
    const enviados = chamadas.finder.map(([, n]) => n);
    expect(enviados).not.toContain('Ana Costa');
    expect(enviados[0]).toBe('Maria Lima');             // diretor geral primeiro
    expect(enviados).toHaveLength(2);                    // no máximo 2 por escola
    expect(chamadas.finder.every(([d]) => d === 'colegioexemplo.com.br')).toBe(true);
    expect(linha.responsaveis.find((p) => p.nome === 'Ana Costa')?.email).toBeUndefined();
    expect(linha.responsaveis.find((p) => p.nome === 'Maria Lima')).toMatchObject({ email: 'maria@colegioexemplo.com.br', email_status: 'valid', email_origem: 'hunter_finder' });
    expect(linha.hunter_status).toBe('ok');
  });

  it('honorífico sai do nome enviado ao Hunter ("Pe. João Alves" → "João Alves")', async () => {
    const pg = paginaDeHtml('<p>Pe. João Alves, diretor geral. secretaria@colegioexemplo.com.br</p>');
    const { h, chamadas } = hunterFalso();
    await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({
      busca: resultado({ telefones: [], responsaveis: [{ nome: 'Pe. João Alves', cargo: 'Diretor Geral', fonte_url: FONTE }] }),
      buscarPagina: async () => pg, hunter: h,
    }));
    expect(chamadas.finder[0][1]).toBe('João Alves');
  });

  it('sem decisor nomeado, o Domain Search traz só quem tem cargo de decisor e e-mail não inválido, marcando a origem', async () => {
    const busca = resultado({ responsaveis: [] });
    const { h, chamadas } = hunterFalso({
      domainSearch: async (d) => ({ pessoas: [
        { email: 'diretor@colegioexemplo.com.br', nome: 'Jorge Alves', cargo: 'Diretor', score: 80, status: 'valid' },
        { email: 'prof@colegioexemplo.com.br', nome: 'Paulo Reis', cargo: 'Professor', score: 99, status: 'valid' },
        { email: 'morto@colegioexemplo.com.br', nome: 'Rui Dias', cargo: 'Diretor Financeiro', score: 70, status: 'invalid' },
      ] }),
    });
    const { linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ busca, hunter: h }));
    expect(chamadas.finder).toHaveLength(0);
    expect(chamadas.domain).toEqual(['colegioexemplo.com.br']);
    expect(linha.responsaveis.map((p) => p.nome)).toEqual(['Jorge Alves']);
    expect(linha.responsaveis[0]).toMatchObject({ email_origem: 'hunter_domain', fonte_url: null, email_status: 'valid' });
  });
});

describe('domínio da escola', () => {
  it('provedor gratuito e plataforma de site NÃO servem de domínio: o Hunter nem é chamado', async () => {
    const busca = resultado({
      site_oficial: 'https://escolax.wixsite.com/inicio',
      emails: [{ endereco: 'escolax@gmail.com', rotulo: 'a', fonte_url: FONTE }],
      telefones: [], responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE }],
    });
    const { h, chamadas } = hunterFalso();
    const pg = paginaDeHtml('Maria Lima escolax@gmail.com');
    const { linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ busca, hunter: h, buscarPagina: async () => pg }));
    expect(chamadas.finder).toHaveLength(0);
    expect(chamadas.domain).toHaveLength(0);
    expect(linha.hunter_status).toBe('sem_nomes');
  });

  it('prefere o domínio mais frequente entre os e-mails confirmados; cai no do site se não houver e-mail', () => {
    const e = (endereco: string) => ({ endereco, rotulo: '', fonte_url: '' });
    expect(dominioDaEscola({ site: 'https://outro.com.br', emails: [e('a@escola.com.br'), e('b@escola.com.br'), e('c@gmail.com')] })).toBe('escola.com.br');
    expect(dominioDaEscola({ site: 'https://www.escola.com.br', emails: [] })).toBe('escola.com.br');
    expect(dominioDaEscola({ site: null, emails: [e('x@hotmail.com')] })).toBeNull();
  });
});

describe('o Hunter pode faltar sem perder a busca já paga', () => {
  it('sem créditos (saldo abaixo da reserva): a busca web fica, o status diz por quê e o Hunter não é chamado', async () => {
    const { h, chamadas } = hunterFalso();
    const { linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ hunter: h, orcamento: { creditos: RESERVA_CREDITOS_HUNTER, reserva: RESERVA_CREDITOS_HUNTER } }));
    expect(linha.hunter_status).toBe('sem_creditos');
    expect(linha.telefones).toHaveLength(1);
    expect(linha.nivel).toBe('A');
    expect(chamadas.finder).toHaveLength(0);
  });

  it('sem chave (hunter null): "indisponivel", com a busca web gravada', async () => {
    const { linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ hunter: null }));
    expect(linha.hunter_status).toBe('indisponivel');
    expect(linha.emails).toHaveLength(1);
  });

  it('o Hunter respondeu 402 no meio: para, grava "sem_creditos" e mantém o que já achou', async () => {
    const busca = resultado({ responsaveis: [
      { nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE },
      { nome: 'Pedro Souza', cargo: 'Coordenador', fonte_url: FONTE },
    ] });
    let n = 0;
    const { h } = hunterFalso({ emailFinder: async (d, nome) => (++n === 1 ? { email: `maria@${d}`, score: 90, status: 'valid' } : { email: null, score: null, status: null, erro: 'sem_creditos' }) });
    const { linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ busca, hunter: h }));
    expect(linha.hunter_status).toBe('sem_creditos');
    expect(linha.responsaveis.find((p) => p.nome === 'Maria Lima')?.email).toBe('maria@colegioexemplo.com.br');
    expect(linha.responsaveis.find((p) => p.nome === 'Pedro Souza')?.email).toBeUndefined();
  });

  it('o saldo é compartilhado: duas escolas seguidas não passam da reserva', async () => {
    const { h, chamadas } = hunterFalso({ emailFinder: async (d, n) => ({ email: `${n.split(' ')[0].toLowerCase()}@${d}`, score: 90, status: 'valid' }) });
    const orcamento = { creditos: 4, reserva: RESERVA_CREDITOS_HUNTER };
    const a = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ hunter: h, orcamento }));
    const b = await enriquecerEscola({ ...ESCOLA, codigo_inep: '35000002' }, 'a@vertho.ai', deps({ hunter: h, orcamento }));
    expect(a.linha.hunter_status).toBe('ok');
    expect(b.linha.hunter_status).toBe('sem_creditos');
    expect(chamadas.finder).toHaveLength(1);
    expect(orcamento.creditos).toBeGreaterThanOrEqual(RESERVA_CREDITOS_HUNTER);
  });

  it('o Hunter não cobra quando não acha (ou erra): o crédito reservado volta ao saldo', async () => {
    const orcamento = { creditos: 40, reserva: RESERVA_CREDITOS_HUNTER };
    const naoAchou = hunterFalso({ emailFinder: async () => ({ email: null, score: null, status: null }) });
    const a = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ hunter: naoAchou.h, orcamento }));
    expect(a.linha.hunter_creditos).toBe(0);
    expect(orcamento.creditos).toBe(40);

    const caiu = hunterFalso({ emailFinder: async () => ({ email: null, score: null, status: null, erro: 'indisponivel' as const }) });
    const b = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ hunter: caiu.h, orcamento }));
    expect(b.linha.hunter_status).toBe('indisponivel');
    expect(orcamento.creditos).toBe(40);
  });

  it('só verifica (0,5 crédito) quando a resposta NÃO trouxe o status', async () => {
    const { h, chamadas } = hunterFalso({ emailFinder: async (d) => ({ email: `maria@${d}`, score: 70, status: null }) });
    const { linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ hunter: h }));
    expect(chamadas.verificar).toEqual(['maria@colegioexemplo.com.br']);
    expect(linha.responsaveis[0].email_status).toBe('valid');
    expect(linha.hunter_creditos).toBe(1.5);

    const com = hunterFalso();
    const r2 = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ hunter: com.h }));
    expect(com.chamadas.verificar).toHaveLength(0);
    expect(r2.linha.hunter_creditos).toBe(1);
  });
});

describe('refazer só roda o que falta', () => {
  function previo(parcial: Partial<LinhaContato> = {}): LinhaContato {
    return {
      codigo_inep: '35000001', site: 'https://www.colegioexemplo.com.br', site_confere_endereco: true,
      telefones: [{ numero: '(19) 3251-0000', rotulo: 's', fonte_url: FONTE }], emails: [{ endereco: 'secretaria@colegioexemplo.com.br', rotulo: 's', fonte_url: FONTE }],
      whatsapp: [], responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE }], nivel: 'A', hunter_status: 'sem_creditos',
      observacao: null, custo_usd: 0.09, hunter_creditos: 0, coletado_por: 'a@vertho.ai',
      coletado_em: '2026-10-01T12:00:00.000Z', expira_em: '2027-03-30T12:00:00.000Z', ...parcial,
    };
  }

  it('linha vigente com o Hunter pendente: NÃO refaz a busca; só completa o Hunter e preserva coletado_em', async () => {
    const d = deps();
    const original = previo();
    const { linha, rodouBusca } = await enriquecerEscola(ESCOLA, 'outro@vertho.ai', d, original);
    expect(rodouBusca).toBe(false);
    expect(d.buscar).not.toHaveBeenCalled();
    expect(linha.hunter_status).toBe('ok');
    expect(linha.coletado_em).toBe('2026-10-01T12:00:00.000Z');
    expect(linha.coletado_por).toBe('a@vertho.ai');
    expect(linha.responsaveis[0].email).toBe('maria@colegioexemplo.com.br');
    expect(original.hunter_status).toBe('sem_creditos');          // o objeto de quem chamou não foi mexido
    expect(original.responsaveis[0].email).toBeUndefined();
  });

  it('linha vigente e pronta: devolve a MESMA linha, sem busca e sem Hunter', async () => {
    const { h, chamadas } = hunterFalso();
    const d = deps({ hunter: h });
    const pronta = previo({ hunter_status: 'ok' });
    const { linha, rodouBusca } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', d, pronta);
    expect(linha).toBe(pronta);
    expect(rodouBusca).toBe(false);
    expect(d.buscar).not.toHaveBeenCalled();
    expect(chamadas.finder).toHaveLength(0);
  });

  it('"sem_nomes" também é um resultado final: não repete', async () => {
    const d = deps();
    const { rodouBusca } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', d, previo({ hunter_status: 'sem_nomes' }));
    expect(rodouBusca).toBe(false);
    expect(d.buscar).not.toHaveBeenCalled();
  });

  it('linha VENCIDA refaz a busca (o dado pessoal não passa dos 180 dias)', async () => {
    const d = deps();
    const { rodouBusca, linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', d, previo({ expira_em: '2026-10-15T00:00:00.000Z', hunter_status: 'ok' }));
    expect(rodouBusca).toBe(true);
    expect(d.buscar).toHaveBeenCalledTimes(1);
    expect(linha.coletado_em).toBe(AGORA.toISOString());
  });
});

describe('quem pediu para sair não volta', () => {
  it('e-mail na supressão que o Hunter devolve (Finder) não é registrado, mas o crédito que ele cobrou entra na conta', async () => {
    const { h } = hunterFalso({ emailFinder: async (d) => ({ email: `maria@${d}`, score: 90, status: 'valid' }) });
    const orcamento = { creditos: 40, reserva: RESERVA_CREDITOS_HUNTER };
    const { linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ hunter: h, orcamento, supressao: new Set(['maria@colegioexemplo.com.br']) }));
    // Sai por INTEIRO: tirar só o e-mail deixaria nome e cargo da pessoa na planilha.
    expect(linha.responsaveis.map((p) => p.nome)).not.toContain('Maria Lima');
    expect(JSON.stringify(linha)).not.toMatch(/maria@colegioexemplo/);
    expect(linha.hunter_creditos).toBe(1);
    expect(orcamento.creditos).toBe(39);
  });

  it('pessoa suprimida vinda do Domain Search não entra na lista de responsáveis', async () => {
    const { h } = hunterFalso({ domainSearch: async () => ({ pessoas: [
      { email: 'barrado@colegioexemplo.com.br', nome: 'Jorge Alves', cargo: 'Diretor', score: 90, status: 'valid' },
      { email: 'livre@colegioexemplo.com.br', nome: 'Rita Gomes', cargo: 'Diretora', score: 80, status: 'valid' },
    ] }) });
    const { linha } = await enriquecerEscola(ESCOLA, 'a@vertho.ai', deps({ busca: resultado({ responsaveis: [] }), hunter: h, supressao: new Set(['barrado@colegioexemplo.com.br']) }));
    expect(linha.responsaveis.map((p) => p.nome)).toEqual(['Rita Gomes']);
  });
});
