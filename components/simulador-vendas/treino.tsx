'use client';
import { VENDAS_SESSAO } from '@/lib/status';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, Send, RotateCcw } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { PageContainer, PageHero } from '@/components/page-shell';
import { FASES, ROTULOS, NIVEIS, type Comando, type Config, type Estado } from '@/lib/simulador-vendas/schema';
import type { SessaoPublica } from '@/lib/simulador-vendas/core';
import Relatorio from './relatorio';
import Gestao from './gestao';
import Ditado from './ditado';
import styles from './treino.module.css';

type Dados = { empresaId: string; empresaNome: string; habilitado: boolean; configurado: boolean; admin: boolean;
  podeTreinar: boolean; podeConfigurar: boolean; config?: Config | null; sessao: SessaoPublica | null;
  historico: Array<{ id: string; criadoEm: string; nome: string; nivel: 1|2|3; status: Estado['status']; nota: number | null }> };
type Feedback = NonNullable<Estado['feedback']>;
const CAMPOS_FEEDBACK = { realismo: 'Realismo do cliente', desafio: 'Nível de desafio', interacao: 'Qualidade da interação', utilidade: 'Utilidade da devolutiva', aprendizado: 'Aprendizado' } as const;
const estadoNome = { preparando: 'Preparando', em_andamento: 'Em andamento', concluida: 'Concluído', interrompida: 'Interrompido', abandonada: 'Encerrado sem relatório' };
const feedbackVazio: Feedback = { realismo: 0, desafio: 0, interacao: 0, utilidade: 0, aprendizado: 0, comentario: '' };

