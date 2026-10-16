import { buscarNaWeb, type ResultadoBusca } from './busca-web';
import type { ClienteHunter } from './hunter';
import {
  CARGO_DECISOR, CUSTO_BUSCA_USD, HUNTER_COMPLETAVEL, PROVEDORES_GRATIS, VALIDADE_DIAS, dominioRegistravel, nivelDe, nomeParaBusca,
  type EscolaAlvo, type HunterStatus, type ItemResponsavel, type LinhaContato,
} from './tipos';
import { buscarPaginaPublica, conferirResultado, type BuscaPagina, type ResultadoConferido } from './verificar';

/**
 * Enriquece UMA escola e devolve a linha pronta para gravar. Núcleo sem gate, sem sessão e sem banco: a
 * action aplica o gate e a persistência; aqui entram só dependências injetadas (por isso é testável).
 *
 * O Hunter é a etapa que pode faltar (plano Free: 50 créditos/mês). Quando falta, a busca web JÁ GRAVADA
 * fica e a linha sai com `hunter_status` 'sem_creditos' ou 'indisponivel': completar depois só roda o
 * Hunter, sem pagar a busca de novo (`previo`). Sem log com nome ou e-mail.
 */

/** Saldo de créditos do Hunter, compartilhado pelas escolas do mesmo lote. `creditos: null` = não sei (a chamada acusa). */
export interface OrcamentoHunter { creditos: number | null; reserva: number }

export interface Dependencias {
  buscar?: (e: EscolaAlvo) => Promise<ResultadoBusca>;
  buscarPagina?: BuscaPagina;
  hunter: ClienteHunter | null;
  orcamento: OrcamentoHunter;
  /** E-mails que pediram para não ser contatados (minúsculos). */
  supressao: ReadonlySet<string>;
  agora?: () => Date;
}

export const RESERVA_CREDITOS_HUNTER = 3;

/**
 * O saldo é compartilhado pelas escolas do lote, que rodam EM PARALELO: conferir e só descontar depois da chamada
 * deixaria todas passarem pela mesma checagem. Por isso o custo é RESERVADO antes do `await` (JS é de uma thread só:
 * conferir e descontar no mesmo trecho síncrono não tem corrida) e DEVOLVIDO quando o Hunter não cobrou
 * (erro, ou "não achou": só e-mail achado e busca com resultado cobram).
 */
const reservar = (o: OrcamentoHunter, custo: number): boolean => {
  if (o.creditos == null) return true;
  if (o.creditos - custo < o.reserva) return false;
  o.creditos -= custo;
  return true;
};
const devolver = (o: OrcamentoHunter, custo: number) => { if (o.creditos != null) o.creditos += custo; };

function observacaoDe(d: ResultadoConferido['descartados']): string | null {
  const partes = [
    d.telefones && `telefones ${d.telefones}`, d.emails && `e-mails ${d.emails}`, d.whatsapp && `WhatsApp ${d.whatsapp}`, d.nomes && `nomes ${d.nomes}`,
    d.agregador && `fonte que não vale ${d.agregador}`, d.naoVerificados && `não conferidos ${d.naoVerificados}`,
  ].filter(Boolean);
  return partes.length ? `Descartados na conferência: ${partes.join(', ')}.` : null;
}

/** Domínio de e-mail da escola: o mais frequente entre os e-mails confirmados, senão o do site. Provedor gratuito não vale. */
export function dominioDaEscola(l: Pick<LinhaContato, 'emails' | 'site'>): string | null {
  const freq = new Map<string, number>();
  for (const e of l.emails) {
    const d = dominioRegistravel(e.endereco);
    if (d && !PROVEDORES_GRATIS.has(d)) freq.set(d, (freq.get(d) ?? 0) + 1);
  }
  const doEmail = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (doEmail) return doEmail;
  const doSite = dominioRegistravel(l.site);
  return doSite && !PROVEDORES_GRATIS.has(doSite) ? doSite : null;
}

