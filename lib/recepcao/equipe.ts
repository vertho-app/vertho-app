import 'server-only';
import { RECEPCAO_SESSAO } from '@/lib/status';
import { can } from '@/lib/permissions';
import { canViewColabJourney } from '@/lib/authz';
import { type ContextoRecepcao, RecepcaoError } from './access';
import { visaoPublica } from './core';
import { textoParaTreino } from './ai';
import type { revisaoSchema } from './schema';
import type { z } from 'zod';

export async function todas(query:()=>any):Promise<any[]> {
 const rows=[];
 for(let n=0;n<10000;n+=500) {
  const {data,error}=await query().range(n,n+499);
  if(error) throw new RecepcaoError(503,'Não foi possível consultar os dados do treinamento.');
  rows.push(...data||[]);
  if((data||[]).length<500) return rows;
 }
 throw new RecepcaoError(422,'Há muitos registros neste período. Use um período menor.');
}
export async function pessoasDaEquipe(c:ContextoRecepcao) {
 if(!(c.auth.isPlatformAdmin || ['rh','gestor','tutor'].includes(c.auth.role)) || !(await can(c.auth,'journey.team.view')) || !(await can(c.auth,'reports.individual.view')))
  throw new RecepcaoError(403,'Seu perfil não permite acompanhar esta equipe.');
 const pessoas=await todas(()=>c.sb.from('colaboradores').select('id,empresa_id,nome_completo,email,gestor_email,ativo').eq('empresa_id',c.empresaId).order('id'));
 return pessoas.filter(p=>canViewColabJourney(c.auth,p));
}
export async function sessaoDaEquipe(c:ContextoRecepcao,id:string) {
 const pessoas=await pessoasDaEquipe(c);
 const {data,error}=await c.sb.from('recepcao_sessoes').select('*').eq('empresa_id',c.empresaId).eq('id',id).maybeSingle();
 if(error) throw new RecepcaoError(503,'Não foi possível consultar o atendimento.');
 if(!data || (!c.auth.isPlatformAdmin && !pessoas.some(p=>p.id===data.colaborador_id))) throw new RecepcaoError(404,'Atendimento não encontrado na sua equipe.');
 return data;
}
export function resumirEquipe(rows:any[],pessoas:any[],revisoes:any[]) {
 const concluidas=rows.filter(r=>r.estado.status===RECEPCAO_SESSAO.CONCLUIDA);
 const grupos=new Map<string,any>();
 for(const r of concluidas) {
  const s=r.estado,rel=s.relatorio;if(!rel) continue;
  // Mesma régua, versão do caso e cobertura. Notas de casos distintos nunca se misturam.
  const key=[s.cenario.id,rel.versaoCenario,rel.versaoRubrica,rel.coberturaPercentual].join('|');
  const g=grupos.get(key)||{chave:key,titulo:s.cenario.publico.titulo,versao:rel.versaoCenario,cobertura:rel.coberturaPercentual,sessoes:0,notas:[],dimensoes:{},criticas:0};
  g.sessoes++;if(rel.nota!==null) g.notas.push(rel.nota);g.criticas+=rel.ocorrencias.length?1:0;
  for(const d of rel.dimensoes) {
   const eixo=g.dimensoes[d.id]||{nome:d.nome||d.id,adequado:0,parcial:0,insuficiente:0,nao_observavel:0};
   eixo[d.classificacao]++;g.dimensoes[d.id]=eixo;
  }
  grupos.set(key,g);
 }
 const ultima=new Map<string,any>();for(const r of revisoes) if(!ultima.has(r.sessao_id)) ultima.set(r.sessao_id,r);
 return {iniciadas:rows.length,concluidas:concluidas.length,pendentes:concluidas.filter(r=>!ultima.has(r.id)).length,
  pessoas:pessoas.filter(p=>p.ativo!==false).map(p=>({id:p.id,nome:p.nome_completo,iniciadas:rows.filter(r=>r.colaborador_id===p.id).length,concluidas:concluidas.filter(r=>r.colaborador_id===p.id).length})),
  grupos:[...grupos.values()].map(g=>({...g,media:g.notas.length?g.notas.reduce((a,b)=>a+b,0)/g.notas.length:null,notas:undefined})),
  sessoes:rows.map(r=>({id:r.id,nome:pessoas.find(p=>p.id===r.colaborador_id)?.nome_completo||'Teste administrativo',titulo:r.estado.cenario.publico.titulo,data:r.created_at,status:r.estado.status,nota:r.estado.relatorio?.nota??null,critica:!!r.estado.relatorio?.ocorrencias?.length,revisao:ultima.get(r.id)?.parecer||null})),
 };
}
export async function painelEquipe(c:ContextoRecepcao,dias=30,incluirTestes=false) {
 const pessoas=await pessoasDaEquipe(c);
 const desde=new Date(Date.now()-dias*86400000).toISOString();
 let query=()=>{
  let q=c.sb.from('recepcao_sessoes').select('*').eq('empresa_id',c.empresaId).gte('created_at',desde).order('created_at',{ascending:false}).order('id');
  if(!c.auth.isPlatformAdmin || !incluirTestes) q=q.in('colaborador_id',pessoas.map(p=>p.id));
  if(!incluirTestes || !c.auth.isPlatformAdmin) q=q.not('owner_key','like','admin:%');
  return q;
 };
 const rows=(!pessoas.length && (!c.auth.isPlatformAdmin || !incluirTestes))?[]:await todas(query);
 const ids=new Set(rows.map(r=>r.id));
 // Leituras de empresa apenas no servidor, filtradas ao conjunto autorizado antes da resposta.
 const revisoes=(await todas(()=>c.sb.from('recepcao_revisoes').select('*').eq('empresa_id',c.empresaId).gte('created_at',desde).order('created_at',{ascending:false}).order('id'))).filter(r=>ids.has(r.sessao_id));
 const podeCustos=await can(c.auth,'ai.costs.view');
 let operacao=null;
 if(podeCustos) {
  const tentativas=(await todas(()=>c.sb.from('recepcao_tentativas').select('*').eq('empresa_id',c.empresaId).gte('created_at',desde).order('id'))).filter(r=>ids.has(r.sessao_id));
  const ledger:any[]=[];
  for(let i=0;i<tentativas.length;i+=80) ledger.push(...await todas(()=>c.sb.from('ia_usage_log').select('correlation_id,model,cost_usd,latency_ms,status').eq('empresa_id',c.empresaId).in('correlation_id',tentativas.slice(i,i+80).map(t=>t.id)).order('id')));
  const rejeicoes:Record<string,number>={};for(const t of tentativas) if(t.estado==='rejeitada') rejeicoes[t.erro_codigo||'outro']=(rejeicoes[t.erro_codigo||'outro']||0)+1;
  const porSessao=rows.map(r=>{const ts=tentativas.filter(t=>t.sessao_id===r.id);const usage=ledger.filter(l=>ts.some(t=>t.id===l.correlation_id));return {id:r.id,tentativas:ts.length,custoConhecidoUsd:usage.reduce((n,l)=>n+(l.cost_usd||0),0),semUsoRegistrado:ts.filter(t=>!usage.some(l=>l.correlation_id===t.id)).length};});
  const avaliacoes=tentativas.filter(t=>t.etapa==='avaliador'),recusadas=avaliacoes.filter(t=>t.estado==='rejeitada');
  operacao={tentativas:tentativas.length,rejeicoes,emAberto:tentativas.filter(t=>!t.finished_at).length,custoConhecidoUsd:ledger.reduce((n,l)=>n+(l.cost_usd||0),0),modelos:[...new Set(ledger.map(l=>l.model))],porSessao,avaliacoes:avaliacoes.length,avaliacoesRejeitadas:recusadas.length,taxaRejeicao:avaliacoes.length?100*recusadas.length/avaliacoes.length:null};
 }
 return {...resumirEquipe(rows,pessoas,revisoes),dias,operacao};
}
export async function detalheEquipe(c:ContextoRecepcao,id:string) {
 const row=await sessaoDaEquipe(c,id);
 const revisoes=await todas(()=>c.sb.from('recepcao_revisoes').select('id,parecer,motivo,dimensoes,revisor_nome,created_at').eq('empresa_id',c.empresaId).eq('sessao_id',id).order('created_at',{ascending:false}).order('id'));
 return {sessao:visaoPublica(row.estado),revisoes,podeRevisar:row.owner_key!==c.ownerKey && await can(c.auth,'assessments.answer')};
}
export async function revisar(c:ContextoRecepcao,cmd:z.infer<typeof revisaoSchema>) {
 if(!(await can(c.auth,'assessments.answer'))) throw new RecepcaoError(403,'Seu perfil não permite registrar revisão.');
 const row=await sessaoDaEquipe(c,cmd.sessaoId);
 if(row.owner_key===c.ownerKey) throw new RecepcaoError(403,'A revisão deve ser feita por outra pessoa.');
 if(row.estado.status!==RECEPCAO_SESSAO.CONCLUIDA) throw new RecepcaoError(409,'Aguarde a conclusão do relatório para revisar.');
 if(cmd.dimensoes.some(id=>!row.estado.cenario.rubrica.some(d=>d.id===id))) throw new RecepcaoError(400,'Competência não pertence a este exercício.');
 const motivo=textoParaTreino(cmd.motivo);
 const payload={id:cmd.requestId,empresa_id:c.empresaId,sessao_id:cmd.sessaoId,revisor_key:c.ownerKey,revisor_nome:c.auth.colaborador?.nome_completo||'Administração Vertho',parecer:cmd.parecer,motivo,dimensoes:cmd.dimensoes};
 const {error}=await c.sb.from('recepcao_revisoes').insert(payload);
 if(error?.code==='23505') {
  const {data:old,error:readError}=await c.sb.from('recepcao_revisoes').select('*').eq('empresa_id',c.empresaId).eq('id',cmd.requestId).maybeSingle();
  if(readError) throw new RecepcaoError(503,'Não foi possível recuperar a revisão.');
  if(!old || old.sessao_id!==cmd.sessaoId || old.revisor_key!==c.ownerKey || old.motivo!==motivo || old.parecer!==cmd.parecer || JSON.stringify(old.dimensoes)!==JSON.stringify(cmd.dimensoes)) throw new RecepcaoError(409,'Este envio já foi usado em outra revisão.');
 } else if(error) throw new RecepcaoError(503,'Não foi possível registrar a revisão.');
 return {ok:true};
}
