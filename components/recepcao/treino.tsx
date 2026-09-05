'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, ClipboardList, MessageCircle, Send, RotateCcw, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { RECEPCAO_SESSAO } from '@/lib/status';
import styles from './treino.module.css';

const nomes: Record<string, string> = { acolhimento: 'Acolhimento', compreensao: 'Compreensão da demanda', clareza: 'Clareza e precisão', resolucao: 'Resolução', procedimentos: 'Procedimentos' };
const resultados: Record<string, string> = { remarcado: 'Consulta remarcada', encaminhado: 'Encaminhamento combinado', nao_resolvido: 'Demanda não resolvida', inconclusivo: 'Resultado inconclusivo' };
const classificacoes: Record<string, string> = { adequado: 'Adequado', parcial: 'Parcial', insuficiente: 'Precisa melhorar', nao_observavel: 'Sem oportunidade de observar' };

export default function TreinoRecepcao({ admin = false }: { admin?: boolean }) {
  const searchParams = useSearchParams();
  const empresaNaUrl = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState<any[]>([]), [empresaId, setEmpresaId] = useState('');
  const [dados, setDados] = useState<any>(null), [sessao, setSessao] = useState<any>(null);
  const [carregando, setCarregando] = useState(true), [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState(''), [input, setInput] = useState('');
  const [podeConfigurar, setPodeConfigurar] = useState(false);
  const [confirmarFim, setConfirmarFim] = useState(false);
  const pending = useRef<{ id: string; texto: string } | null>(null);
  const createId = useRef<string | null>(null), running = useRef(false), generation = useRef(0);
  const fim = useRef<HTMLDivElement>(null);

  async function api(url: string, init?: RequestInit) {
    const res = await fetchAuth(url, { ...init, cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Não foi possível concluir. Tente novamente.');
    return body;
  }
  async function carregar(id = empresaId, sessaoId?: string, ticket = generation.current) {
    const q = new URLSearchParams();
    if (admin && id) q.set('empresaId', id);
    if (sessaoId) q.set('sessaoId', sessaoId);
    const d = await api(`/api/recepcao?${q}`);
    if (ticket !== generation.current) return;
    setDados(d); setSessao(d.sessao);
  }
  useEffect(() => {
    let alive = true;
    if (admin) {
      api('/api/recepcao/config').then(d => {
        if (!alive) return;
        setEmpresas(d.empresas); setPodeConfigurar(d.podeConfigurar);
      }).catch(e => { if (alive) setErro(e.message); }).finally(() => { if (alive) setCarregando(false); });
    }
    return () => { alive = false; generation.current++; };
  }, [admin]);
  useEffect(() => {
    if (admin && empresaNaUrl && empresas.some(e => e.id === empresaNaUrl)) setEmpresaId(empresaNaUrl);
  }, [admin, empresaNaUrl, empresas]);
  useEffect(() => {
    const ticket = ++generation.current;
    setDados(null); setSessao(null); setInput(''); pending.current = null; createId.current = null;
    setConfirmarFim(false);
    if (admin && !empresaId) return;
    setCarregando(true); setErro('');
    carregar(empresaId, undefined, ticket).catch(e => { if (ticket === generation.current) setErro(e.message); })
      .finally(() => { if (ticket === generation.current) setCarregando(false); });
  }, [admin, empresaId]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }, [sessao?.historico?.length, ocupado]);

  async function agir(acao: 'iniciar' | 'responder' | 'encerrar') {
    if (running.current) return;
    const texto = input.trim();
    if (acao === 'responder' && !texto) return;
    const ticket = generation.current;
    running.current = true; setOcupado(acao); setErro(''); setConfirmarFim(false);
    const body: any = { acao, ...(admin ? { empresaId } : {}) };
    if (acao === 'iniciar') { createId.current ||= crypto.randomUUID(); body.requestId = createId.current; }
    else { body.sessaoId = sessao.id; body.revisao = sessao.revisao; }
    if (acao === 'responder') {
      if (!pending.current || pending.current.texto !== texto) pending.current = { id: crypto.randomUUID(), texto };
      Object.assign(body, { requestId: pending.current.id, mensagem: texto });
    }
    try {
      const d = await api('/api/recepcao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (ticket !== generation.current) return;
      setSessao(d.sessao);
      if (acao === 'responder') { setInput(''); pending.current = null; }
      if (acao === 'iniciar') { createId.current = null; setInput(''); pending.current = null; }
      // Atualiza também a lista; falha nesta leitura não transforma um envio salvo em falha.
      await carregar(empresaId, d.sessao.id, ticket).catch(() => {});
    } catch (e: any) {
      if (ticket === generation.current) {
        setErro(e.message);
        // Recupera envio que pode ter sido confirmado após a conexão cair. ID pendente é preservado.
        if (sessao?.id) await carregar(empresaId, sessao.id, ticket).catch(() => {});
      }
    } finally { running.current = false; setOcupado(''); }
  }
  async function habilitar() {
    if (running.current) return;
    const ticket = generation.current;
    running.current = true; setOcupado('config'); setErro('');
    try {
      await api('/api/recepcao/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaId, habilitado: !dados.habilitado }) });
      await carregar(empresaId, undefined, ticket);
    } catch (e: any) { if (ticket === generation.current) setErro(e.message); } finally { running.current = false; setOcupado(''); }
  }
  async function abrirHistorico(id: string) {
    if (running.current) return;
    running.current = true; setOcupado('historico'); setErro('');
    setInput(''); pending.current = null; setConfirmarFim(false);
    const ticket = ++generation.current;
    try { await carregar(empresaId, id, ticket); }
    catch (e: any) { if (ticket === generation.current) setErro(e.message); }
    finally { running.current = false; setOcupado(''); }
  }
  const ficha = sessao?.cenario || dados?.ficha;
  const relatorio = sessao?.relatorio;
  const travado = !!ocupado || sessao?.processando;
  const emConversa = sessao && !relatorio;

  return <main className={styles.root}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Prática de atendimento · recepção médica</p><h1>Uma conversa. Um cuidado melhor.</h1><p>Pratique com uma paciente fictícia e receba orientações sobre o seu atendimento.</p></div>
      <span className={styles.piloto}>Piloto · por texto</span>
    </header>
    {admin && <section className={styles.admin} aria-label="Configuração do piloto">
      <label>Clínica vinculada ao treino<select value={empresaId} disabled={!!ocupado} onChange={e => setEmpresaId(e.target.value)}><option value="">Selecione uma empresa</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
      {dados && <div><p>{dados.habilitado ? 'Disponível para a equipe desta clínica.' : 'Disponível apenas para teste administrativo.'}</p>{podeConfigurar && <button className={styles.secondary} disabled={!!ocupado} onClick={habilitar}>{dados.habilitado ? 'Desabilitar para a equipe' : 'Habilitar para a equipe'}</button>}</div>}
    </section>}
    {erro && <div role="alert" className={styles.error}><AlertCircle size={19}/><span>{erro}</span><button onClick={() => { setErro(''); carregar().catch(e => setErro(e.message)); }} disabled={!!ocupado}>Atualizar</button></div>}
    {carregando ? <div className={styles.empty}><Loader2 className={styles.spin}/> Carregando seu espaço de treino…</div> : !dados ? <div className={styles.empty}>{admin && !empresaId ? 'Selecione a empresa para experimentar o atendimento.' : 'O treinamento será exibido aqui quando seu acesso estiver disponível.'}</div> : <>
      <div className={styles.workspace}>
        <aside className={styles.ficha}>
          <div className={styles.fichaTitle}><ClipboardList size={23}/><div><span>Ficha de consulta</span><h2>Clínica Horizonte Exemplo</h2></div></div>
          <p className={styles.small}>Cenário fictício, vinculado a {dados.empresaNome}. Use apenas dados fictícios nas mensagens.</p>
          <details open><summary>Situação do atendimento</summary><p>{ficha.contexto}</p><p><strong>Hoje:</strong> {ficha.agora}</p><p><strong>Consulta anterior:</strong> {ficha.consultaAnterior}</p></details>
          <details open><summary>Alternativas autorizadas</summary><div className={styles.slots}>{ficha.alternativas.map((a: any) => <div key={a.id}><CalendarDays size={17}/><div><strong>{a.data} · {a.hora}</strong><span>{a.profissional}</span>{a.condicao && <small>{a.condicao}</small>}</div></div>)}</div></details>
          <details><summary>Procedimentos da clínica</summary><ul>{ficha.procedimentos.map((p: string) => <li key={p}>{p}</li>)}</ul></details>
        </aside>
        <section className={styles.conversa} aria-label="Atendimento simulado">
          <div className={styles.chatHeader}><div className={styles.avatar}>M</div><div><h2>{sessao ? 'Marina' : 'A segunda remarcação'}</h2><p>{sessao ? 'Paciente fictícia · treino individual' : 'Uma paciente insatisfeita precisa reorganizar sua consulta.'}</p></div>{sessao && <span className={styles.count}>{sessao.respostas}/12 respostas</span>}</div>
          {!sessao ? <div className={styles.start}><MessageCircle size={38}/><h2>Como você conduziria esse atendimento?</h2><p>A clínica já alterou a consulta duas vezes. Leia a ficha ao lado e ajude Marina a encontrar um próximo passo viável.</p><p>Você receberá feedback sobre acolhimento, compreensão, clareza, resolução e procedimentos.</p><button className={styles.primary} onClick={() => agir('iniciar')} disabled={travado}>{ocupado ? 'Iniciando…' : 'Iniciar atendimento'}<ArrowRight size={18}/></button></div> : <>
            <div className={styles.messages} role="log" aria-label="Conversa com Marina" aria-live="polite">
              {sessao.historico.map((m: any) => <article key={m.id} className={m.role === 'user' ? styles.sent : styles.received}><span>{m.role === 'user' ? 'Você' : 'Marina'}</span><p>{m.content}</p></article>)}
              {ocupado === 'responder' && <p className={styles.waiting}><Loader2 size={15} className={styles.spin}/> Marina está respondendo…</p>}
              <div ref={fim}/>
            </div>
            {emConversa && <div className={styles.composer}>
              {sessao.status === RECEPCAO_SESSAO.EM_ANDAMENTO && <form onSubmit={e => { e.preventDefault(); agir('responder'); }}><label className={styles.srOnly} htmlFor="recepcao-mensagem">Sua resposta para Marina</label><textarea id="recepcao-mensagem" value={input} onChange={e => setInput(e.target.value)} disabled={travado} maxLength={4000} placeholder="Escreva como você falaria com a paciente…" rows={3}/><button className={styles.send} type="submit" aria-label="Enviar resposta" disabled={travado || !input.trim()}><Send size={20}/></button></form>}
              {sessao.status === 'aguardando_avaliacao' && <p>Você chegou ao limite deste exercício. Gere o relatório para revisar o atendimento.</p>}
              {sessao.processando && <p role="status">Um envio está em processamento. <button className={styles.link} onClick={() => carregar(empresaId, sessao.id).catch(e => setErro(e.message))}>Atualizar conversa</button></p>}
              <div className={styles.finish}><small>O atendimento é simulado; nenhuma consulta real será marcada.</small>{!confirmarFim ? <button className={styles.secondary} disabled={travado || !sessao.respostas} onClick={() => setConfirmarFim(true)}>Encerrar e avaliar</button> : <div><span>Concluir este atendimento?</span><button className={styles.primary} disabled={travado} onClick={() => agir('encerrar')}>Gerar relatório</button><button className={styles.link} onClick={() => setConfirmarFim(false)}>Continuar</button></div>}</div>
              {ocupado === 'encerrar' && <p role="status" className={styles.waiting}><Loader2 className={styles.spin} size={16}/> Analisando suas respostas e preparando o feedback…</p>}
            </div>}
          </>}
        </section>
      </div>
      {relatorio && <section className={styles.report} aria-label="Relatório de atendimento">
        <header><div><p className={styles.eyebrow}>Seu atendimento, em perspectiva</p><h2>{resultados[relatorio.desfecho.tipo]}</h2><p>{relatorio.desfecho.justificativa}</p></div><div className={styles.score}><strong>{relatorio.nota === null ? '—' : relatorio.nota.toLocaleString('pt-BR')}</strong><span>de 100 · cobertura {relatorio.coberturaPercentual}%</span></div></header>
        <p className={styles.small}>Feedback de prática gerado por IA. Esta nota não altera sua avaliação comportamental.</p>
        {relatorio.situacao === 'avaliacao_parcial' && <p className={styles.notice}>Avaliação parcial: algumas competências não puderam ser observadas. Compare apenas treinos com cobertura equivalente.</p>}
        {relatorio.ocorrencias.length > 0 && <div className={styles.error}><AlertCircle/><div><strong>Atenção a estas condutas, independentemente da nota</strong>{relatorio.ocorrencias.map((o: any, i: number) => <p key={i}>{o.motivo}</p>)}</div></div>}
        <div className={styles.dimensions}>{relatorio.dimensoes.map((d: any) => <article key={d.id}><div><h3>{nomes[d.id]}</h3><span>{classificacoes[d.classificacao]}</span></div><p>{d.justificativa}</p>{d.evidencias.map((e: any, i: number) => <blockquote key={i}>“{e.trecho}”</blockquote>)}</article>)}</div>
        <div className={styles.coaching}><div><CheckCircle2 size={21}/><h3>O que funcionou</h3><p>{relatorio.feedback.acerto}</p></div><div><ArrowRight size={21}/><h3>Seu próximo passo</h3><p>{relatorio.feedback.melhoria}</p><p>{relatorio.feedback.novaTentativa}</p></div></div>
        <button className={styles.primary} disabled={travado} onClick={() => agir('iniciar')}><RotateCcw size={18}/> Praticar novamente</button>
      </section>}
      {dados.historico?.length > 0 && <section className={styles.history}><h2>Seus atendimentos</h2><div>{dados.historico.map((h: any) => <button key={h.id} disabled={travado} onClick={() => abrirHistorico(h.id)} aria-current={sessao?.id === h.id ? 'true' : undefined}><span>{new Date(h.data).toLocaleString('pt-BR')}</span><strong>{h.status === RECEPCAO_SESSAO.CONCLUIDA ? `${h.nota ?? '—'}/100${h.situacao === 'atencao_critica' ? ' · atenção' : h.situacao === 'avaliacao_parcial' ? ' · parcial' : ''}` : 'Retomar treino'}</strong></button>)}</div></section>}
    </>}
  </main>;
}
