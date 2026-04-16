'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

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

const MicInput = forwardRef<MicInputHandle, MicInputProps>(function MicInput({ value, onChange, disabled }, ref) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef('');

  // Expõe stop() pro parent — usado pra encerrar a gravação ao enviar mensagem.
  useImperativeHandle(ref, () => ({
    stop: () => {
      try { recognitionRef.current?.stop(); } catch {}
      setListening(false);
    },
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    setSupported(true);
  }, []);

  function start() {
    setError('');
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = 'pt-BR';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      // Texto que já existe no campo no momento do start
      baseTextRef.current = value ? value.trimEnd() + (value.trim().length ? ' ' : '') : '';

      rec.onresult = (event: any) => {
        let interim = '';
        let finalTxt = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalTxt += transcript;
          else interim += transcript;
        }
        // Concatena finais no base, adiciona o interim por cima
        if (finalTxt) {
          baseTextRef.current = (baseTextRef.current + finalTxt).replace(/\s+/g, ' ');
          if (!baseTextRef.current.endsWith(' ')) baseTextRef.current += ' ';
        }
        onChange((baseTextRef.current + interim).trimStart());
      };

      rec.onerror = (e: any) => {
        console.error('[MicInput] erro:', e.error);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setError('Permita o acesso ao microfone');
        } else if (e.error === 'no-speech') {
          setError('Nada detectado');
        } else if (e.error !== 'aborted') {
          setError('Erro: ' + e.error);
        }
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch (e: any) {
      console.error('[MicInput] start erro:', e);
      setError('Não foi possível iniciar o microfone');
      setListening(false);
    }
  }

  function stop() {
    try { recognitionRef.current?.stop(); } catch {}
    setListening(false);
  }

  function toggle() {
    if (listening) stop();
    else start();
  }

  // Cleanup ao desmontar
  useEffect(() => {
    return () => { try { recognitionRef.current?.abort(); } catch {} };
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
      <button type="button" onClick={toggle} disabled={disabled}
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
