/**
 * CORREÇÃO GUIADA do Development Blueprint pela auditoria (decisão do dono, 16/10/2026, Amazon Bowling).
 *
 * Medido na Amazon: 10 de 14 blueprints reprovados; auditando cada um 3 vezes, 8 reprovaram nas 3 (a avaliação da
 * semana final, ou as semanas, não cobrem o que o objetivo de 30 dias promete), 5 trocaram de veredito entre rodadas.
 * Mexer só no prompt do gerador não resolveu (A/B nas mesmas 10 pessoas: 2 aprovados com o prompt antigo, 3 com o novo).
 * O que resolve é o que já funcionou na IA4 e no PDI: devolver ao gerador os pontos EXATOS que o auditor apontou.
 *
 * Três travas, em código:
 *  1. ESTRUTURA TRAVADA (`mesclarBlueprintCorrigido`): competências, níveis, ids dos objetivos, calendário (número e
 *     tipo de cada semana) e os DESCRITORES de cada semana vêm da original. A trilha e o Kit (vídeos da semana 1)
 *     dependem desses descritores e continuam valendo. Da correção entra só texto; `conexao_com_pdi` só aceita ids de
 *     objetivos que existem e nunca fica vazio (regra máxima do blueprint).
 *  2. ADOÇÃO PELA RÉGUA DO PDI (`adotavel`, decisão do dono 16/10/2026): a candidata passa pelas DUAS rodadas do
 *     auditor (`auditarSemanticoEmRodadas`, reprova só se as duas reprovarem) e é adotável sem reprovação e sem
 *     auditoria parcial. Antes exigia as duas aprovadas, o que com o auditor ruidoso deu 1 de 10. A semana de
 *     avaliação da candidata é montada em código (`montarSemanasDeAvaliacao`), como na geração.
 *  3. SEM GRAVAR AQUI: `corrigirBlueprintCore` só gera e audita. Gravar é `gravarBlueprintCorrigido`, que quem aplica
 *     chama junto com a cascata (PDI e trilha da mesma pessoa), para ninguém ficar com blueprint novo e PDI velho.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { getModelForTask } from '@/lib/ai-tasks';
import { maskColaborador, maskDeepPII, unmaskDeepPII } from '@/lib/pii-masker';
import { mesclarSoTexto } from '@/lib/ia4-correcao-texto';
import { getProgramaConfig } from '@/lib/season-engine/programa-config';
import { idiomaDaPessoa } from '@/lib/pdf-locale';
import { auditEstrutural, montarRelatorioAuditoria, type BlueprintAuditReport } from './audit';
import { auditarSemanticoEmRodadas } from './core';
import { montarSemanasDeAvaliacao } from './avaliacao-final';

const FIXAS = new Set([
  'spec_version', 'semana', 'tipo', 'competencia_foco', 'id', 'nome', 'nivel_atual', 'prioridade', 'duracao_semanas',
  'colaborador', 'semana_sugerida',
]);

/** Chave que vem inteira da original. `descritores_foco` trava quando é a lista de NOMES da semana; na competência é lista de objetos com texto editável. */
export const ehFixaBlueprint = (k: string, v: unknown) =>
  FIXAS.has(k) || (k === 'descritores_foco' && Array.isArray(v) && v.every((x) => typeof x === 'string'));

/** Mescla a correção na original com a estrutura travada. PURO. */
export function mesclarBlueprintCorrigido(original: any, correcao: any): any {
  const m = mesclarSoTexto(original, correcao, ehFixaBlueprint);
  const ids = new Set<string>((original?.competencias || []).flatMap((c: any) => (c.objetivos_30_dias || []).map((o: any) => o?.id)).filter(Boolean));
  const semanasOrig = original?.trilha?.semanas || [];
  (m?.trilha?.semanas || []).forEach((s: any, i: number) => {
    const lista = Array.isArray(s.conexao_com_pdi) ? [...new Set<string>(s.conexao_com_pdi.filter((id: unknown) => typeof id === 'string' && ids.has(id)))] : [];
    s.conexao_com_pdi = lista.length ? lista : semanasOrig[i]?.conexao_com_pdi;
  });
  return m;
}

/** Adotável: o relatório combinado das duas rodadas (régua do PDI) sem reprovação e completo. PURO. */
export function adotavel(r: Pick<BlueprintAuditReport, 'ok' | 'parcial'> | null): boolean {
  return !!r && r.ok && !r.parcial;
}

