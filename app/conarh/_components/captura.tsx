'use client';

// CONARH 52 — captura DEPOIS do valor (nunca pedágio). Um ÚNICO submit grava
// tudo: dados, qualificação, slot e a telemetria da sessão. Porta e competên-
// cia chegam PRÉ-PREENCHIDAS da sessão — o expositor só confirma.
// Rede caiu → entra na fila local (capture.ts) e a mensagem é honesta.

import { useState } from 'react';
import { CalendarCheck, Check } from 'lucide-react';
import type { ConteudoConarh } from '../_data/types';
import type { NumeroPorta, Telemetria } from './sessao';
import {
  enfileirar,
  enviarLeadConarh,
  HORIZONTES,
  type Horizonte,
  type LeadConarhPayload,
} from './capture';
import { COR, SANS, SERIF, TOQUE } from './tema';

export interface ResultadoForm {
  classe?: string;
  slot?: string;
  naFila: boolean;
}

const LGPD_TEXTO =
  'Autorizo a Vertho a usar meus dados para me enviar o recorte da demonstração e ' +
  'combinar os próximos passos da conversa iniciada no estande (CONARH 52). ' +
  'Nada de spam: para excluir meus dados a qualquer momento, basta responder ' +
  '"excluir" no WhatsApp ou escrever para contato@vertho.ai.';

