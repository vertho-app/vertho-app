'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { speechTranscript, type SpeechResult } from '@/lib/speech-transcript';

/**
 * Botão de gravação que usa a Web Speech API (nativo do browser)
 * para transcrever voz em pt-BR diretamente no textarea.
 *
 * Props:
 * - value: texto atual do campo (para concatenar)
 * - onChange: callback(novoTexto) chamado conforme o usuário fala
 * - disabled: booleano para desabilitar o botão
 */
interface MicInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export interface MicInputHandle {
  stop: () => void;
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

function disposeRecognition(rec: Recognition | null) {
  if (!rec) return;
  rec.onresult = null;
  rec.onerror = null;
  rec.onend = null;
  try { rec.abort(); } catch {}
}

const MicInput = forwardRef<MicInputHandle, MicInputProps>(function MicInput({ value, onChange, disabled }, ref) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<Recognition | null>(null);

  // Ao enviar/trocar de campo, ignore inclusive o resultado final assíncrono.
  const cancel = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    disposeRecognition(rec);
    setListening(false);
  }, []);

  // Expõe stop() pro parent — usado pra encerrar a gravação ao enviar mensagem.
  useImperativeHandle(ref, () => ({
    stop: cancel,
  }), [cancel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as SpeechWindow;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    setSupported(true);
  }, []);

  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  function start() {
    if (recognitionRef.current || disabled) return;
    setError('');
    const w = window as SpeechWindow;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = 'pt-BR';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      // Texto que já existe no campo no momento do start
      const baseText = value;

      rec.onresult = (event) => {
        if (recognitionRef.current !== rec) return;
        onChange(speechTranscript(baseText, event.results));
      };

      rec.onerror = (e) => {
        if (recognitionRef.current !== rec) return;
        console.error('[MicInput] erro:', e.error);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setError('Permita o acesso ao microfone');
        } else if (e.error === 'no-speech') {
          setError('Nada detectado');
        } else if (e.error !== 'aborted') {
          setError('Erro: ' + e.error);
        }
        cancel();
      };

      rec.onend = () => {
        if (recognitionRef.current !== rec) return;
        recognitionRef.current = null;
        setListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch (e: unknown) {
      console.error('[MicInput] start erro:', e);
      setError('Não foi possível iniciar o microfone');
      cancel();
    }
  }

  function stop() {
    // O botão mantém o callback até onend para receber a última palavra.
    // A ref do parent usa cancel(), pois o campo já pode ter sido enviado.
    try { recognitionRef.current?.stop(); } catch { cancel(); }
  }

  function toggle() {
    if (listening) stop();
    else start();
  }

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      disposeRecognition(rec);
    };
  }, []);

  if (!supported) {
    return (
      <button type="button" disabled
        title="Microfone não suportado neste navegador"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-gray-600 border border-white/5 cursor-not-allowed">
        <MicOff size={12} /> Indisponível
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={toggle} disabled={disabled} aria-pressed={listening}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
          listening
            ? 'bg-red-500/20 text-red-400 border border-red-400/50 animate-pulse'
            : 'border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10'
        }`}>
        <Mic size={12} /> {listening ? 'Gravando... (clique para parar)' : 'Gravar por voz'}
      </button>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
});

export default MicInput;
