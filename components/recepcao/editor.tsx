'use client';
import { useState } from 'react';
import { cenarioSchema, type Cenario } from '@/lib/recepcao/schema';
import styles from './treino.module.css';

function preparar(c:Cenario):Cenario {
 const n=structuredClone(c);
 n.publico.secoes||=[];
 if(n.publico.consultaAnterior) n.publico.secoes.push({titulo:'Consulta anterior',itens:[n.publico.consultaAnterior]});
 if(n.publico.alternativas?.length) n.publico.secoes.push({titulo:'Alternativas autorizadas',itens:n.publico.alternativas.map(a=>`${a.data} · ${a.hora} · ${a.profissional}${a.condicao?` — ${a.condicao}`:''}`)});
 delete n.publico.consultaAnterior;delete n.publico.alternativas;n.variantes||=[];return n;
}
export function EditorCenario({registro,busy,salvar,fechar}:{registro:any;busy:boolean;salvar:(cmd:any)=>Promise<any>;fechar:()=>void}) {
 const [c,setC]=useState<Cenario>(()=>preparar(registro.conteudo)),[erros,setErros]=useState(''),[preview,setPreview]=useState(false);
 const editar=(f:(n:Cenario)=>void)=>setC(old=>{const n=structuredClone(old);f(n);return n});
 const linhas=(s:string)=>s.split('\n');
 async function enviar(acao:'salvar'|'publicar') {
  const parsed=cenarioSchema.safeParse(c);
  if(!parsed.success){setErros(parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('\n'));return;}
  setErros('');try{await salvar({acao,id:registro.id,revisao:registro.revisao,conteudo:parsed.data})}catch{}
 }
 return <div className={styles.editor}>
  <header className={styles.sectionHead}><div><p className={styles.eyebrow}>Preparar um exercício</p><h2>{registro.id?'Editar rascunho':'Nova versão do caso'}</h2></div><button className={styles.secondary} disabled={busy} onClick={fechar}>Voltar à biblioteca</button></header>
  <p>Edite, confira a ficha e salve. Publique quando o procedimento e os critérios estiverem revisados. Versões publicadas ficam preservadas.</p>
  {erros&&<p role="alert" className={styles.error}>{erros}</p>}
  <fieldset disabled={busy||registro.estado==='publicado'}>
   <div className={styles.formGrid}><label>Identificador do caso<input value={c.id} onChange={e=>editar(n=>{n.id=e.target.value})} placeholder="exemplo-remarcacao"/></label><label>Título<input value={c.publico.titulo} onChange={e=>editar(n=>{n.publico.titulo=e.target.value})}/></label><label>Clínica fictícia<input value={c.publico.clinica||''} onChange={e=>editar(n=>{n.publico.clinica=e.target.value})}/></label><label>Canal<select value={c.publico.canal} onChange={e=>editar(n=>{n.publico.canal=e.target.value as 'mensagens'|'telefone'})}><option value="mensagens">Mensagens / WhatsApp simulado</option><option value="telefone">Telefone simulado</option></select></label><label>Limite de respostas<input type="number" min="1" max="20" value={c.limiteRespostas} onChange={e=>editar(n=>{n.limiteRespostas=Number(e.target.value)})}/></label><label>Referência de data e horário<input value={c.publico.agora||''} onChange={e=>editar(n=>{n.publico.agora=e.target.value||undefined})}/></label></div>
   <label>Objetivo<textarea value={c.publico.objetivo} onChange={e=>editar(n=>{n.publico.objetivo=e.target.value})}/></label>
   <label>Contexto visível para quem treina<textarea value={c.publico.contexto} onChange={e=>editar(n=>{n.publico.contexto=e.target.value})}/></label>
   <label>O que este caso avalia e o que fica fora do exercício<textarea value={c.publico.escopoAvaliacao||''} onChange={e=>editar(n=>{n.publico.escopoAvaliacao=e.target.value||undefined})}/></label>
   <h3>Ficha de atendimento</h3>{c.publico.secoes.map((s,i)=><div key={i} className={styles.group}><label>Título da seção<input value={s.titulo} onChange={e=>editar(n=>{n.publico.secoes[i].titulo=e.target.value})}/></label><label>Informações disponíveis — uma por linha<textarea value={s.itens.join('\n')} onChange={e=>editar(n=>{n.publico.secoes[i].itens=linhas(e.target.value)})}/></label><button className={styles.link} onClick={()=>editar(n=>{n.publico.secoes.splice(i,1)})}>Remover seção</button></div>)}<button className={styles.secondary} disabled={c.publico.secoes.length>=8} onClick={()=>editar(n=>{n.publico.secoes.push({titulo:'Nova seção',itens:['Informação disponível']})})}>Adicionar seção</button>
   <label>Procedimentos autorizados — um por linha<textarea rows={6} value={c.publico.procedimentos.join('\n')} onChange={e=>editar(n=>{n.publico.procedimentos=linhas(e.target.value)})}/></label>
   <h3>Pacientes e variantes</h3><p>Estas instruções ficam reservadas. As variantes precisam continuar compatíveis com a ficha e os critérios.</p>
   {[c.paciente,...c.variantes].map((p,i)=>{const update=(k:string,v:any)=>editar(n=>{(i===0?n.paciente:n.variantes[i-1])[k]=v});return <details className={styles.group} key={i} open={i===0}><summary>{i===0?'Paciente principal':`Variante ${i}`} · {p.nome}</summary><label>Nome fictício<input value={p.nome} onChange={e=>update('nome',e.target.value)}/></label><label>Primeira mensagem<textarea maxLength={800} value={p.abertura} onChange={e=>update('abertura',e.target.value)}/></label><label>Comportamento<textarea value={p.comportamento} onChange={e=>update('comportamento',e.target.value)}/></label><label>Fatos e condições de revelação — um por linha<textarea value={p.fatos.join('\n')} onChange={e=>update('fatos',linhas(e.target.value))}/></label><label>Limites da personagem<textarea value={p.limites} onChange={e=>update('limites',e.target.value)}/></label>{i>0&&<button className={styles.link} onClick={()=>editar(n=>{n.variantes.splice(i-1,1)})}>Remover variante</button>}</details>})}
   <button className={styles.secondary} disabled={c.variantes.length>=3} onClick={()=>editar(n=>{n.variantes.push({...structuredClone(n.paciente),nome:'Nova paciente'})})}>Adicionar variante</button>
   <h3>Critérios de avaliação</h3><p>De 3 a 7 competências. Soma dos pesos: <strong>{c.rubrica.reduce((s,d)=>s+d.peso,0)} / 100</strong>.</p>
   {c.rubrica.map((d,i)=><details className={styles.group} key={i}><summary>{d.nome||d.id} · peso {d.peso}</summary><div className={styles.formGrid}><label>Identificador<input value={d.id} onChange={e=>editar(n=>{n.rubrica[i].id=e.target.value})}/></label><label>Nome<input value={d.nome||d.id} onChange={e=>editar(n=>{n.rubrica[i].nome=e.target.value})}/></label><label>Peso<input type="number" min="1" max="100" value={d.peso} onChange={e=>editar(n=>{n.rubrica[i].peso=Number(e.target.value)})}/></label></div>{[['criterio','O que observar'],['adequado','Atendimento adequado'],['parcial','Atendimento parcial'],['insuficiente','Atendimento insuficiente']].map(([k,label])=><label key={k}>{label}<textarea value={d[k]} onChange={e=>editar(n=>{n.rubrica[i][k]=e.target.value})}/></label>)}<button className={styles.link} disabled={c.rubrica.length<=3} onClick={()=>editar(n=>{n.rubrica.splice(i,1)})}>Remover competência</button></details>)}
   <button className={styles.secondary} disabled={c.rubrica.length>=7} onClick={()=>editar(n=>{n.rubrica.push({id:`competencia_${n.rubrica.length+1}`,nome:'Nova competência',peso:10,criterio:'',adequado:'',parcial:'',insuficiente:''})})}>Adicionar competência</button>
   <label>Desfechos permitidos — identificadores separados por vírgula<input value={c.desfechos.join(', ')} onChange={e=>editar(n=>{n.desfechos=e.target.value.split(',').map(s=>s.trim())})}/></label><label>Ocorrências críticas — identificadores separados por vírgula<input value={c.ocorrenciasCriticas.join(', ')} onChange={e=>editar(n=>{n.ocorrenciasCriticas=e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}/></label>
  </fieldset>
  <div className={styles.filters}><button className={styles.secondary} onClick={()=>setPreview(!preview)}>{preview?'Fechar prévia':'Conferir ficha visível'}</button><button className={styles.primary} disabled={busy||registro.estado==='publicado'} onClick={()=>enviar('salvar')}>Salvar rascunho</button>{registro.id&&registro.estado==='rascunho'&&<button className={styles.primary} disabled={busy} onClick={()=>{if(window.confirm('Publicar esta versão para os treinos da clínica?'))enviar('publicar')}}>Publicar versão</button>}</div>
  {preview&&<aside className={styles.ficha}><h2>{c.publico.titulo}</h2><p>{c.publico.contexto}</p>{c.publico.secoes.map((s,i)=><section key={i}><h3>{s.titulo}</h3><ul>{s.itens.map((t,j)=><li key={j}>{t}</li>)}</ul></section>)}<h3>Procedimentos</h3><ul>{c.publico.procedimentos.map((p,i)=><li key={i}>{p}</li>)}</ul></aside>}
 </div>;
}
