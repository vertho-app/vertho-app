/**
 * Andamento do MAPEAMENTO de competências (os cenários respondidos) de cada pessoa: uma definição só, para os filtros da tela de
 * envios (prévia do lote de template, e-mail, magic link) e para a lista da tela.
 *
 * Três estados, e a diferença entre dois deles é o motivo deste arquivo:
 *   - `completo`    : respondeu TODAS as competências que têm cenário no cargo (mesma regra do assessment: pendentes == 0);
 *   - `andamento`   : respondeu ao menos uma, mas não todas ("começou e não terminou");
 *   - `nao_iniciado`: nenhuma resposta.
 * O filtro "pendente" da tela é tudo o que NÃO é `completo` (andamento + não iniciado). Até 08/10/2026 só existia o par
 * concluído/pendente, e a pessoa que começou ficava indistinguível de quem nunca abriu (4Life: 2 pessoas com 1 de 2
 * competências respondidas não apareciam em "Sem perfil + Concluído", e em "Pendente" vinham misturadas com quem nem começou).
 *
 * Esperado por cargo = competências distintas em `banco_cenarios`; respondidas = competências distintas em `respostas`, com o cargo
 * gravado na PRIMEIRA resposta da pessoa (a regra que já existia; a leitura é ordenada por id para ser a mesma sempre). Pessoa cujo
 * cargo não tem nenhum cenário não tem como completar: fica em `andamento`.
 *
 * A leitura PAGINA (o PostgREST corta em 1.000 linhas sem avisar) e LANÇA em caso de erro. A versão anterior ignorava o `{ error }`:
 * uma falha de leitura virava "ninguém concluiu", e num disparo filtrado por "pendente" isso é "manda para todo mundo".
 */
import { lerTudoPaginado } from '@/lib/paginacao';

export type EstadoMapeamento = 'completo' | 'andamento' | 'nao_iniciado';

export interface ProgressoMapeamento {
  estadoDe(colaboradorId: string): EstadoMapeamento;
}

type RespostaLinha = { colaborador_id: string; competencia_id: string | null; cargo: string | null };
type CenarioLinha = { cargo: string | null; competencia_id: string | null };

/** Pura: classifica a partir das linhas já lidas. */
export function classificarMapeamento(respostas: RespostaLinha[], cenarios: CenarioLinha[]): ProgressoMapeamento {
  const esperadoPorCargo = new Map<string, Set<string>>();
  for (const c of cenarios) {
    if (!c.competencia_id) continue;
    const chave = String(c.cargo);
    let s = esperadoPorCargo.get(chave);
    if (!s) esperadoPorCargo.set(chave, s = new Set());
    s.add(c.competencia_id);
  }

  const porPessoa = new Map<string, { cargo: string; comps: Set<string> }>();
  for (const r of respostas) {
    if (!r.competencia_id) continue;
    let o = porPessoa.get(r.colaborador_id);
    if (!o) porPessoa.set(r.colaborador_id, o = { cargo: String(r.cargo), comps: new Set() });
    o.comps.add(r.competencia_id);
  }

  const estados = new Map<string, EstadoMapeamento>();
  for (const [id, o] of porPessoa) {
    const esperado = esperadoPorCargo.get(o.cargo);
    let todas = !!esperado && esperado.size > 0;
    if (todas) for (const cid of esperado!) if (!o.comps.has(cid)) { todas = false; break; }
    estados.set(id, todas ? 'completo' : 'andamento');
  }
  return { estadoDe: (id) => estados.get(id) ?? 'nao_iniciado' };
}

/** `sb` precisa ser o client de servidor; tudo é lido COM `empresa_id`. Lança em erro de leitura. */
export async function lerMapeamentoProgresso(sb: any, empresaId: string): Promise<ProgressoMapeamento> {
  const respostas = await lerTudoPaginado((de, ate) => sb.from('respostas')
    .select('colaborador_id, competencia_id, cargo').eq('empresa_id', empresaId).order('id').range(de, ate));
  if (respostas.error) throw new Error(`mapeamento: respostas: ${respostas.error}`);
  const cenarios = await lerTudoPaginado((de, ate) => sb.from('banco_cenarios')
    .select('cargo, competencia_id').eq('empresa_id', empresaId).order('id').range(de, ate));
  if (cenarios.error) throw new Error(`mapeamento: cenários: ${cenarios.error}`);
  return classificarMapeamento(respostas.data, cenarios.data);
}

/**
 * O filtro do LOTE DE TEMPLATE (`previewTemplateWhatsApp` / `dispararTemplateWhatsApp`) a partir do valor da caixa de seleção.
 * São dois campos, de propósito: `mapeamentoCompleto` (booleano: concluído ou não) e `mapeamentoEmAndamento` (`true`). "Em andamento"
 * NÃO pode virar `mapeamentoCompleto: false`, que é o "ainda não concluiu" e inclui quem nem começou. O que não é `todos`,
 * `completo` nem `andamento` é o "ainda não concluiu".
 */
export function filtroDoLoteDeTemplate(valor: string): { mapeamentoCompleto?: boolean; mapeamentoEmAndamento?: true } {
  if (valor === 'todos') return {};
  if (valor === 'andamento') return { mapeamentoEmAndamento: true };
  return { mapeamentoCompleto: valor === 'completo' };
}

/**
 * Quem passa no filtro de mapeamento da tela. `filtro` é o valor da caixa de seleção:
 * `completo` e `andamento` são exatos; qualquer outro valor é o "ainda não concluiu" (tudo o que não está `completo`).
 * Quem chama só o usa com um dos três valores conhecidos da tela; "todos" nem chega aqui.
 */
export function passaNoFiltroMapeamento(filtro: string, estado: EstadoMapeamento): boolean {
  if (filtro === 'completo') return estado === 'completo';
  if (filtro === 'andamento') return estado === 'andamento';
  return estado !== 'completo';
}