function Campo({
  rotulo,
  obrigatorio,
  children,
}: {
  rotulo: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block mb-2"
        style={{ color: COR.texto2, fontSize: 17, fontWeight: 700, fontFamily: SANS }}
      >
        {rotulo}
        {obrigatorio && <span style={{ color: COR.acento }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  minHeight: TOQUE,
  borderRadius: 16,
  border: `1px solid ${COR.borda}`,
  background: 'rgba(255,255,255,0.05)',
  color: COR.texto,
  fontSize: 20,
  fontFamily: SANS,
  padding: '0 18px',
  outline: 'none',
};

function Toggle({
  ligado,
  onChange,
  rotulo,
}: {
  ligado: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!ligado)}
      className="flex items-center gap-4 rounded-2xl border px-5 py-4 w-full text-left"
      style={{
        background: ligado ? 'rgba(52,197,204,0.10)' : COR.card,
        borderColor: ligado ? COR.bordaAcento : COR.borda,
      }}
    >
      <span
        className="flex items-center justify-center rounded-full flex-shrink-0"
        style={{
          width: 34,
          height: 34,
          background: ligado ? COR.acento : 'rgba(255,255,255,0.10)',
          color: ligado ? COR.fundo0 : 'transparent',
        }}
      >
        <Check size={20} strokeWidth={3} />
      </span>
      <span style={{ color: COR.texto, fontSize: 19, fontWeight: 600, fontFamily: SANS }}>
        {rotulo}
      </span>
    </button>
  );
}

export function Captura({
  conteudo,
  telemetria,
  modoVisitante,
  abrirAgenda,
  onSucesso,
}: {
  conteudo: ConteudoConarh;
  telemetria: Telemetria;
  modoVisitante?: boolean;
  abrirAgenda?: boolean;
  onSucesso: (r: ResultadoForm) => void;
}) {
  const [nome, setNome] = useState('');
  const [organizacao, setOrganizacao] = useState('');
  const [cargo, setCargo] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [horizonte, setHorizonte] = useState<Horizonte>('sem_data');
  // Pré-preenchidos da sessão — o expositor só confirma.
  const [porta, setPorta] = useState<NumeroPorta>(telemetria.porta_origem ?? 2);
  const [competencia, setCompetencia] = useState(conteudo.porta1.competencia);
  const [decide, setDecide] = useState(false);
  const [proximoPasso, setProximoPasso] = useState(false);
  const [foraDoPerfil, setForaDoPerfil] = useState(false);
  const [querAgenda, setQuerAgenda] = useState(!!abrirAgenda);
  const [slot, setSlot] = useState<string | undefined>(undefined);
  const [lgpd, setLgpd] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valido = modoVisitante
    ? nome.trim().length > 1 && telefone.trim().length >= 8 && lgpd
    : nome.trim().length > 1 &&
      organizacao.trim().length > 1 &&
      cargo.trim().length > 1 &&
      telefone.trim().length >= 8 &&
      competencia.trim().length > 1 &&
      lgpd;

  async function enviar() {
    if (!valido || enviando) return;
    setEnviando(true);
    setErro(null);
    const payload: LeadConarhPayload = {
      campanha: 'conarh',
      nome: nome.trim(),
      organizacao: organizacao.trim(),
      cargo: cargo.trim(),
      email: email.trim() || undefined,
      telefone: telefone.trim(),
      porta,
      competencia: competencia.trim(),
      horizonte,
      decide_ou_recomenda: decide,
      aceitou_proximo_passo: proximoPasso || !!slot,
      fora_do_perfil: foraDoPerfil,
      slot,
      sessao: {
        nota_instintiva: telemetria.nota_instintiva,
        reavaliacao: telemetria.reavaliacao,
        divergencias: telemetria.divergencias,
        rotas_iniciadas: telemetria.rotas_iniciadas,
        rotas_concluidas: telemetria.rotas_concluidas,
        porta_origem: telemetria.porta_origem,
      },
    };
    const r = await enviarLeadConarh(payload);
    if (r.ok) {
      onSucesso({ classe: r.classe, slot, naFila: false });
    } else {
      // Falha de rede/servidor → não perde o lead: fila local + mensagem honesta.
      enfileirar(payload);
      onSucesso({ slot, naFila: true });
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <p
        className="uppercase font-bold mb-2"
        style={{ color: COR.acento, fontSize: 14, letterSpacing: '0.24em', fontFamily: SANS }}
      >
        {modoVisitante ? 'Receba o recorte' : 'Fechando a conversa'}
      </p>
      <h1
        style={{
          color: COR.texto,
          fontFamily: SERIF,
          fontSize: 'clamp(30px, 4vw, 42px)',
          fontWeight: 600,
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {modoVisitante
          ? 'Deixe nome e WhatsApp — o recorte chega em minutos.'
          : 'Para quem enviamos o recorte?'}
      </h1>

      <div className="mt-8 space-y-5">
        <Campo rotulo="Nome" obrigatorio>
          <input style={INPUT_STYLE} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
        </Campo>

        {!modoVisitante && (
          <>
            <Campo rotulo="Empresa" obrigatorio>
              <input style={INPUT_STYLE} value={organizacao} onChange={(e) => setOrganizacao(e.target.value)} autoComplete="organization" />
            </Campo>
            <Campo rotulo="Cargo" obrigatorio>
              <input style={INPUT_STYLE} value={cargo} onChange={(e) => setCargo(e.target.value)} autoComplete="organization-title" />
            </Campo>
            <Campo rotulo="E-mail corporativo (opcional)">
              <input style={INPUT_STYLE} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Campo>
          </>
        )}

        <Campo rotulo="WhatsApp" obrigatorio>
          <input
            style={INPUT_STYLE}
            type="tel"
            inputMode="tel"
            placeholder="(11) 9 9999-9999"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            autoComplete="tel"
          />
        </Campo>

        {!modoVisitante && (
          <>
            <div>
              <span className="block mb-2" style={{ color: COR.texto2, fontSize: 17, fontWeight: 700, fontFamily: SANS }}>
                Horizonte
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {HORIZONTES.map((h) => (
                  <button
                    key={h.valor}
                    type="button"
                    onClick={() => setHorizonte(h.valor)}
                    className="rounded-2xl border px-5 py-4 text-left"
                    style={{
                      minHeight: TOQUE,
                      background: horizonte === h.valor ? 'rgba(52,197,204,0.12)' : COR.card,
                      borderColor: horizonte === h.valor ? COR.bordaAcento : COR.borda,
                      color: horizonte === h.valor ? COR.acento : COR.texto2,
                      fontSize: 18,
                      fontWeight: 700,
                      fontFamily: SANS,
                    }}
                  >
                    {h.rotulo}
                  </button>
                ))}
              </div>
            </div>

            <Campo rotulo="Competência crítica (com as palavras dele)" obrigatorio>
              <input style={INPUT_STYLE} value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
            </Campo>

            <div>
              <span className="block mb-2" style={{ color: COR.texto2, fontSize: 17, fontWeight: 700, fontFamily: SANS }}>
                Etapa que mais interessou
              </span>
              <div className="grid grid-cols-5 gap-3">
                {conteudo.portas.map((p) => (
                  <button
                    key={p.numero}
                    type="button"
                    onClick={() => setPorta(p.numero as NumeroPorta)}
                    title={p.nome}
                    className="rounded-2xl border font-bold"
                    style={{
                      minHeight: TOQUE,
                      background: porta === p.numero ? 'rgba(52,197,204,0.14)' : COR.card,
                      borderColor: porta === p.numero ? COR.bordaAcento : COR.borda,
                      color: porta === p.numero ? COR.acento : COR.texto3,
                      fontSize: 24,
                      fontFamily: SERIF,
                    }}
                  >
                    {p.numero}
                  </button>
                ))}
              </div>
              <p style={{ color: COR.texto3, fontSize: 15, fontFamily: SANS, marginTop: 6 }}>
                {conteudo.portas[porta - 1].nome}
              </p>
            </div>

            <Toggle ligado={decide} onChange={setDecide} rotulo="Decide ou recomenda a decisão de desenvolvimento" />
            <Toggle ligado={proximoPasso} onChange={setProximoPasso} rotulo="Aceitou um próximo passo depois da feira" />
            {/* Marca classe C no servidor. Sem isto, curioso e fornecedor
                entravam como B e poluíam a cadência ativa. */}
            <Toggle
              ligado={foraDoPerfil}
              onChange={setForaDoPerfil}
              rotulo="Fora do perfil (curioso, fornecedor ou concorrente)"
            />

            {/* Agenda — marcar os 20 minutos na hora */}
            <div>
              <Toggle
                ligado={querAgenda}
                onChange={(v) => {
                  setQuerAgenda(v);
                  if (!v) setSlot(undefined);
                }}
                rotulo="Marcar os 20 minutos agora"
              />
              {querAgenda && (
                <div className="mt-4 space-y-4">
                  {conteudo.agenda.dias.map((dia) => (
                    <div key={dia.data}>
                      <p style={{ color: COR.texto2, fontSize: 17, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
                        {dia.rotulo}
                      </p>
                      <div className="flex flex-wrap gap-2.5 mt-2">
                        {dia.slots.map((hora) => {
                          // Feira em São Paulo (UTC-3) — slot ISO com offset explícito.
                          const iso = `${dia.data}T${hora}:00:00-03:00`;
                          const ativo = slot === iso;
                          return (
                            <button
                              key={hora}
                              type="button"
                              onClick={() => setSlot(ativo ? undefined : iso)}
                              className="rounded-xl border px-5 py-3 font-bold"
                              style={{
                                background: ativo ? COR.acento : COR.card,
                                borderColor: ativo ? COR.acento : COR.borda,
                                color: ativo ? COR.fundo0 : COR.texto2,
                                fontSize: 18,
                                fontFamily: SANS,
                              }}
                            >
                              {hora}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {slot && (
                    <p className="flex items-center gap-2" style={{ color: COR.acento, fontSize: 17, fontWeight: 700, fontFamily: SANS, margin: 0 }}>
                      <CalendarCheck size={18} /> Reunião marcada — confirmação sai no WhatsApp.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* LGPD — aceite explícito, finalidade declarada, canal de exclusão */}
        <button
          type="button"
          onClick={() => setLgpd(!lgpd)}
          className="flex items-start gap-4 rounded-2xl border p-5 w-full text-left"
          style={{
            background: lgpd ? 'rgba(52,197,204,0.08)' : COR.card,
            borderColor: lgpd ? COR.bordaAcento : COR.borda,
          }}
        >
          <span
            className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
            style={{
              width: 30,
              height: 30,
              border: `2px solid ${lgpd ? COR.acento : COR.texto3}`,
              background: lgpd ? COR.acento : 'transparent',
              color: lgpd ? COR.fundo0 : 'transparent',
            }}
          >
            <Check size={18} strokeWidth={3} />
          </span>
          <span style={{ color: COR.texto2, fontSize: 16, lineHeight: 1.55, fontFamily: SANS }}>
            {LGPD_TEXTO}
          </span>
        </button>

        {erro && (
          <p style={{ color: COR.vermelho, fontSize: 17, fontFamily: SANS, margin: 0 }}>{erro}</p>
        )}

        <button
          type="button"
          onClick={enviar}
          disabled={!valido || enviando}
          className="w-full rounded-2xl font-bold"
          style={{
            minHeight: TOQUE + 8,
            background: valido ? `linear-gradient(135deg, ${COR.acento}, ${COR.acentoEscuro})` : 'rgba(255,255,255,0.08)',
            color: valido ? COR.fundo0 : COR.texto3,
            fontSize: 22,
            fontFamily: SANS,
            opacity: enviando ? 0.6 : 1,
          }}
        >
          {enviando ? 'Enviando…' : modoVisitante ? 'Enviar e receber o recorte' : 'Registrar e enviar o recorte'}
        </button>
      </div>
    </div>
  );
}
