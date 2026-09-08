'use client';
import { useState } from 'react';
import { cenarioSchema, NIVEIS, NIVEIS_COMPORTAMENTO, rotuloClassificacao, rotuloNivel, type Cenario } from '@/lib/recepcao/schema';
import styles from './treino.module.css';

type Biblioteca = Array<{ codigo:string; nome:string; descricao:string; niveis:Record<string,string>; ativo:boolean }>;
type Dimensao = Cenario['rubrica'][number];

function preparar(c:Cenario,biblioteca:Biblioteca):Cenario {
 const n=structuredClone(c);
 n.publico.secoes||=[];
 if(n.publico.consultaAnterior) n.publico.secoes.push({titulo:'Consulta anterior',itens:[n.publico.consultaAnterior]});
 if(n.publico.alternativas?.length) n.publico.secoes.push({titulo:'Alternativas autorizadas',itens:n.publico.alternativas.map(a=>`${a.data} · ${a.hora} · ${a.profissional}${a.condicao?` — ${a.condicao}`:''}`)});
 delete n.publico.consultaAnterior;delete n.publico.alternativas;n.variantes||=[];
 // Cópia de uma versão legada (3 classificações): a dimensão que existe na biblioteca ganha os quatro
 // níveis dela, mantendo peso e critério do caso. A que não existe fica marcada e precisa ser desmarcada.
 n.rubrica=n.rubrica.map(d=>{const b=biblioteca.find(x=>x.codigo===d.id&&x.ativo);if(d.niveis||!b) return d;const {adequado,parcial,insuficiente,...resto}=d;return {...resto,nome:d.nome||b.nome,niveis:{n1:b.niveis.n1,n2:b.niveis.n2,n3:b.niveis.n3,n4:b.niveis.n4}};});
 return n;
}
export function EditorCenario({registro,biblioteca=[],admin=false,busy,salvar,fechar}:{registro:any;biblioteca?:Biblioteca;admin?:boolean;busy:boolean;salvar:(cmd:any)=>Promise<any>;fechar:()=>void}) {
 const [c,setC]=useState<Cenario>(()=>preparar(registro.conteudo,biblioteca)),[erros,setErros]=useState(''),[preview,setPreview]=useState(false);
 // Escopo: rascunho já gravado no catálogo (empresa_id nulo) ou criação marcada para o catálogo (só plataforma).
 const [catalogo,setCatalogo]=useState<boolean>(!!registro.catalogo);
 const noCatalogo=(!!registro.id&&registro.empresa_id===null)||(!registro.id&&catalogo);
 const [ajustando,setAjustando]=useState<Set<string>>(new Set());
 const editar=(f:(n:Cenario)=>void)=>setC(old=>{const n=structuredClone(old);f(n);return n});
 const linhas=(s:string)=>s.split('\n');
 const soma=c.rubrica.reduce((s,d)=>s+d.peso,0);
 // Linhas da seção de competências: biblioteca ativa (marcada ou não) + o que já está na rubrica e não está na biblioteca ativa.
 const ativas=biblioteca.filter(b=>b.ativo);
 const linhasRubrica=[
  ...ativas.map(b=>{const dim=c.rubrica.find(d=>d.id===b.codigo);return {id:b.codigo,nome:b.nome,biblioteca:b,dim,marcada:!!dim,niveis:dim?.niveis||b.niveis};}),
  ...c.rubrica.filter(d=>!ativas.some(b=>b.codigo===d.id)).map(d=>({id:d.id,nome:d.nome||d.id,biblioteca:null,dim:d,marcada:true,niveis:d.niveis})),
 ];
 function alternar(l:typeof linhasRubrica[number]) {
  editar(n=>{
   if(l.marcada){n.rubrica=n.rubrica.filter(d=>d.id!==l.id);return;}
   const b=l.biblioteca!;const resto=100-n.rubrica.reduce((s,d)=>s+d.peso,0);
   n.rubrica.push({id:b.codigo,nome:b.nome,peso:resto>0?resto:10,criterio:b.descricao||'',niveis:{n1:b.niveis.n1,n2:b.niveis.n2,n3:b.niveis.n3,n4:b.niveis.n4}} as Dimensao);
  });
 }
 const editarDim=(id:string,k:'peso'|'criterio',v:number|string)=>editar(n=>{const d=n.rubrica.find(x=>x.id===id);if(d)(d as any)[k]=v;});
 const distribuir=()=>editar(n=>{const q=n.rubrica.length;if(!q)return;const base=Math.floor(100/q),sobra=100-base*q;n.rubrica.forEach((d,i)=>{d.peso=base+(i<sobra?1:0);});});
 async function enviar(acao:'salvar'|'publicar') {
  const parsed=cenarioSchema.safeParse(c);
  if(!parsed.success){setErros(parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('\n'));return;}
  setErros('');try{await salvar({acao,id:registro.id,revisao:registro.revisao,conteudo:parsed.data,catalogo:noCatalogo||undefined})}catch{}
 }
 return <div className={styles.editor}>
  <header className={styles.sectionHead}><div><p className={styles.eyebrow}>{noCatalogo?'Catálogo Vertho · todas as clínicas':'Preparar um exercício'}</p><h2>{registro.id?'Editar rascunho':noCatalogo?'Nova versão no catálogo':'Nova versão do caso'}</h2></div><button className={styles.secondary} disabled={busy} onClick={fechar}>Voltar à biblioteca</button></header>
  <p>Edite, confira a ficha e salve. Publique quando o procedimento e os critérios estiverem revisados. Versões publicadas ficam preservadas.{noCatalogo&&' No catálogo, publicar arquiva a versão publicada anterior deste caso para todas as clínicas; as sessões já feitas mantêm o próprio snapshot.'}</p>
  {erros&&<p role="alert" className={styles.error}>{erros}</p>}
  {!registro.id&&admin&&<label className={styles.checkLabel}><input type="checkbox" checked={catalogo} disabled={busy} onChange={e=>setCatalogo(e.target.checked)}/> Gravar no Catálogo Vertho (todas as clínicas), não como cópia desta clínica</label>}
  <fieldset disabled={busy||registro.estado==='publicado'}>
   <div className={styles.formGrid}><label>Identificador do caso<input value={c.id} onChange={e=>editar(n=>{n.id=e.target.value})} placeholder="exemplo-remarcacao"/></label><label>Título<input value={c.publico.titulo} onChange={e=>editar(n=>{n.publico.titulo=e.target.value})}/></label>{noCatalogo&&<label>Versão no catálogo (única por caso)<input value={c.versao} onChange={e=>editar(n=>{n.versao=e.target.value})} placeholder="3.3"/></label>}<label>Clínica fictícia<input value={c.publico.clinica||''} onChange={e=>editar(n=>{n.publico.clinica=e.target.value})}/></label><label>Canal<select value={c.publico.canal} onChange={e=>editar(n=>{n.publico.canal=e.target.value as 'mensagens'|'telefone'})}><option value="mensagens">Mensagens / WhatsApp simulado</option><option value="telefone">Telefone simulado</option></select></label><label>Nível<select value={c.publico.nivel||''} onChange={e=>editar(n=>{n.publico.nivel=(e.target.value||undefined) as Cenario['publico']['nivel']})}><option value="">Sem nível (fim da lista)</option>{NIVEIS.map(n=><option key={n} value={n}>{rotuloNivel[n]}</option>)}</select></label><label>Limite de respostas<input type="number" min="1" max="20" value={c.limiteRespostas} onChange={e=>editar(n=>{n.limiteRespostas=Number(e.target.value)})}/></label><label>Referência de data e horário<input value={c.publico.agora||''} onChange={e=>editar(n=>{n.publico.agora=e.target.value||undefined})}/></label></div>
   <label>Objetivo<textarea value={c.publico.objetivo} onChange={e=>editar(n=>{n.publico.objetivo=e.target.value})}/></label>
   <label>Contexto visível para quem treina<textarea value={c.publico.contexto} onChange={e=>editar(n=>{n.publico.contexto=e.target.value})}/></label>
   <label>O que este caso avalia e o que fica fora do exercício<textarea value={c.publico.escopoAvaliacao||''} onChange={e=>editar(n=>{n.publico.escopoAvaliacao=e.target.value||undefined})}/></label>
   <h3>Ficha de atendimento</h3>{c.publico.secoes.map((s,i)=><div key={i} className={styles.group}><label>Título da seção<input value={s.titulo} onChange={e=>editar(n=>{n.publico.secoes[i].titulo=e.target.value})}/></label><label>Informações disponíveis — uma por linha<textarea value={s.itens.join('\n')} onChange={e=>editar(n=>{n.publico.secoes[i].itens=linhas(e.target.value)})}/></label><button className={styles.link} onClick={()=>editar(n=>{n.publico.secoes.splice(i,1)})}>Remover seção</button></div>)}<button className={styles.secondary} disabled={c.publico.secoes.length>=8} onClick={()=>editar(n=>{n.publico.secoes.push({titulo:'Nova seção',itens:['Informação disponível']})})}>Adicionar seção</button>
   <label>Procedimentos autorizados — um por linha<textarea rows={6} value={c.publico.procedimentos.join('\n')} onChange={e=>editar(n=>{n.publico.procedimentos=linhas(e.target.value)})}/></label>
   <h3>Pacientes e variantes</h3><p>Estas instruções ficam reservadas. As variantes precisam continuar compatíveis com a ficha e os critérios.</p>
   {[c.paciente,...c.variantes].map((p,i)=>{const update=(k:string,v:any)=>editar(n=>{(i===0?n.paciente:n.variantes[i-1])[k]=v});return <details className={styles.group} key={i} open={i===0}><summary>{i===0?'Paciente principal':`Variante ${i}`} · {p.nome}</summary><label>Nome fictício<input value={p.nome} onChange={e=>update('nome',e.target.value)}/></label><label>Primeira mensagem<textarea maxLength={800} value={p.abertura} onChange={e=>update('abertura',e.target.value)}/></label><label>Reação aos limites<select aria-label="Reação aos limites" value={p.postura||'negociavel'} onChange={e=>update('postura',e.target.value)}><option value="negociavel">Pode aceitar uma solução suficiente</option><option value="resistencia_persistente">Contesta o limite mesmo após explicação correta</option></select></label><label>Comportamento<textarea value={p.comportamento} onChange={e=>update('comportamento',e.target.value)}/></label><label>Fatos e condições de revelação — um por linha<textarea value={p.fatos.join('\n')} onChange={e=>update('fatos',linhas(e.target.value))}/></label><label>Limites da personagem<textarea value={p.limites} onChange={e=>update('limites',e.target.value)}/></label>{i>0&&<button className={styles.link} onClick={()=>editar(n=>{n.variantes.splice(i-1,1)})}>Remover variante</button>}</details>})}
   <button className={styles.secondary} disabled={c.variantes.length>=3} onClick={()=>editar(n=>{n.variantes.push({...structuredClone(n.paciente),nome:'Nova paciente'})})}>Adicionar variante</button>
   <h3>Competências avaliadas</h3>
   <p className={styles.small}>Marque as competências da biblioteca que entram na análise deste caso e distribua os pesos. O comportamento esperado em cada nível vem da biblioteca e é copiado para o caso ao salvar. Por padrão o avaliador segue a descrição da competência; ajuste o critério só quando este caso pedir algo específico. De 3 a 7 competências.</p>
   <p>Soma dos pesos: <strong className={soma!==100?styles.pesoErrado:undefined}>{soma} / 100</strong> · {c.rubrica.length} marcada{c.rubrica.length===1?'':'s'} <button type="button" className={styles.link} disabled={!c.rubrica.length} onClick={distribuir}>Distribuir igualmente</button></p>
   {!biblioteca.length&&<p className={styles.notice}>A biblioteca de competências não carregou. As competências já marcadas continuam editáveis; para acrescentar outras, recarregue.</p>}
   {linhasRubrica.map(l=><div key={l.id} className={styles.group}>
    <div className={styles.compHead}><label className={styles.checkLabel}><input type="checkbox" checked={l.marcada} disabled={!l.marcada&&(c.rubrica.length>=7||!l.biblioteca)} onChange={()=>alternar(l)}/><strong>{l.nome}</strong></label>{l.marcada&&<label className={styles.peso}>Peso<input type="number" min="1" max="100" value={l.dim!.peso} onChange={e=>editarDim(l.id,'peso',Number(e.target.value))}/></label>}{!l.biblioteca&&<small className={styles.small}>{l.dim&&!l.dim.niveis?'Sem os quatro níveis: desmarque, ou peça à Vertho que a inclua na biblioteca.':'Fora da biblioteca (excluída): este caso mantém o próprio snapshot.'}</small>}</div>
    {l.marcada&&(()=>{const segue=!!l.biblioteca&&(l.dim!.criterio||'')===(l.biblioteca.descricao||'');return segue&&!ajustando.has(l.id)
     ? <p className={styles.small}>Critério: segue a descrição da competência. <button type="button" className={styles.link} onClick={()=>setAjustando(s=>new Set(s).add(l.id))}>Ajustar para este caso</button></p>
     : <div><label>Critério neste caso (o que observar)<textarea value={l.dim!.criterio} onChange={e=>editarDim(l.id,'criterio',e.target.value)}/></label>{l.biblioteca&&!segue&&<button type="button" className={styles.link} onClick={()=>{editarDim(l.id,'criterio',l.biblioteca!.descricao||'');setAjustando(s=>{const n=new Set(s);n.delete(l.id);return n;})}}>Usar a descrição da competência</button>}</div>;})()}
    {l.niveis&&<details><summary>Comportamento esperado por nível</summary><dl className={styles.niveis}>{NIVEIS_COMPORTAMENTO.map(n=><div key={n}><dt>{rotuloClassificacao[n]}</dt><dd>{l.niveis![n]}</dd></div>)}</dl></details>}
   </div>)}
   <label>Desfechos permitidos — identificadores separados por vírgula<input value={c.desfechos.join(', ')} onChange={e=>editar(n=>{n.desfechos=e.target.value.split(',').map(s=>s.trim())})}/></label><label>Ocorrências críticas — identificadores separados por vírgula<input value={c.ocorrenciasCriticas.join(', ')} onChange={e=>editar(n=>{n.ocorrenciasCriticas=e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}/></label>
  </fieldset>
  <div className={styles.filters}><button className={styles.secondary} onClick={()=>setPreview(!preview)}>{preview?'Fechar prévia':'Conferir ficha visível'}</button><button className={styles.primary} disabled={busy||registro.estado==='publicado'} onClick={()=>enviar('salvar')}>Salvar rascunho</button>{registro.id&&registro.estado==='rascunho'&&<button className={styles.primary} disabled={busy} onClick={()=>{if(window.confirm(noCatalogo?'Publicar no Catálogo Vertho? A versão publicada anterior deste caso será arquivada para todas as clínicas.':'Publicar esta versão para os treinos da clínica?'))enviar('publicar')}}>{noCatalogo?'Publicar no catálogo':'Publicar versão'}</button>}</div>
  {preview&&<aside className={styles.ficha}><h2>{c.publico.titulo}</h2><p>{c.publico.contexto}</p>{c.publico.secoes.map((s,i)=><section key={i}><h3>{s.titulo}</h3><ul>{s.itens.map((t,j)=><li key={j}>{t}</li>)}</ul></section>)}<h3>Procedimentos</h3><ul>{c.publico.procedimentos.map((p,i)=><li key={i}>{p}</li>)}</ul></aside>}
 </div>;
}
