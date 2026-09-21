import 'server-only';
import { nivelDaNota } from '@/lib/nivel-regua';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ROSTER_COMERCIAL, ROSTER_ESCOLAR } from './rosters';
import { ACME_DEMO_REPORT_DIRECTORY } from './acme-rh-report-fixture';
import { acessoDoCargo, idDoCargo, mapaDeCargos } from '@/lib/simuladores/acesso-cargo';
import { lerConfigProntidao, ocupaCargoAlvo } from '@/lib/prontidao-lideranca/config';
import { linhasDaVariante } from '@/lib/simuladores/lideranca/matriz-global';
import { PROMPTS } from '@/lib/simulador-lideranca/prompts';
import { resolveTaskModel } from '@/lib/ai-tasks';
import type { Estado as EstadoLideranca, Etapa } from '@/lib/simulador-lideranca/schema';
import { DEMO_SIMULADORES_VERSION, dataDemo, idDemoSimulador, jornadaLiderancaDemo, treinoAtendimentoDemo, treinoVendasDemo } from './simuladores-fixture';

/** Nenhum tenant real, convidado ou e-mail apenas parecido entra no seed. */
export function elencoSimuladoresDemo(slug: string, isDemo: boolean): Set<string> {
  if (!isDemo || !['acme-demo', 'escolas-acme', 'gruposinal'].includes(slug)) return new Set();
  const roster = slug === 'escolas-acme' ? ROSTER_ESCOLAR : ROSTER_COMERCIAL;
  return new Set([...roster.personas, ...(roster.diretorio || []), ...(slug === 'acme-demo' ? ACME_DEMO_REPORT_DIRECTORY : [])].map((p) => p.email));
}

const checked = async (query: PromiseLike<any>) => {
  const { data, error } = await query;
  if (error) throw new Error(`seed simuladores demo: ${error.message}`);
  return data;
};

/** Incremental e repetível. Só atualiza o próprio fixture sem interações;
 * resultados existentes de pessoas, convidados e administradores são preservados.
 * IDs por tenant/e-mail sobrevivem à troca de UUID das personas no reset.
 */
