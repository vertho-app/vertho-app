'use client';

// Formulário de aceite da proposta, na página PÚBLICA (sem login).
//
// A validação de verdade está no server (`registrarAceitePublico` → `validarAceite`):
// o que existe aqui é só o atrito certo antes do clique — os três campos e a
// confirmação explícita. Nada aqui é garantia de nada; quem define o que entra
// no banco é a action.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registrarAceitePublico } from '@/actions/sales/proposal-share';

type Props = {
  token: string;
  cores: {
    accent: string; accentSoft: string; ink: string; ink2: string;
    muted: string; muted2: string; line: string; white: string;
    green: string; greenBg: string; danger: string;
  };
  fontes: { display: string; body: string; mono: string };
};

export default function AceiteForm({ token, cores: C, fontes: F }: Props) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [email, setEmail] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [okEm, setOkEm] = useState<string | null>(null);

  const pronto = nome.trim().length >= 3 && cargo.trim().length >= 2 && email.trim().length > 3 && confirmado;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando || !pronto) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await registrarAceitePublico(token, { nome, cargo, email });
      // `'error' in r` e não `!r.success`: com `strict:false` o TS não estreita
      // união discriminada por booleano.
      if ('error' in r) {
        setErro(r.error);
        return;
      }
      setOkEm(r.aceite.em);
      // O selo de "proposta aceita" é renderizado pelo server a partir do banco.
      router.refresh();
    } catch {
      setErro('Não foi possível registrar o aceite agora. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  if (okEm) {
    return (
      <div
        style={{
          background: C.greenBg,
          border: `1px solid ${C.green}33`,
          borderRadius: 14,
          padding: '22px 24px',
          color: C.green,
          fontFamily: F.body,
        }}
      >
        <div style={{ fontFamily: F.display, fontSize: 19, fontWeight: 600 }}>Aceite registrado. Obrigado!</div>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: C.ink2 }}>
          Registramos o seu aceite em {new Date(okEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
          O seu contato na Vertho vai responder confirmando os próximos passos.
        </p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${C.line}`,
    borderRadius: 9,
    padding: '11px 13px',
    fontSize: 14.5,
    fontFamily: F.body,
    color: C.ink,
    background: C.white,
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: F.mono,
    fontSize: 9.5,
    letterSpacing: '.14em',
    textTransform: 'uppercase',
    color: C.muted2,
    marginBottom: 6,
  };

  return (
    <form onSubmit={enviar} style={{ fontFamily: F.body }}>
      <div className="prop-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle} htmlFor="aceite-nome">Nome completo</label>
          <input
            id="aceite-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            maxLength={120}
            style={inputStyle}
            placeholder="Como você assina"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="aceite-cargo">Cargo</label>
          <input
            id="aceite-cargo"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            autoComplete="organization-title"
            maxLength={120}
            style={inputStyle}
            placeholder="Diretor, mantenedor, RH…"
          />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle} htmlFor="aceite-email">E-mail</label>
        <input
          id="aceite-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          maxLength={160}
          style={inputStyle}
          placeholder="para onde enviamos a confirmação"
        />
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginTop: 16,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: C.ink2,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(e) => setConfirmado(e.target.checked)}
          style={{ marginTop: 3, width: 16, height: 16, accentColor: C.accent, flexShrink: 0 }}
        />
        <span>
          Li esta proposta e concordo com o escopo, o investimento e as condições descritas. Tenho
          autorização para aceitá-la em nome da instituição.
        </span>
      </label>

      {erro && (
        <p style={{ margin: '14px 0 0', fontSize: 13.5, color: C.danger, lineHeight: 1.5 }}>{erro}</p>
      )}

      <button
        type="submit"
        disabled={!pronto || enviando}
        style={{
          marginTop: 18,
          width: '100%',
          border: 'none',
          borderRadius: 10,
          padding: '15px 20px',
          background: pronto && !enviando ? C.accent : C.line,
          color: pronto && !enviando ? C.white : C.muted,
          fontFamily: F.display,
          fontSize: 15.5,
          fontWeight: 600,
          letterSpacing: '-.01em',
          cursor: pronto && !enviando ? 'pointer' : 'not-allowed',
          transition: 'background .18s ease',
        }}
      >
        {enviando ? 'Registrando…' : 'Aceitar proposta'}
      </button>
      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: C.muted2, lineHeight: 1.5 }}>
        O aceite registra nome, cargo, e-mail, data e hora. Você recebe a confirmação pelo seu
        contato na Vertho.
      </p>
    </form>
  );
}
