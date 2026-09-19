'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import styles from './treino.module.css';

export default function VozRecepcao({
  sessao,
  nomePersona,
  empresaId,
  disabled,
  onTexto,
  onOcupado,
}: {
  sessao: any;
  nomePersona: string;
  empresaId?: string;
  disabled: boolean;
  onTexto: (texto: string) => void;
  onOcupado: (ocupado: boolean) => void;
}) {
  const t = useTranslations('SimuladorAtendimento');
  const [busy, setBusy] = useState<false | 'ouvir' | 'entrada'>(false),
    [gravando, setGravando] = useState(false),
    [erro, setErro] = useState(''),
    [audio, setAudio] = useState(''),
    [gravacao, setGravacao] = useState<Blob | null>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    alive = useRef(true),
    lock = useRef(false),
    url = useRef('');
  useEffect(() => {
    onOcupado(busy === 'entrada' || gravando);
  }, [busy, gravando, onOcupado]);
  useEffect(() => () => onOcupado(false), [onOcupado]);
  const ultima = sessao.historico.filter((m: any) => m.role === 'assistant').at(-1);
  const ultimaAtual = useRef(ultima?.id);
  ultimaAtual.current = ultima?.id;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((tr) => tr.stop());
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  useEffect(() => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = '';
    setAudio('');
  }, [ultima?.id]);
  function endpoint(acao: string) {
    return `/api/recepcao/voz?${new URLSearchParams({
      acao,
      sessaoId: sessao.id,
      ...(empresaId ? { empresaId } : {}),
      ...(acao === 'ouvir' ? { mensagemId: ultima.id } : {}),
    })}`;
  }
  async function ouvir() {
    if (lock.current) return;
    const mensagemId = ultima?.id;
    lock.current = true;
    setBusy('ouvir');
    setErro('');
    try {
      const r = await fetchAuth(endpoint('ouvir'), { method: 'POST' });
      if (!r.ok) throw new Error((await r.json()).error);
      const b = await r.blob();
      if (alive.current && ultimaAtual.current === mensagemId) {
        url.current = URL.createObjectURL(b);
        setAudio(url.current);
      }
    } catch (e: any) {
      if (alive.current) setErro(e.message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function gravar() {
    if (lock.current) return;
    lock.current = true;
    setBusy('entrada');
    setErro('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error(t('voiceUnsupported'));
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        stream.current.getTracks().forEach((tr) => tr.stop());
        return;
      }
      const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.current?.getTracks().forEach((tr) => tr.stop());
        if (timer.current) clearTimeout(timer.current);
        if (alive.current) {
          setGravando(false);
          setGravacao(new Blob(chunks, { type: rec.mimeType }));
        }
      };
      rec.start();
      setGravacao(null);
      setGravando(true);
      timer.current = setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
      }, 60000);
    } catch (e: any) {
      if (alive.current) setErro(e.message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function transcrever() {
    if (!gravacao || lock.current) return;
    lock.current = true;
    setBusy('entrada');
    setErro('');
    try {
      const form = new FormData();
      form.append('audio', gravacao, 'resposta');
      const r = await fetchAuth(endpoint('transcrever'), { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (alive.current) {
        onTexto(d.texto);
        setGravacao(null);
      }
    } catch (e: any) {
      if (alive.current) setErro(e.message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className={styles.voice}>
      <span>{t('voiceLabel')}</span>
      {audio ? (
        <audio controls src={audio} aria-label={t('voicePersonLine', { name: nomePersona })} />
      ) : (
        <button type="button" className={styles.link} disabled={disabled || !!busy || gravando} onClick={ouvir}>
          {t('voiceListen', { name: nomePersona })}
        </button>
      )}
      {gravando ? (
        <button type="button" className={styles.secondary} onClick={() => recorder.current?.stop()}>
          {t('voiceStop')}
        </button>
      ) : (
        <button type="button" className={styles.link} disabled={disabled || !!busy} onClick={gravar}>
          {t('voiceRecord')}
        </button>
      )}
      {gravacao && (
        <>
          <button type="button" className={styles.secondary} disabled={disabled || !!busy} onClick={transcrever}>
            {t('voiceTranscribe')}
          </button>
          <button type="button" className={styles.link} disabled={!!busy} onClick={() => setGravacao(null)}>
            {t('voiceDiscard')}
          </button>
        </>
      )}
      {busy && <span role="status">{t('voicePreparing')}</span>}
      <p>{t('voiceHelp', { name: nomePersona })}</p>
      {erro && <p role="alert">{erro}</p>}
    </div>
  );
}
