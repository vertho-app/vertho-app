import { fetchTextoPublico } from '@/lib/fetch-texto-publico';
import type { ResultadoBusca } from './busca-web';
import { colapsarRamais, finalDoTelefone, soDigitos, type ItemEmail, type ItemResponsavel, type ItemTelefone } from './tipos';

/**
 * Conferência SEM modelo: cada telefone, e-mail e nome que a busca devolveu é procurado na página que ela
 * mesma citou. Só o que aparece lá é gravado. O defeito que isto fecha foi MEDIDO no piloto de Campinas: de
 * 159 dados conferíveis, 4 (2,5%) não estavam na página citada, entre eles dois nomes de direção atribuídos a
 * uma página que não os continha (328 KB, lida inteira). Ausência NÃO prova invenção (site que monta o texto
 * por JavaScript também cai aqui), então "ausente", "PDF" e "inacessível" ficam FORA do banco.
 *
 * A leitura da página passa por `fetchTextoPublico`: a URL vem de um modelo (texto não confiável), então a
 * guarda anti-SSRF vale em todo salto de redirecionamento, com teto de bytes e de tempo.
 */

export type Pagina = { tipo: 'ok'; texto: string; bruto: string } | { tipo: 'pdf' } | { tipo: 'inacessivel' };
export type BuscaPagina = (url: string) => Promise<Pagina>;

/** Diretórios, agregadores, mapas e redes: não valem como fonte de contato (a busca é instruída a não usá-los). */
const HOSTS_QUE_NAO_VALEM = [
  'escol.as', 'melhorescola.com.br', 'querobolsa.com.br', 'apontador.com.br', 'telelistas.net', 'guiamais.com.br',
  'cnpj.biz', 'casadosdados.com.br', 'cnpja.com', 'econodata.com.br', 'guiapj.com.br', 'solutudo.com.br',
  'google.com', 'goo.gl', 'maps.app.goo.gl', 'linkedin.com', 'zoominfo.com', 'getwherenext.com', 'searchassociates.com',
];

