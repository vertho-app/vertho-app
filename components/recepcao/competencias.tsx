'use client';
import { useEffect, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { competenciaSchema, NIVEIS_COMPORTAMENTO, rotuloClassificacao } from '@/lib/recepcao/schema';
import styles from './treino.module.css';

type Competencia = { id:string; codigo:string; nome:string; descricao:string; niveis:Record<string,string>; ativo:boolean; revisao:number };
const vazia = () => ({ codigo:'', nome:'', descricao:'', niveis:{ n1:'', n2:'', n3:'', n4:'' } });

// Biblioteca global (Catálogo Vertho). Quem vê a aba Cenários lê; só a plataforma edita. Os cenários
// copiam nome/critério/níveis ao salvar, então editar ou excluir aqui não muda um caso publicado.
export default function CompetenciasRecepcao({ empresaId, admin }: { empresaId:string; admin:boolean }) {
 const [lista,setLista]=useState<Competencia[]>([]),[podeEditar,setPodeEditar]=useState(false);
 const [erro,setErro]=useState(''),[busy,setBusy]=useState(false);
 const [editor,setEditor]=useState<{ id?:string; revisao?:number; conteudo:ReturnType<typeof vazia> }|null>(null);
 const generation=useRef(0);
 async function api(params:Record<string,string>={},body?:unknown) {
  const q=new URLSearchParams({...params,...(admin?{empresaId}:{})});
  const r=await fetchAuth(`/api/recepcao/gestao?${q}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body as object,...(admin?{empresaId}:{})})}:{cache:'no-store'});
  const d=await r.json();if(!r.ok) throw new Error(d.campos?.length?d.campos.map((c:any)=>`${c.campo}: ${c.erro}`).join('\n'):d.error||'Não foi possível carregar.');return d;
 }
 async function carregar(ticket=generation.current) {
  const d=await api({visao:'competencias',inativas:'1'});
  if(ticket===generation.current){setLista(d.competencias);setPodeEditar(!!d.podeEditar);}
 }
 useEffect(()=>{const ticket=++generation.current;setErro('');setBusy(true);setEditor(null);carregar(ticket).catch(e=>{if(ticket===generation.current)setErro(e.message)}).finally(()=>{if(ticket===generation.current)setBusy(false)});return()=>{generation.current++}},[empresaId]);
 async function executar(cmd:Record<string,unknown>) {
  if(busy)return;setBusy(true);setErro('');
  try{await api({},{acao:'competencia',...cmd});setEditor(null);await carregar();}catch(e:any){setErro(e.message)}finally{setBusy(false)}
 }
 function salvar() {
  if(!editor)return;
  const parsed=competenciaSchema.safeParse(editor.conteudo);
  if(!parsed.success){setErro(parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('\n'));return;}
  executar({op:'salvar',id:editor.id,revisao:editor.revisao,conteudo:parsed.data});
 }
 const campo=(k:'codigo'|'nome'|'descricao',v:string)=>setEditor(e=>e&&({...e,conteudo:{...e.conteudo,[k]:v}}));
 const nivel=(n:string,v:string)=>setEditor(e=>e&&({...e,conteudo:{...e.conteudo,niveis:{...e.conteudo.niveis,[n]:v}}}));
 const ativas=lista.filter(c=>c.ativo),inativas=lista.filter(c=>!c.ativo);
 if(editor) return <section className={styles.management} aria-label="Editar competência">
  <header className={styles.sectionHead}><div><p className={styles.eyebrow}>Biblioteca de competências</p><h2>{editor.id?'Editar competência':'Nova competência'}</h2></div><button className={styles.secondary} disabled={busy} onClick={()=>{setEditor(null);setErro('')}}>Voltar à biblioteca</button></header>
  {erro&&<p role="alert" className={styles.error}>{erro}</p>}
  <div className={styles.editor}><fieldset disabled={busy}>
   <div className={styles.formGrid}><label>Código (não muda depois de criado)<input value={editor.conteudo.codigo} disabled={!!editor.id} onChange={e=>campo('codigo',e.target.value)} placeholder="ex.: escuta_ativa"/></label><label>Nome<input value={editor.conteudo.nome} onChange={e=>campo('nome',e.target.value)}/></label></div>
   <label>O que observar (descrição geral; cada caso ganha o próprio critério)<textarea value={editor.conteudo.descricao} onChange={e=>campo('descricao',e.target.value)}/></label>
   <h3>Comportamento esperado por nível</h3>
   {NIVEIS_COMPORTAMENTO.map(n=><label key={n}>{rotuloClassificacao[n]}<textarea value={editor.conteudo.niveis[n]} onChange={e=>nivel(n,e.target.value)}/></label>)}
  </fieldset>
  <div className={styles.filters}><button className={styles.primary} disabled={busy} onClick={salvar}>{editor.id?'Salvar alterações':'Criar competência'}</button></div></div>
 </section>;
 return <section className={styles.management} aria-label="Biblioteca de competências">
  <header className={styles.sectionHead}><div><p className={styles.eyebrow}>O que a análise observa</p><h2>Biblioteca de competências</h2></div>{podeEditar&&<button className={styles.primary} disabled={busy} onClick={()=>{setErro('');setEditor({conteudo:vazia()})}}>Nova competência</button>}</header>
  <p className={styles.small}>Cada cenário escolhe quais destas competências entram na análise e com que peso. O comportamento por nível é copiado para o cenário ao salvar: mudar aqui não altera casos já publicados. {podeEditar?'Excluir tira a competência das listas; os casos que a usam mantêm o próprio snapshot.':'A biblioteca é mantida pela Vertho.'}</p>
  {erro&&<p role="alert" className={styles.error}>{erro}</p>}
  {busy&&<p role="status">Carregando…</p>}
  {!busy&&!ativas.length&&<p className={styles.empty}>Nenhuma competência ativa na biblioteca.</p>}
  <div className={styles.caseGrid}>{ativas.map(c=><article key={c.id}><p className={styles.eyebrow}>Catálogo Vertho · {c.codigo}</p><h3>{c.nome}</h3><p>{c.descricao}</p><details><summary>Comportamento por nível</summary><dl className={styles.niveis}>{NIVEIS_COMPORTAMENTO.map(n=><div key={n}><dt>{rotuloClassificacao[n]}</dt><dd>{c.niveis?.[n]}</dd></div>)}</dl></details>{podeEditar&&<div className={styles.filters}><button className={styles.secondary} disabled={busy} onClick={()=>{setErro('');setEditor({id:c.id,revisao:c.revisao,conteudo:{codigo:c.codigo,nome:c.nome,descricao:c.descricao||'',niveis:{n1:c.niveis?.n1||'',n2:c.niveis?.n2||'',n3:c.niveis?.n3||'',n4:c.niveis?.n4||''}}})}}>Editar</button><button className={styles.link} disabled={busy} onClick={()=>{if(window.confirm(`Excluir "${c.nome}" da biblioteca? Os casos que a usam mantêm o próprio snapshot.`))executar({op:'excluir',id:c.id,revisao:c.revisao})}}>Excluir da biblioteca</button></div>}</article>)}</div>
  {inativas.length>0&&<details className={styles.group}><summary>Excluídas ({inativas.length})</summary>{inativas.map(c=><p key={c.id}><strong>{c.nome}</strong> · {c.codigo}{podeEditar&&<> · <button className={styles.link} disabled={busy} onClick={()=>executar({op:'restaurar',id:c.id,revisao:c.revisao})}>Restaurar</button></>}</p>)}</details>}
 </section>;
}