async function etapaHunter(l: LinhaContato, deps: Dependencias): Promise<void> {
  const decisores = l.responsaveis
    .filter((p) => CARGO_DECISOR.test(p.cargo))
    .sort((a, b) => Number(/geral|presiden/i.test(b.cargo)) - Number(/geral|presiden/i.test(a.cargo)))
    .slice(0, 2);
  const dominio = dominioDaEscola(l);
  if (!dominio) { l.hunter_status = 'sem_nomes'; return; }
  if (!deps.hunter) { l.hunter_status = 'indisponivel'; return; }
  const { hunter, orcamento, supressao } = deps;
  let status: HunterStatus = 'ok';
  const registrar = (p: ItemResponsavel, email: string, st: string | null, score: number | null, origem: 'hunter_finder' | 'hunter_domain') => {
    p.email = email; p.email_status = st; p.email_score = score; p.email_origem = origem;
  };
  /** Verifica (0,5 crédito) só quando a resposta não trouxe status: o piloto gastou 21 de 46 créditos aqui. */
  const completarStatus = async (p: ItemResponsavel) => {
    if (!p.email || p.email_status || !reservar(orcamento, 0.5)) return;
    const v = await hunter.verificar(p.email);
    if (v.erro) { devolver(orcamento, 0.5); status = v.erro; return; }
    p.email_status = v.status; l.hunter_creditos += 0.5;
  };

  if (decisores.length) {
    for (const p of decisores) {
      if (!reservar(orcamento, 1)) { status = 'sem_creditos'; break; }
      const r = await hunter.emailFinder(dominio, nomeParaBusca(p.nome));
      if (r.erro) { devolver(orcamento, 1); status = r.erro; break; }
      if (!r.email) { devolver(orcamento, 1); continue; }
      // O Finder cobra 1 crédito por e-mail achado, inclusive o de quem pediu para sair (que não é registrado).
      l.hunter_creditos += 1;
      // Quem pediu para sair some por INTEIRO: tirar só o e-mail deixaria nome e cargo na planilha.
      if (supressao.has(r.email)) { l.responsaveis.splice(l.responsaveis.indexOf(p), 1); continue; }
      registrar(p, r.email, r.status, r.score, 'hunter_finder');
      await completarStatus(p);
      if (status !== 'ok') break;
    }
  } else if (!reservar(orcamento, 1)) {
    status = 'sem_creditos';
  } else {
    const r = await hunter.domainSearch(dominio);
    if (r.erro) { devolver(orcamento, 1); status = r.erro; }
    else {
      if (r.pessoas.length) l.hunter_creditos += 1; else devolver(orcamento, 1);
      const achadas = r.pessoas
        .filter((x) => x.cargo && CARGO_DECISOR.test(x.cargo) && !supressao.has(x.email) && x.status !== 'invalid')
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 2);
      for (const x of achadas) {
        const p: ItemResponsavel = { nome: x.nome ?? '', cargo: x.cargo ?? '', fonte_url: null };
        registrar(p, x.email, x.status, x.score, 'hunter_domain');
        l.responsaveis.push(p);
        await completarStatus(p);
        if (status !== 'ok') break;
      }
    }
  }
  l.hunter_status = status;
}

export async function enriquecerEscola(
  e: EscolaAlvo, solicitadoPor: string, deps: Dependencias, previo?: LinhaContato | null,
): Promise<{ linha: LinhaContato; rodouBusca: boolean }> {
  const agora = (deps.agora ?? (() => new Date()))();
  const vigente = !!previo && new Date(previo.expira_em) > agora;
  if (vigente && !HUNTER_COMPLETAVEL.includes(previo!.hunter_status)) return { linha: previo!, rodouBusca: false };

  let linha: LinhaContato;
  let rodouBusca = false;
  if (vigente) {
    // Já tem a busca web gravada: só falta o Hunter. Cópia funda, para não mexer no objeto de quem chamou.
    linha = JSON.parse(JSON.stringify(previo));
  } else {
    const bruto = await (deps.buscar ?? buscarNaWeb)(e);
    const c = await conferirResultado(bruto, deps.buscarPagina ?? buscarPaginaPublica);
    linha = {
      codigo_inep: e.codigo_inep, site: c.site, site_confere_endereco: c.siteConfere,
      telefones: c.telefones, emails: c.emails, whatsapp: c.whatsapp, responsaveis: c.responsaveis,
      nivel: null, hunter_status: 'a_completar', observacao: observacaoDe(c.descartados),
      custo_usd: CUSTO_BUSCA_USD, hunter_creditos: 0, coletado_por: solicitadoPor,
      coletado_em: agora.toISOString(), expira_em: new Date(agora.getTime() + VALIDADE_DIAS * 86_400_000).toISOString(),
    };
    rodouBusca = true;
  }
  await etapaHunter(linha, deps);
  linha.nivel = nivelDe(linha);
  return { linha, rodouBusca };
}
