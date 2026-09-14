'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
type Resultado = { isFinal: boolean; 0: { transcript: string } };
type Reconhecedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<Resultado> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type JanelaVoz = Window & {
  SpeechRecognition?: new () => Reconhecedor;
  webkitSpeechRecognition?: new () => Reconhecedor;
};
export default function Ditado({
  disabled,
  onTexto,
}: {
  disabled: boolean;
  onTexto: (texto: string) => void;
}) {
  const t = useTranslations('SimuladorVendas'),
    locale = useLocale();
  const [disponivel, setDisponivel] = useState(false),
    [gravando, setGravando] = useState(false),
    [erro, setErro] = useState('');
  const ref = useRef<Reconhecedor | null>(null),
    callback = useRef(onTexto);
  useEffect(() => {
    callback.current = onTexto;
  }, [onTexto]);
  useEffect(() => {
    const w = window as JanelaVoz;
    setDisponivel(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      if (ref.current) {
        ref.current.onresult = null;
        ref.current.onend = null;
        ref.current.onerror = null;
        ref.current.abort();
      }
    };
  }, []);
  useEffect(() => {
    if (disabled) ref.current?.stop();
  }, [disabled]);
  function alternar() {
    if (gravando) {
      ref.current?.stop();
      return;
    }
    const w = window as JanelaVoz,
      Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    ref.current = recognition;
    recognition.lang = locale;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++)
        if (event.results[i].isFinal) callback.current(event.results[i][0].transcript.trim());
    };
    recognition.onend = () => setGravando(false);
    recognition.onerror = () => {
      setErro(t('dictationError'));
      setGravando(false);
    };
    try {
      setErro('');
      recognition.start();
      setGravando(true);
    } catch {
      setErro(t('dictationUnavailable'));
    }
  }
  if (!disponivel) return null;
  return (
    <div>
      <button
        type="button"
        onClick={alternar}
        disabled={disabled}
        aria-pressed={gravando}
        title={t('dictationHint')}
      >
        {gravando ? <Square size={15} /> : <Mic size={15} />}{' '}
        {t(gravando ? 'dictationStop' : 'dictationStart')}
      </button>
      {erro && <p role="status">{erro}</p>}
    </div>
  );
}
