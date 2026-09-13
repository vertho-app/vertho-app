'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
type Resultado = { isFinal: boolean; 0: { transcript: string } };
type Reconhecedor = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<Resultado> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null };
type JanelaVoz = Window & { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
export default function Ditado({ disabled, onTexto }: { disabled: boolean; onTexto: (texto: string) => void }) {
  const [disponivel, setDisponivel] = useState(false), [gravando, setGravando] = useState(false), [erro, setErro] = useState('');
  const ref = useRef<Reconhecedor | null>(null), callback = useRef(onTexto);
  useEffect(() => { callback.current = onTexto; }, [onTexto]);
  useEffect(() => {
    const w = window as JanelaVoz; setDisponivel(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => { if (ref.current) { ref.current.onresult = null; ref.current.onend = null; ref.current.onerror = null; ref.current.abort(); } };
  }, []);
  useEffect(() => { if (disabled) ref.current?.stop(); }, [disabled]);
  function alternar() {
    if (gravando) { ref.current?.stop(); return; }
    const w = window as JanelaVoz, Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor(); ref.current = recognition;
    recognition.lang = 'pt-BR'; recognition.continuous = true; recognition.interimResults = false;
    recognition.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) callback.current(event.results[i][0].transcript.trim());
    };
    recognition.onend = () => setGravando(false);
    recognition.onerror = () => { setErro('Não foi possível ditar. Confira a permissão do microfone ou digite sua mensagem.'); setGravando(false); };
    try { setErro(''); recognition.start(); setGravando(true); } catch { setErro('O microfone está indisponível. Digite sua mensagem.'); }
  }
  if (!disponivel) return null;
  return <div><button type="button" onClick={alternar} disabled={disabled} aria-pressed={gravando} title="Ditado do navegador. Revise o texto antes de enviar.">
    {gravando ? <Square size={15}/> : <Mic size={15}/>} {gravando ? 'Parar ditado' : 'Ditar mensagem'}
  </button>{erro && <p role="status">{erro}</p>}</div>;
}