const SYSTEM_CORRECAO = `Você corrige um DEVELOPMENT BLUEPRINT da Vertho que um auditor reprovou. Sua tarefa é resolver CADA problema apontado, mexendo só no necessário.

TRAVADO (não altere; o sistema restaura se você mudar): as competências e seus níveis, os ids dos objetivos, o número e o tipo de cada semana, a competência e os DESCRITORES de cada semana.

PODE REESCREVER: o texto dos objetivos_30_dias (objetivo, acao_principal, acao_apoio, evidencia_de_execucao, criterio_de_sucesso, ritual), a leitura e os textos dos descritores das competências, e de cada semana: objetivo_da_semana, evidencia_esperada, criterio_de_sucesso e conexao_com_pdi (só com ids de objetivos que existem).

COMO RESOLVER OS PROBLEMAS TÍPICOS:
- Objetivo promete o universal ou o contínuo ("todo atendimento", "todas as ordens", "em cada turno", "diariamente"): reescreva com uma QUANTIDADE contável e realista no período, pequena para quem está em N1, e o criterio_de_sucesso do objetivo com o MESMO número.
- A avaliação final pede menos do que o objetivo promete, ou não verifica uma parte dele: a semana de avaliação cobra a MESMA quantidade e a MESMA unidade, e o criterio_de_sucesso verifica CADA parte de cada objetivo ligado a ela.
- Objetivo que nenhuma semana trabalha de fato: as semanas ligadas a ele (conexao_com_pdi) pedem evidência dele, que somada chega ao prometido.
- Semana que declara descritores e não coleta evidência deles: a evidencia_esperada da semana passa a pedir algo observável de CADA descritor da semana (os descritores não mudam; muda o que a semana pede).
- Evidência sempre contável, com piso ("ao menos duas fichas"), nunca "alguns registros".
- Linguagem de trabalho, nunca clínica; em primeira pessoa nos objetivos.

Devolva o JSON COMPLETO do blueprint, com a MESMA estrutura e as MESMAS chaves que recebeu. RETORNE APENAS JSON VÁLIDO, sem markdown.`;

/** Auditoria em memória com a régua de produção: estrutural + semântico em duas rodadas (`auditarSemanticoEmRodadas`). */
async function auditarEmMemoria(bp: any, p: { empresaId: string; colaboradorId: string; sysConfig: any; modelo: string }): Promise<BlueprintAuditReport> {
  const cfg = getProgramaConfig(p.sysConfig);
  const estrutural = auditEstrutural(bp, { duracaoSemanas: cfg.semanas, semanasMissao: cfg.semanasMissao, semanasAvaliacao: cfg.semanasAvaliacao });
  const semantico = await auditarSemanticoEmRodadas(bp, { empresaId: p.empresaId, colaboradorId: p.colaboradorId, modelo: p.modelo });
  return montarRelatorioAuditoria(estrutural, semantico, new Date().toISOString());
}

export interface TentativaCorrecao { relatorio: BlueprintAuditReport | null; adotavel: boolean }
export interface ResultadoCorrecaoBlueprint {
  error?: string;
  /** A candidata adotável (estrutura travada), quando houver. */
  blueprint?: any;
  /** O relatório da 1ª rodada da candidata adotada (o que se grava como `auditoria`). */
  relatorio?: BlueprintAuditReport;
  tentativas: TentativaCorrecao[];
}

/**
 * Gera e audita a correção do blueprint de UMA pessoa (até `maxTentativas`, cada uma partindo dos apontamentos da
 * anterior). NÃO grava. Headless: `sb` é o client service-role.
 */