export default function TreinoVendas({ admin = false }: { admin?: boolean }) {
  const searchParams = useSearchParams(), empresaUrl = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string; slug: string }>>([]);
  const [empresaId, setEmpresaId] = useState(''), [dados, setDados] = useState<Dados | null>(null);
  const [sessao, setSessao] = useState<SessaoPublica | null>(null), [nivel, setNivel] = useState<1|2|3>(1);
  const [aba, setAba] = useState<'treino'|'config'|'gestao'>('treino');
  const [carregando, setCarregando] = useState(true), [ocupado, setOcupado] = useState(''), [erro, setErro] = useState('');
  const [texto, setTexto] = useState(''), [briefing, setBriefing] = useState(''), [habilitado, setHabilitado] = useState(false), [limite, setLimite] = useState('');
  const [confirmar, setConfirmar] = useState<'encerrar'|'abandonar'|null>(null), [feedback, setFeedback] = useState(feedbackVazio);
  const pending = useRef<{ key: string; id: string } | null>(null), running = useRef(false), generation = useRef(0);
  const fim = useRef<HTMLDivElement>(null);
  async function api(url: string, init?: RequestInit) {
    const response = await fetchAuth(url, { ...init, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação. Tente novamente.');
    return body;
  }
  async function carregar(id = empresaId, sessaoId?: string, ticket = generation.current) {
    const q = new URLSearchParams(); if (admin && id) q.set('empresaId', id); if (sessaoId) q.set('sessaoId', sessaoId);
    const d: Dados = await api(`/api/simulador-vendas?${q}`);
    if (ticket !== generation.current) return;
    setDados(d); setSessao(d.sessao); setFeedback(d.sessao?.feedback || feedbackVazio);
  }
  useEffect(() => {
    let alive = true;
    if (admin) api('/api/simulador-vendas/config').then(d => { if (alive) setEmpresas(d.empresas); }).catch(e => { if (alive) setErro(e.message); }).finally(() => { if (alive) setCarregando(false); });
    return () => { alive = false; generation.current++; };
  }, [admin]);
  useEffect(() => { if (admin && empresaUrl && empresas.some(e => e.id === empresaUrl)) setEmpresaId(empresaUrl); }, [admin, empresaUrl, empresas]);
  useEffect(() => {
    const ticket = ++generation.current; setDados(null); setSessao(null); setTexto(''); pending.current = null; setConfirmar(null); setAba('treino');
    if (admin && !empresaId) return;
    setCarregando(true); setErro('');
    carregar(empresaId, undefined, ticket).catch(e => { if (ticket === generation.current) setErro(e.message); }).finally(() => { if (ticket === generation.current) setCarregando(false); });
  }, [admin, empresaId]);
  useEffect(() => { setBriefing(dados?.config?.briefing || ''); setHabilitado(dados?.config?.habilitado || false); setLimite(dados?.config?.limite_sessoes?.toString() || ''); }, [dados?.config]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }, [sessao?.mensagens.length, ocupado]);
  useEffect(() => {
    if (!sessao?.processando || ocupado) return;
    const ticket = generation.current;
    const timer = window.setInterval(() => { carregar(empresaId, sessao.id, ticket).catch(e => { if (ticket === generation.current) setErro(e.message); }); }, 5000);
    return () => window.clearInterval(timer);
  }, [sessao?.id, sessao?.processando, ocupado, empresaId]);

  async function agir(acao: Comando['acao']) {
    if (running.current || (acao === 'responder' && !texto.trim())) return;
    const ticket = generation.current; running.current = true; setOcupado(acao); setErro(''); setConfirmar(null);
    const conteudo = acao === 'responder' ? { mensagem: texto.trim() } : acao === 'feedback' ? { feedback } : acao === 'iniciar' ? { nivel: sessao?.status === VENDAS_SESSAO.PREPARANDO ? sessao.nivel : nivel } : {};
    const key = JSON.stringify([empresaId, acao, acao === 'iniciar' ? null : sessao?.id, conteudo]);
    if (!pending.current || pending.current.key !== key) pending.current = { key, id: acao === 'iniciar' && sessao?.status === VENDAS_SESSAO.PREPARANDO ? sessao.id : crypto.randomUUID() };
    const body = { acao, ...conteudo, requestId: pending.current.id, ...(admin ? { empresaId } : {}),
      ...(acao !== 'iniciar' ? { sessaoId: sessao?.id, revisao: sessao?.revisao } : {}) };
    try {
      const d = await api('/api/simulador-vendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (ticket !== generation.current) return;
      setSessao(d.sessao); pending.current = null;
      if (acao === 'responder' || acao === 'iniciar') setTexto('');
      await carregar(empresaId, d.sessao.id, ticket).catch(() => { if (ticket === generation.current) setErro('A ação foi salva. Atualize para recarregar o histórico.'); });
    } catch (e) {
      if (ticket === generation.current) {
        setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
        await carregar(empresaId, sessao?.id, ticket).catch(() => {});
      }
    } finally { running.current = false; if (ticket === generation.current) setOcupado(''); }
  }
  async function salvarConfig() {
    if (running.current) return;
    const ticket = generation.current; running.current = true; setOcupado('config'); setErro('');
    try {
      await api('/api/simulador-vendas/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaId, briefing, habilitado, limiteSessoes: limite ? Number(limite) : null }) });
      await carregar(empresaId, sessao?.id, ticket); if (ticket === generation.current) setAba('treino');
    } catch (e) { if (ticket === generation.current) setErro(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { running.current = false; if (ticket === generation.current) setOcupado(''); }
  }
  async function abrir(id: string) {
    if (running.current) return;
    running.current = true; setOcupado('historico'); setErro(''); const ticket = ++generation.current;
    try { await carregar(empresaId, id, ticket); setTexto(''); pending.current = null; setConfirmar(null); }
    catch (e) { if (ticket === generation.current) setErro(e instanceof Error ? e.message : 'Não foi possível abrir.'); }
    finally { running.current = false; if (ticket === generation.current) setOcupado(''); }
  }
  const travado = !!ocupado || sessao?.processando === true;
  const aberto = sessao?.status === VENDAS_SESSAO.EM_ANDAMENTO, preparando = sessao?.status === VENDAS_SESSAO.PREPARANDO;
  const podeNovo = !aberto && !preparando && !dados?.historico.some(h => [VENDAS_SESSAO.EM_ANDAMENTO, VENDAS_SESSAO.PREPARANDO].some(status => status === h.status));
  const terminou = sessao && [VENDAS_SESSAO.CONCLUIDA, VENDAS_SESSAO.INTERROMPIDA].some(status => status === sessao.status);

  return <PageContainer className={styles.root}>
    <PageHero showBack={false} eyebrow="Simulador de vendas · metodologia PACE" title="Pratique a conversa." titleAccent="Aprenda com ela."
      subtitle="Negocie com um cliente fictício, descubra o que importa para ele e receba uma devolutiva sobre sua condução."/>
    {admin && <div className={styles.admin}><label>Empresa do treinamento<select value={empresaId} disabled={travado} onChange={e => setEmpresaId(e.target.value)}><option value="">Selecione uma empresa</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
      {dados && <p className={`${styles.muted} mt-3`}>{dados.habilitado ? 'Disponível para os participantes desta empresa.' : 'Disponível para teste administrativo. A equipe ainda não tem acesso.'}</p>}
    </div>}
    {dados && admin && <nav aria-label="Áreas do simulador" className={styles.tabs}><button className={aba === 'treino' ? styles.tabActive : undefined} aria-current={aba === 'treino' ? 'page' : undefined} disabled={travado} onClick={() => setAba('treino')}>Experimentar treino</button>{dados.podeConfigurar && <button className={aba === 'config' ? styles.tabActive : undefined} aria-current={aba === 'config' ? 'page' : undefined} disabled={travado} onClick={() => setAba('config')}>Configuração da empresa</button>}<button className={aba === 'gestao' ? styles.tabActive : undefined} aria-current={aba === 'gestao' ? 'page' : undefined} disabled={travado} onClick={() => setAba('gestao')}>Histórico da empresa</button></nav>}
    {erro && <div role="alert" className={styles.error}><p className="flex-1">{erro}</p>{dados && <button disabled={!!ocupado} onClick={() => carregar(empresaId, sessao?.id).then(() => setErro('')).catch(e => setErro(e.message))}><RotateCcw size={15}/>Atualizar</button>}</div>}
    {carregando ? <div role="status" className={styles.empty}>Carregando seu espaço de treino…</div> : !dados ? <div className={styles.empty}>{admin && !empresaId ? 'Selecione a empresa para configurar ou experimentar o simulador.' : 'Seu treinamento aparecerá aqui quando o acesso estiver disponível.'}</div> : aba === 'config' ? <form className={styles.card} onSubmit={e => { e.preventDefault(); salvarConfig(); }}>
      <h2 className="text-xl mb-2">O que sua equipe vende?</h2><p className={`${styles.muted} mb-5`}>Descreva produtos, clientes, diferenciais, contexto de mercado e condições comerciais. Cada novo treino usa uma cópia deste briefing.</p>
      <label htmlFor="pace-briefing">Briefing comercial</label><textarea id="pace-briefing" className="mt-2" value={briefing} onChange={e => setBriefing(e.target.value)} minLength={40} maxLength={24000} required rows={12} placeholder="Setor e público-alvo; produto ou serviço; benefícios e diferenciais; faixas de preço e condições; principais desafios comerciais."/>
      <div className="grid sm:grid-cols-2 gap-6 mt-5"><label>Limite de treinos por pessoa<input type="number" min={1} max={10000} value={limite} onChange={e => setLimite(e.target.value)} placeholder="Sem limite contratado"/><span className={styles.muted}>Deixe vazio para não impor uma cota. Testes administrativos não consomem a cota da equipe.</span></label>
      <label className="content-start"><span className="flex items-center gap-3"><input type="checkbox" checked={habilitado} onChange={e => setHabilitado(e.target.checked)}/>Liberar para participantes da empresa</span><span className={styles.muted}>O acesso usa o login que as pessoas já têm na Vertho.</span></label></div>
      <button className={`${styles.primary} mt-6`} disabled={!!ocupado} type="submit">Salvar configuração</button>
    </form> : aba === 'gestao' ? <Gestao key={empresaId} empresaId={dados.empresaId}/> : <>
      {!dados.configurado && <div className={styles.card}><h2 className="text-lg mb-2">Prepare o contexto da empresa</h2><p className={`${styles.muted} mb-4`}>O criador usa o briefing comercial para montar clientes e negociações relevantes para a equipe.</p>{dados.podeConfigurar && <button onClick={() => setAba('config')}>Configurar briefing <ArrowRight size={16}/></button>}</div>}
      <div className={`${styles.workspace} mt-5`}>
        <aside className={styles.card}>
          <h2 className="text-lg mb-3">{sessao?.cenario ? 'Antes da conversa' : 'Seu próximo desafio'}</h2>
          {sessao?.cenario && <><p className="font-semibold">{sessao.cenario.nome}</p><p className={styles.muted}>{sessao.cenario.cargo} · {sessao.cenario.empresa}</p><p className="text-sm leading-relaxed my-4 whitespace-pre-wrap">{sessao.cenario.contexto}</p></>}
          {podeNovo && <><label>Nível do cliente<select value={nivel} disabled={travado} onChange={e => setNivel(Number(e.target.value) as 1|2|3)}>{([1, 2, 3] as const).map(n => <option key={n} value={n}>{NIVEIS[n]}</option>)}</select></label><p className={`${styles.muted} my-3`}>A complexidade das objeções aumenta conforme o nível. Você conduz a conversa do primeiro contato ao compromisso.</p><button className={styles.primary} disabled={travado || !dados.configurado || !dados.podeTreinar} onClick={() => agir('iniciar')}>Iniciar treino <ArrowRight size={16}/></button></>}
          {sessao && <p className={`${styles.muted} mt-4`}>{NIVEIS[sessao.nivel]} · {estadoNome[sessao.status]}</p>}
          {dados.historico.length > 0 && <nav aria-label="Seus treinos recentes" className={styles.history}><h3 className="text-xs uppercase tracking-wider text-slate-400 mb-1">Seus últimos treinos</h3>{dados.historico.map(h => <button className={`${styles.historyItem} ${sessao?.id === h.id ? styles.historyActive : ''}`} aria-current={sessao?.id === h.id ? 'true' : undefined} disabled={travado} key={h.id} onClick={() => abrir(h.id)}><span className="block">{h.nome}</span><small className="text-slate-400">{new Date(h.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {estadoNome[h.status]}{h.nota !== null ? ` · ${h.nota.toLocaleString('pt-BR')}` : ''}</small></button>)}</nav>}
        </aside>
        <div className={styles.card}>
          <ol aria-label="Etapas PACE" className={styles.rail}>{FASES.map(f => <li key={f} className={sessao?.fase === f ? styles.phaseActive : undefined} aria-current={sessao?.fase === f ? 'step' : undefined}><b>{ROTULOS[f][0]}</b><span>{ROTULOS[f]}</span></li>)}</ol>
          {!sessao ? <div className={styles.empty}><p className="text-lg text-white mb-2">Toda boa negociação começa com uma conversa.</p><p>Escolha o nível e inicie seu treino.<br/>O cliente reage às suas perguntas, argumentos e propostas.</p></div> : <>
            {preparando && <div className={styles.empty}><p>Seu cenário está sendo preparado.</p>{!travado && <button className="mt-3" onClick={() => agir('iniciar')}>Retomar preparação</button>}</div>}
            {sessao.aviso && <p role="status" className="text-sm text-amber-200 mb-4">{sessao.aviso}</p>}
            <div className={styles.chat} role="log" aria-label="Conversa com o cliente" aria-live="polite">
              {aberto && sessao.mensagens.length === 0 && <p className={styles.muted}>Você está com {sessao.cenario?.nome}. Apresente-se e abra a conversa.</p>}
              {sessao.mensagens.map(m => <article className={`${styles.message} ${m.autor === 'vendedor' ? styles.seller : ''}`} key={m.id} data-author={m.autor}><small>{m.autor === 'vendedor' ? 'Você' : sessao.cenario?.nome || 'Cliente'} · turno {m.turno}</small><p>{m.texto}</p></article>)}
              {ocupado && ['iniciar', 'responder', 'encerrar'].includes(ocupado) && <p role="status" className="text-sm text-cyan-200 flex items-center gap-2"><Loader2 size={16} className="animate-spin"/>{ocupado === 'encerrar' ? 'Analisando sua conversa…' : ocupado === 'iniciar' ? 'Criando seu cliente…' : 'O cliente está respondendo…'}</p>}<div ref={fim}/>
            </div>
            {aberto && <form className={styles.composer} onSubmit={e => { e.preventDefault(); agir('responder'); }}><label htmlFor="pace-mensagem">Sua mensagem</label><textarea id="pace-mensagem" className="mt-2" rows={3} maxLength={4000} value={texto} disabled={travado || !sessao.turnosRestantes} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); agir('responder'); } }} placeholder="Conduza a conversa com o cliente…"/><div className={styles.actions}><Ditado disabled={travado || !sessao.turnosRestantes} onTexto={t => setTexto(prev => `${prev}${prev ? ' ' : ''}${t}`.slice(0, 4000))}/><button className={styles.primary} type="submit" disabled={travado || !texto.trim() || !sessao.turnosRestantes}><Send size={16}/>Enviar</button></div><p className={`${styles.muted} mt-2`}>Enter envia · Shift + Enter quebra a linha. Revise o texto ditado antes de enviar.</p></form>}
            {aberto && <div className="mt-6"><button disabled={travado || !sessao.mensagens.length} onClick={() => setConfirmar('encerrar')}>Encerrar e receber devolutiva</button>{sessao.sugerirEncerramento && <p className={`${styles.muted} mt-2`}>A conversa parece estar chegando ao fim. Você pode continuar ou gerar sua devolutiva.</p>}{!sessao.turnosRestantes && <p className={`${styles.muted} mt-2`}>Você chegou ao limite deste treino. Gere a devolutiva para concluir.</p>}</div>}
            {(aberto || preparando) && <button className="mt-4" disabled={travado} onClick={() => setConfirmar('abandonar')}>Encerrar sem relatório</button>}
            {confirmar && <div className="rounded-xl border border-cyan-300/30 p-4 mt-4"><p className="text-sm mb-3">{confirmar === 'encerrar' ? 'Concluir esta conversa e gerar sua devolutiva PACE?' : 'Encerrar este treino sem avaliação? As mensagens já enviadas ficam no histórico.'}</p><div className="flex gap-3"><button onClick={() => agir(confirmar)} disabled={travado}>Confirmar encerramento</button><button onClick={() => setConfirmar(null)}>Continuar treino</button></div></div>}
            {sessao.status === VENDAS_SESSAO.INTERROMPIDA && <p className="text-sm text-amber-200 mt-4">Este treino foi interrompido por conduta. O histórico foi preservado e não será pontuado. Você pode iniciar outro treino.</p>}
            {sessao.relatorio && <div className="border-t border-white/10 pt-6 mt-6"><Relatorio relatorio={sessao.relatorio}/></div>}
            {terminou && <details className="mt-6 border-t border-white/10 pt-5"><summary className="cursor-pointer text-sm">{sessao.feedback ? 'Sua avaliação da experiência' : 'Como foi treinar aqui?'}</summary><form onSubmit={e => { e.preventDefault(); agir('feedback'); }} className="mt-4"><div className={styles.feedback}>{(Object.keys(CAMPOS_FEEDBACK) as Array<keyof typeof CAMPOS_FEEDBACK>).map(k => <label key={k}>{CAMPOS_FEEDBACK[k]}<select required value={feedback[k] || ''} onChange={e => setFeedback(prev => ({ ...prev, [k]: Number(e.target.value) }))}><option value="">Selecione de 1 a 5</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>)}</div><label className="mt-4" htmlFor="pace-comentario">Comentário (opcional)</label><textarea id="pace-comentario" className="mt-2" value={feedback.comentario} onChange={e => setFeedback(prev => ({ ...prev, comentario: e.target.value }))} rows={3} maxLength={2000}/><button type="submit" disabled={travado} className="mt-3">Salvar avaliação</button></form></details>}
          </>}
        </div>
      </div>
    </>}
  </PageContainer>;
}