export function hostNaoVale(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return HOSTS_QUE_NAO_VALEM.some((x) => h === x || h.endsWith(`.${x}`));
  } catch { return true; }
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Do HTML bruto: o texto visível (sem script, estilo e tags) e o bruto com `&#64;` virando `@`. */
export function paginaDeHtml(html: string): Pagina {
  const bruto = html.replace(/&#0*64;|&#x0*40;|&commat;/gi, '@');
  const texto = bruto
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
  return { tipo: 'ok', texto, bruto };
}

/** Leitura real de uma página (anti-SSRF, 2 MB, 12 s). A do Sagrado Coração tinha 328 KB: 1 MB seria curto demais para sites grandes. */
export const buscarPaginaPublica: BuscaPagina = async (url) => {
  if (/\.pdf(\?|#|$)/i.test(url)) return { tipo: 'pdf' };
  const r = await fetchTextoPublico(url, { maxBytes: 2_000_000, accept: 'text/html,application/xhtml+xml', timeoutMs: 12_000 });
  if (!r) return { tipo: 'inacessivel' };
  if (r.texto.startsWith('%PDF')) return { tipo: 'pdf' };
  return paginaDeHtml(r.texto);
};

export function confirmaEmail(pg: Extract<Pagina, { tipo: 'ok' }>, email: string): boolean {
  const e = email.toLowerCase();
  return pg.texto.toLowerCase().includes(e) || pg.bruto.toLowerCase().includes(e);
}

/**
 * Telefone: os 8 últimos dígitos, sem ramal ("ramal 1000" colado no número quebrava a conferência), no texto
 * visível, no HTML bruto contíguo (`wa.me/55…`, `tel:+55…`) ou com um separador entre os dois blocos de 4.
 */
export function confirmaTelefone(pg: Extract<Pagina, { tipo: 'ok' }>, numero: string): boolean {
  const f = finalDoTelefone(numero);
  if (f.length !== 8) return false;
  if (soDigitos(pg.texto).includes(f)) return true;
  return pg.bruto.includes(f) || new RegExp(`${f.slice(0, 4)}[^0-9]{0,3}${f.slice(4)}`).test(pg.bruto);
}

/**
 * Nome completo, ou primeiro e último nome (com 2 ou mais partes), sem acento. Um nome de UMA palavra só não
 * identifica ninguém (qualquer "Maria" da página o confirmaria), então não confirma.
 */
export function confirmaNome(pg: Extract<Pagina, { tipo: 'ok' }>, nome: string): boolean {
  const t = semAcento(pg.texto);
  const n = semAcento(nome);
  if (n.includes(' ') && t.includes(n)) return true;
  const partes = n.split(' ').filter((x) => x.length > 2);
  return partes.length >= 2 && t.includes(partes[0]) && t.includes(partes[partes.length - 1]);
}

export interface ResultadoConferido {
  site: string | null;
  siteConfere: boolean;
  telefones: ItemTelefone[];
  emails: ItemEmail[];
  whatsapp: ItemTelefone[];
  responsaveis: ItemResponsavel[];
  /** Contagens, nunca o dado: vão para a coluna `observacao` e não carregam nome nem e-mail. */
  descartados: { telefones: number; emails: number; whatsapp: number; nomes: number; agregador: number; naoVerificados: number };
}

/** Páginas distintas lidas por escola: a leitura é paga em tempo, e o resto do site raramente muda o resultado. */
const MAX_PAGINAS = 8;

export async function conferirResultado(r: ResultadoBusca, buscar: BuscaPagina): Promise<ResultadoConferido> {
  const urls: string[] = [];
  const todas = [...r.telefones, ...r.emails, ...r.whatsapp, ...r.responsaveis];
  for (const x of todas) if (!hostNaoVale(x.fonte_url) && !urls.includes(x.fonte_url)) urls.push(x.fonte_url);
  const lidas = urls.slice(0, MAX_PAGINAS);
  const paginas = new Map<string, Pagina>();
  await Promise.all(lidas.map(async (u) => {
    try { paginas.set(u, await buscar(u)); } catch { paginas.set(u, { tipo: 'inacessivel' }); }
  }));

  const d = { telefones: 0, emails: 0, whatsapp: 0, nomes: 0, agregador: 0, naoVerificados: 0 };
  /** 'sim' confirmou; 'nao' a página abriu e o dado não está lá; 'sem' não deu para conferir (ou fonte que não vale). */
  const confere = (url: string, f: (pg: Extract<Pagina, { tipo: 'ok' }>) => boolean, contador: 'telefones' | 'emails' | 'whatsapp' | 'nomes'): boolean => {
    if (hostNaoVale(url)) { d.agregador++; return false; }
    const pg = paginas.get(url);
    if (!pg || pg.tipo !== 'ok') { d.naoVerificados++; return false; }
    if (f(pg)) return true;
    d[contador]++;
    return false;
  };

  const telefones = r.telefones.filter((t) => confere(t.fonte_url, (pg) => confirmaTelefone(pg, t.numero), 'telefones'));
  const whatsapp = r.whatsapp.filter((t) => confere(t.fonte_url, (pg) => confirmaTelefone(pg, t.numero), 'whatsapp'));
  const emails = r.emails.filter((e) => confere(e.fonte_url, (pg) => confirmaEmail(pg, e.endereco), 'emails'));
  const vistos = new Set<string>();
  const responsaveis: ItemResponsavel[] = r.responsaveis
    .filter((p) => confere(p.fonte_url, (pg) => confirmaNome(pg, p.nome), 'nomes'))
    .filter((p) => { const k = semAcento(p.nome); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((p) => ({ nome: p.nome, cargo: p.cargo, fonte_url: p.fonte_url }));

  const siteOk = !!r.site_oficial && r.site_confere_com_endereco && !hostNaoVale(r.site_oficial);
  return { site: siteOk ? r.site_oficial : null, siteConfere: siteOk, telefones: colapsarRamais(telefones), emails, whatsapp: colapsarRamais(whatsapp), responsaveis, descartados: d };
}