export async function corrigirBlueprintCore(
  sb: SupabaseClient, alvo: { empresaId: string; colaboradorId: string }, opts: { maxTentativas?: number } = {},
): Promise<ResultadoCorrecaoBlueprint> {
  const { empresaId, colaboradorId } = alvo;
  const tentativas: TentativaCorrecao[] = [];
  try {
    const { data: row, error } = await sb.from('development_blueprints').select('blueprint, auditoria')
      .eq('empresa_id', empresaId).eq('colaborador_id', colaboradorId).maybeSingle();
    if (error || !row?.blueprint) return { error: `blueprint: ${error?.message || 'não encontrado'}`, tentativas };
    const { data: colab, error: e2 } = await sb.from('colaboradores').select('id, nome_completo, email')
      .eq('empresa_id', empresaId).eq('id', colaboradorId).maybeSingle();
    if (e2 || !colab) return { error: `colaborador: ${e2?.message || 'não encontrado'}`, tentativas };
    const { data: emp, error: e3 } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
    if (e3) return { error: `empresa: ${e3.message}`, tentativas };
    const pii = maskColaborador(colab).map;
    const modeloGerar = await getModelForTask(empresaId, 'blueprint_gerar');
    const modeloAuditar = await getModelForTask(empresaId, 'blueprint_audit');
    // O blueprint é da PESSOA: o texto corrigido sai no idioma dela, como na geração (`buildBlueprintReq`).
    const locale = await idiomaDaPessoa(empresaId, colaboradorId);

    const original = row.blueprint;
    let base = original;
    let apontamentos: any[] = (row.auditoria?.checks || []).filter((c: any) => c.status !== 'pass');
    const maxT = Math.max(1, opts.maxTentativas ?? 2);
    for (let t = 0; t < maxT; t++) {
      const user = [
        `═══ BLUEPRINT (JSON) ═══\n${JSON.stringify(maskDeepPII(base, pii), null, 2)}`,
        `═══ PROBLEMAS APONTADOS PELO AUDITOR ═══\n${maskDeepPII(apontamentos, pii).map((c: any) => `- [${c.status}] ${c.id}: ${c.detalhe}${Array.isArray(c.itens) && c.itens.length ? ` (itens: ${c.itens.join('; ')})` : ''}`).join('\n') || '(nenhum)'}`,
      ].join('\n\n');
      const bruto = await callAI(SYSTEM_CORRECAO, user, { model: modeloGerar }, 64000, { taskKey: 'blueprint_gerar', empresaId, colaboradorId, timeoutMs: 300000, locale });
      const doModelo = await extractJSON(bruto);
      if (!doModelo || typeof doModelo !== 'object') { tentativas.push({ relatorio: null, adotavel: false }); continue; }
      // A estrutura trava contra a ORIGINAL (não contra a tentativa anterior): nenhuma volta pode mexer nos descritores.
      // A avaliação final é montada em código depois da mescla, como na geração (`persistBlueprintFromText`).
      const candidata = montarSemanasDeAvaliacao(mesclarBlueprintCorrigido(original, unmaskDeepPII(doModelo, pii)));
      const rel = await auditarEmMemoria(candidata, { empresaId, colaboradorId, sysConfig: emp?.sys_config, modelo: modeloAuditar });
      const ok = adotavel(rel);
      tentativas.push({ relatorio: rel, adotavel: ok });
      if (ok) return { blueprint: candidata, relatorio: rel, tentativas };
      base = candidata;
      apontamentos = (rel.checks || []).filter((c: any) => c.status !== 'pass');
    }
    return { tentativas };
  } catch (e: any) {
    return { error: String(e?.message || e), tentativas };
  }
}

/**
 * Grava a correção adotada, com o histórico (blueprint e auditoria anteriores) dentro da auditoria nova. Quem aplica
 * chama isto JUNTO com a cascata da mesma pessoa (PDI e trilha), e restaura pelo snapshot se a cascata não fechar.
 */
export async function gravarBlueprintCorrigido(
  sb: SupabaseClient,
  p: {
    empresaId: string; colaboradorId: string; blueprint: any; relatorio: BlueprintAuditReport; anterior: { blueprint: any; auditoria: any };
    /** Marcas extras no rastro da correção (ex.: `cascata_automatica`, ver `lib/pipeline-fluxo/correcoes.ts`). */
    marcas?: Record<string, unknown>;
  },
): Promise<{ error?: string }> {
  const auditoria = { ...p.relatorio, correcao_guiada: { blueprint_anterior: p.anterior.blueprint, auditoria_anterior: p.anterior.auditoria, corrigido_em: new Date().toISOString(), ...(p.marcas || {}) } };
  const { data, error } = await sb.from('development_blueprints')
    .update({ blueprint: p.blueprint, auditoria, auditado_em: p.relatorio.auditado_em, gerado_em: new Date().toISOString() })
    .eq('empresa_id', p.empresaId).eq('colaborador_id', p.colaboradorId).select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: '0 linhas atualizadas' };
  return {};
}
