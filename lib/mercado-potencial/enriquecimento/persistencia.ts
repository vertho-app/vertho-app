import type { ContatoEnriquecido } from '@/lib/mercado-potencial/exportar-xlsx';
import { lerTudoPaginado } from '@/lib/paginacao';
import { colapsarRamais, type LinhaContato } from './tipos';

/**
 * Leitura e escrita de `mercado_escola_contatos` e `mercado_contatos_supressao` (mig 288).
 *
 * O cliente vem DE FORA (da action, que já passou pelo gate e usa o cliente do servidor): o núcleo em `lib/`
 * não cria `createSupabaseAdmin`, que o guard de service-role só permite em lugares declarados. Toda consulta
 * olha o `{ error }` que o supabase-js DEVOLVE (ele não lança). Nada aqui loga nome nem e-mail.
 */

const COLUNAS = 'codigo_inep, site, site_confere_endereco, telefones, emails, whatsapp, responsaveis, nivel, hunter_status, observacao, custo_usd, hunter_creditos, coletado_por, coletado_em, expira_em';

type Cliente = any;

/** Linhas dos INEPs pedidos (vencidas inclusive: quem decide se vale é a validade, `expira_em`). */
export async function lerContatos(sb: Cliente, ineps: string[]): Promise<{ mapa: Map<string, LinhaContato>; erro?: string }> {
  const mapa = new Map<string, LinhaContato>();
  for (let i = 0; i < ineps.length; i += 200) {
    const { data, error } = await sb.from('mercado_escola_contatos').select(COLUNAS).in('codigo_inep', ineps.slice(i, i + 200));
    if (error) return { mapa, erro: error.message };
    for (const l of data || []) mapa.set(l.codigo_inep, l as LinhaContato);
  }
  return { mapa };
}

/** Uma linha por escola, gravada de uma vez (o PostgREST não tem transação). Devolve a mensagem de erro, ou null. */
export async function salvarContato(sb: Cliente, linha: LinhaContato): Promise<string | null> {
  const { error } = await sb.from('mercado_escola_contatos').upsert({ ...linha, atualizado_em: new Date().toISOString() }, { onConflict: 'codigo_inep' });
  return error ? error.message : null;
}

export async function carregarSupressao(sb: Cliente): Promise<{ set: Set<string>; erro?: string }> {
  const r = await lerTudoPaginado((de, ate) => sb.from('mercado_contatos_supressao').select('email').order('email').range(de, ate));
  return { set: new Set((r.data || []).map((x: any) => String(x.email).toLowerCase())), ...(r.error ? { erro: r.error } : {}) };
}

/** Apaga o dado pessoal vencido (a validade é de 180 dias). Chamada a cada lote: dispensa um cron só para isso. */
export async function purgarVencidos(sb: Cliente, agora: Date): Promise<string | null> {
  const { error } = await sb.from('mercado_escola_contatos').delete().lt('expira_em', agora.toISOString());
  return error ? error.message : null;
}

/** A linha do banco no formato da planilha. Só e-mail `valid` sai; quem está na supressão sai por inteiro (nome também). */
export function paraContatoEnriquecido(l: LinhaContato, supressao: ReadonlySet<string>): ContatoEnriquecido {
  const barrado = (email?: string | null) => !!email && supressao.has(email.toLowerCase());
  return {
    site: l.site,
    telefones: [...colapsarRamais(l.telefones || []).map((t) => t.numero), ...colapsarRamais(l.whatsapp || []).map((w) => `${w.numero} (WhatsApp)`)],
    emails: (l.emails || []).filter((e) => !barrado(e.endereco)).map((e) => e.endereco),
    responsaveis: (l.responsaveis || [])
      .filter((p) => !barrado(p.email))
      .map((p) => ({
        nome: p.nome,
        cargo: p.email_origem === 'hunter_domain' ? `${p.cargo} (fonte: Hunter)` : p.cargo,
        email: p.email && p.email_status === 'valid' ? p.email : null,
      })),
  };
}

/**
 * Contatos VIGENTES de todas as escolas já enriquecidas, por INEP. Lê a tabela inteira, paginada e ordenada, em vez
 * de montar um `.in()` com até 10.000 códigos (a URL passaria de 80 KB): a tabela só tem escola enriquecida.
 */
export async function contatosParaExportacao(sb: Cliente, agora: Date, supressao: ReadonlySet<string>): Promise<{ mapa: Map<string, ContatoEnriquecido>; erro?: string }> {
  const r = await lerTudoPaginado((de, ate) => sb.from('mercado_escola_contatos').select(COLUNAS).gt('expira_em', agora.toISOString()).order('codigo_inep').range(de, ate));
  const mapa = new Map<string, ContatoEnriquecido>();
  for (const l of r.data || []) mapa.set(l.codigo_inep, paraContatoEnriquecido(l as LinhaContato, supressao));
  return { mapa, ...(r.error ? { erro: r.error } : {}) };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pedido de remoção: grava na supressão (conferida ao enriquecer e ao exportar) e tira a pessoa de toda linha
 * vigente (nome e e-mail). Devolve quantas escolas foram atingidas.
 */
export async function suprimirEmail(sb: Cliente, emailBruto: string, motivo: string | null, por: string): Promise<{ ok: true; escolas: number } | { ok: false; erro: string }> {
  const email = String(emailBruto ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 160) return { ok: false, erro: 'E-mail inválido.' };
  const gravou = await sb.from('mercado_contatos_supressao').upsert({ email, motivo: motivo ? String(motivo).slice(0, 200) : null, criado_por: por }, { onConflict: 'email' });
  if (gravou.error) return { ok: false, erro: gravou.error.message };

  const lidas = await lerTudoPaginado((de, ate) => sb.from('mercado_escola_contatos').select('codigo_inep, responsaveis').order('codigo_inep').range(de, ate));
  if (lidas.error) return { ok: false, erro: lidas.error };
  let escolas = 0;
  for (const l of lidas.data || []) {
    const resp: any[] = Array.isArray(l.responsaveis) ? l.responsaveis : [];
    const resto = resp.filter((p) => String(p?.email ?? '').toLowerCase() !== email);
    if (resto.length === resp.length) continue;
    const { error } = await sb.from('mercado_escola_contatos').update({ responsaveis: resto, atualizado_em: new Date().toISOString() }).eq('codigo_inep', l.codigo_inep);
    if (error) return { ok: false, erro: error.message };
    escolas++;
  }
  return { ok: true, escolas };
}