export async function seedSimuladoresDemo(sb: SupabaseClient, empresaId: string, agora = new Date()) {
  const empresa = await checked(sb.from('empresas').select('id,slug,is_demo,sys_config').eq('id', empresaId).single());
  const elenco = elencoSimuladoresDemo(empresa.slug, empresa.is_demo);
  const totais = { atendimento: 0, vendas: 0, jornadas: 0, encontros: 0, mapeamentos: 0 };
  if (!elenco.size) return totais;
  const pessoas = (await checked(sb.from('colaboradores').select('id,email,nome_completo,cargo,role').eq('empresa_id', empresaId).in('email', [...elenco])))
    .filter((p: any) => p.role !== 'rh').sort((a: any, b: any) => a.email.localeCompare(b.email));
  const cargos = await checked(sb.from('cargos_empresa').select('id,nome').eq('empresa_id', empresaId));
  const cargoIds = mapaDeCargos(cargos);
  const atendimento = await checked(sb.from('recepcao_config').select('habilitado,dominio').eq('empresa_id', empresaId).maybeSingle());
  const vendas = await checked(sb.from('sim_vendas_config').select('habilitado').eq('empresa_id', empresaId).maybeSingle());
  const cfg = empresa.sys_config?.modulos?.prontidao_lideranca === true ? lerConfigProntidao(empresa.sys_config) : null;
  const modelos = {} as EstadoLideranca['modelos'];
  if (cfg) for (const etapa of Object.keys(PROMPTS) as Etapa[]) modelos[etapa] = resolveTaskModel(empresa.sys_config, `sim_lideranca_${etapa}`);
  const cenarios = atendimento?.habilitado
    ? (await checked(sb.from('recepcao_cenarios').select('id,conteudo,empresa_id').eq('estado', 'publicado').or(`empresa_id.is.null,empresa_id.eq.${empresaId}`).order('versao', { ascending: false })))
      .filter((c: any) => (c.conteudo.dominio || 'recepcao_medica') === atendimento.dominio && c.conteudo.desfechos.includes('encaminhado')).slice(0, 3)
    : [];
  if (atendimento?.habilitado && !cenarios.length) throw new Error('Demo de atendimento sem cenário publicado compatível.');

  async function salvarFixture(tabela: string, row: any) {
    const existente = await checked(sb.from(tabela).select('id,estado,revisao').eq('empresa_id', empresaId).eq('id', row.id).maybeSingle());
    if (existente && (existente.estado?.demoFixture !== DEMO_SIMULADORES_VERSION || existente.revisao > 0)) return false;
    await checked(sb.from(tabela).upsert({ ...row, empresa_id: empresaId }, { onConflict: 'id' }));
    return true;
  }

  // Deixa uma parcela do elenco sem treino para mostrar também onde apoiar.
  const selecionadas = pessoas.slice(0, Math.max(1, Math.ceil(pessoas.length * 0.65)));
  for (const [i, p] of selecionadas.entries()) {
    const acesso = acessoDoCargo(empresa.sys_config, idDoCargo(cargoIds, p.cargo));
    const chave = `${empresaId}:${p.email}`;
    const base = { colaborador_id: p.id, owner_key: `colab:${p.id}` };
    const participante = !['gestor', 'tutor'].includes(p.role);
    for (let tentativa = 0; tentativa < (i % 2 ? 1 : 2); tentativa++) {
      const em = dataDemo(agora, tentativa ? 2 : 8 + i % 12);
      if (participante && atendimento?.habilitado && acesso.atendimento) {
        const id = idDemoSimulador(`${chave}:atendimento:${tentativa}`);
        const cenario = cenarios[i % cenarios.length];
        const estado = treinoAtendimentoDemo(cenario.conteudo, id, i, tentativa);
        estado.cenarioRegistroId = cenario.id;
        if (await salvarFixture('recepcao_sessoes', { ...base, id, owner_email: p.email, estado, created_at: em, updated_at: em })) totais.atendimento++;
      }
      if (participante && vendas?.habilitado && acesso.vendas) {
        const id = idDemoSimulador(`${chave}:vendas:${tentativa}`);
        if (await salvarFixture('sim_vendas_sessoes', { ...base, id, estado: treinoVendasDemo(id, p.nome_completo, i, tentativa, em), created_at: em, updated_at: em })) totais.vendas++;
      }
    }
    if (!cfg) continue;
    const variante = ocupaCargoAlvo(p.cargo, cfg) ? 'lider' : 'futuro';
    if (acesso.lideranca) {
      const id = idDemoSimulador(`${chave}:lideranca`);
      const existente = await checked(sb.from('sim_lideranca_jornadas').select('id').eq('empresa_id', empresaId).eq('owner_key', base.owner_key).maybeSingle());
      if (!existente || existente.id === id) {
        const estado = jornadaLiderancaDemo(chave, variante, i, [5, 3, 1, 4][i % 4], agora, modelos, PROMPTS);
        if (await salvarFixture('sim_lideranca_jornadas', { ...base, id, estado, created_at: dataDemo(agora, 12), updated_at: estado.concluidos.at(-1)!.encerradoEm })) {
          totais.jornadas++;
          for (const episodio of estado.concluidos) {
            await checked(sb.from('sim_lideranca_episodios').upsert({ id: episodio.id, empresa_id: empresaId, jornada_id: id, indice: episodio.indice, repeticao: false, episodio, created_at: episodio.encerradoEm }, { onConflict: 'id' }));
            totais.encontros++;
          }
        }
      }
    }
    // Mapeamento é separado do treino: notas e evidências próprias, sem inferir
    // que concluir uma simulação equivale a concluir uma avaliação formal.
    const matriz = linhasDaVariante(variante);
    const nomes = [...new Set(matriz.map((d) => d.nome))];
    const comps = await checked(sb.from('competencias').select('id,nome,cod_desc').eq('empresa_id', empresaId).eq('cargo', matriz[0].cargo));
    const existentes = await checked(sb.from('descriptor_assessments').select('competencia,descritor,origem').eq('empresa_id', empresaId).eq('colaborador_id', p.id).in('competencia', nomes));
    // Não mistura um mapeamento já realizado com dados editoriais.
    if (existentes.some((r: any) => r.origem !== DEMO_SIMULADORES_VERSION)) continue;
    const completas = i % 5 !== 4;
    const escolhidas = completas ? nomes : nomes.slice(0, 2);
    for (const [ci, competencia] of escolhidas.entries()) {
      const linhas = matriz.filter((d) => d.nome === competencia);
      const comp = comps.find((c: any) => c.nome === competencia && !c.cod_desc) || comps.find((c: any) => c.nome === competencia);
      if (!comp) throw new Error(`Matriz de liderança não instalada: ${competencia}`);
      const nota = [2.2, 3.2, 3.6, 2.7][i % 4] + (ci % 2) * 0.1;
      const fala = CONTEUDO_MAPEAMENTO[ci];
      const respostaId = idDemoSimulador(`${chave}:mapeamento:${competencia}`);
      const respostaAnterior = await checked(sb.from('respostas').select('id').eq('empresa_id', empresaId).eq('colaborador_id', p.id).eq('competencia_nome', competencia).limit(1));
      if (respostaAnterior.some((r: any) => r.id !== respostaId)) continue;
      await checked(sb.from('respostas').upsert({
        id: respostaId, empresa_id: empresaId, colaborador_id: p.id, email_colaborador: p.email, nome_colaborador: p.nome_completo,
        cargo: matriz[0].cargo, competencia_id: comp.id, competencia_nome: competencia,
        r1: fala, r2: fala, r3: 'Comparei alternativas antes de decidir e considerei o impacto sobre as pessoas.', r4: 'Vou acompanhar o resultado e ajustar o combinado com a equipe.',
        canal: 'demo-seed', tipo_resposta: 'cenario_a', rodada: 1, timestamp_resposta: dataDemo(agora, 15), avaliado_em: dataDemo(agora, 15),
        nota_ia4: nota, nivel_ia4: nivelDaNota(nota), status_ia4: 'aprovado',
        feedback_ia4: 'Exemplo fictício de mapeamento: há ações propostas e evidências para discutir. O próximo passo é tornar o acompanhamento mais específico.',
        avaliacao_ia: { origem: DEMO_SIMULADORES_VERSION, avaliacao_por_descritor: linhas.map((d, di) => ({ numero: di + 1, nome: d.nome_curto, nota_decimal: nota, nivel_sugerido: nivelDaNota(nota), confianca: 0.8, sustentacao: 'Exemplo editorial de demonstração.', evidencias: [{ resposta: 'r1', trecho: fala, forca_evidencia: 'moderada' }], limites_da_evidencia: ['Situação fictícia; não representa avaliação de uma pessoa real.'], racional: d.n3_meta })) },
      }));
      await checked(sb.from('descriptor_assessments').upsert(linhas.map((d) => ({ empresa_id: empresaId, colaborador_id: p.id, cargo: matriz[0].cargo, competencia, descritor: d.nome_curto, nota, origem: DEMO_SIMULADORES_VERSION, assessment_date: dataDemo(agora, 15) })), { onConflict: 'colaborador_id,competencia,descritor' }));
    }
    totais.mapeamentos++;
  }
  return totais;
}

const CONTEUDO_MAPEAMENTO = [
  'Antes de concluir que o problema era falta de esforço, ouvi a equipe e comparei os pedidos com a capacidade disponível. Separei fatos de hipóteses e validei as causas com as pessoas envolvidas.',
  'Conversei sobre a responsabilidade que a pessoa queria assumir. Combinamos uma primeira entrega, o apoio de uma referência técnica e uma revisão na quinta-feira, preservando espaço para ela propor o caminho.',
  'Descrevi o comportamento observado na reunião e perguntei como a outra pessoa percebeu a situação. Expliquei o impacto e construímos um acordo para ouvir a proposta inteira antes de sugerir mudanças.',
  'Comparei impacto, urgência e capacidade antes de definir a prioridade. Explicitei o que precisaria ser adiado, validei o risco com os responsáveis e comuniquei a decisão às pessoas afetadas.',
  'Pedi um exemplo do impacto da minha orientação e reconheci que tinha decidido antes de ouvir. Reformulei o combinado para que a pessoa trouxesse alternativas e marcamos uma revisão da mudança.',
];
