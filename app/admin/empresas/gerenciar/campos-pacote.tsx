'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus } from 'lucide-react';

/**
 * Campos do cadastro no pacote de clínicas (lib/pacote-clinicas.ts): a clínica da secretária (com
 * "nova clínica" ali mesmo) e o modelo de clínica do simulador, com a descrição do modelo como ajuda.
 * Só aparecem com a chave da empresa ligada; a conferência de verdade é no servidor.
 */

export type OpcoesCadastro = {
  pacote: boolean;
  cargos: string[];
  clinicas: Array<{ id: string; nome: string }>;
  modelos: Array<{ codigo: string; nome: string; descricao: string }>;
  erro?: string;
};

export const OPCOES_VAZIAS: OpcoesCadastro = { pacote: false, cargos: [], clinicas: [], modelos: [] };

/** Valor do filtro "sem clínica" (secretária ainda não ligada a uma clínica). */
export const SEM_CLINICA = '__sem_clinica__';

const campo = 'w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none';

export function nomeDaClinica(opcoes: OpcoesCadastro, id: string | null | undefined): string | null {
  return (id && opcoes.clinicas.find((c) => c.id === id)?.nome) || null;
}

export function nomeDoModelo(opcoes: OpcoesCadastro, codigo: string | null | undefined): string | null {
  return (codigo && opcoes.modelos.find((m) => m.codigo === codigo)?.nome) || codigo || null;
}

export function CampoClinica({ opcoes, value, onChange, onCriar }: {
  opcoes: OpcoesCadastro;
  value: string | null | undefined;
  onChange: (id: string) => void;
  /** Cadastra a clínica e devolve o id (ou null se falhou: a tela já avisou). */
  onCriar: (nome: string) => Promise<string | null>;
}) {
  const t = useTranslations('AdminCollaborators');
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    setSalvando(true);
    const id = await onCriar(nova.trim());
    setSalvando(false);
    if (id) { onChange(id); setNova(''); setAberto(false); }
  }

  return (
    <div>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={campo}>
        <option value="">{t('fields.selectClinic')}</option>
        {opcoes.clinicas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      {aberto ? (
        <div className="flex items-center gap-1 mt-1">
          <input value={nova} onChange={(e) => setNova(e.target.value)} placeholder={t('fields.newClinicPlaceholder')} className={campo} />
          <button type="button" onClick={criar} disabled={salvando || nova.trim().length < 2}
            title={t('actions.addClinic')} className="text-green-400 hover:text-green-300 disabled:opacity-40">
            {salvando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAberto(true)} className="block mt-1 text-[9px] text-cyan-400 hover:underline">
          {t('actions.addClinic')}
        </button>
      )}
    </div>
  );
}

export function CampoModelo({ opcoes, value, onChange }: {
  opcoes: OpcoesCadastro;
  value: string | null | undefined;
  onChange: (codigo: string) => void;
}) {
  const t = useTranslations('AdminCollaborators');
  if (!opcoes.modelos.length) return <span className="text-[10px] text-gray-500">{t('fields.noSimulatorModels')}</span>;
  const atual = opcoes.modelos.find((m) => m.codigo === value);
  return (
    <div>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={campo}>
        <option value="">{t('fields.selectModel')}</option>
        {opcoes.modelos.map((m) => <option key={m.codigo} value={m.codigo} title={m.descricao}>{m.nome}</option>)}
      </select>
      {atual && <p className="mt-1 text-[9px] text-gray-500 line-clamp-2" title={atual.descricao}>{atual.descricao}</p>}
    </div>
  );
}

export function FiltroClinica({ opcoes, value, onChange, total, visiveis }: {
  opcoes: OpcoesCadastro;
  value: string;
  onChange: (v: string) => void;
  total: number;
  visiveis: number;
}) {
  const t = useTranslations('AdminCollaborators');
  return (
    <div className="mb-3 flex items-center gap-3 flex-wrap">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded-lg text-xs text-white border border-white/10 bg-[#091D35] outline-none">
        <option value="">{t('fields.allClinics')}</option>
        <option value={SEM_CLINICA}>{t('fields.noClinic')}</option>
        {opcoes.clinicas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      {value && <span className="text-[11px] text-gray-400">{visiveis} / {total}</span>}
    </div>
  );
}

/**
 * Relatório das clínicas sob demanda: prévia do e-mail (numa moldura isolada, sem script) e o envio
 * agora para o RH. O cron manda toda segunda às 07h; na semana de entrada a lista não pode esperar.
 */
export function RelatorioClinicasPainel({ onPreview, onEnviar }: {
  onPreview: () => Promise<{ html: string; clinicas: number; pessoas: number; pendentes: number; destinatarios: string[] } | null>;
  onEnviar: () => Promise<boolean>;
}) {
  const t = useTranslations('AdminCollaborators');
  const [previa, setPrevia] = useState<{ html: string; clinicas: number; pessoas: number; pendentes: number; destinatarios: string[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function abrir() {
    setCarregando(true);
    setPrevia(await onPreview());
    setCarregando(false);
  }

  async function enviar() {
    setEnviando(true);
    const ok = await onEnviar();
    setEnviando(false);
    if (ok) setPrevia(null);
  }

  if (!previa) {
    return (
      <button type="button" onClick={abrir} disabled={carregando}
        className="mb-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-cyan-400/30 hover:text-cyan-400 transition-all disabled:opacity-40">
        {carregando && <Loader2 size={12} className="animate-spin" />}
        {t('actions.clinicReport')}
      </button>
    );
  }
  return (
    <div className="mb-3 rounded-xl border border-white/[0.06] p-3" style={{ background: '#0F2A4A' }}>
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className="text-xs text-gray-300">
          {t('fields.clinicReportSummary', { clinics: previa.clinicas, people: previa.pessoas, pending: previa.pendentes, recipients: previa.destinatarios.length })}
        </span>
        <button type="button" onClick={enviar} disabled={enviando || previa.destinatarios.length === 0}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-green-400/30 text-green-400 hover:bg-green-400/10 disabled:opacity-40">
          {enviando && <Loader2 size={12} className="animate-spin" />}
          {t('actions.clinicReportSend')}
        </button>
        <button type="button" onClick={() => setPrevia(null)} className="text-xs text-gray-500 hover:text-white">{t('actions.cancel')}</button>
      </div>
      <iframe title={t('actions.clinicReport')} sandbox="" srcDoc={previa.html}
        className="w-full rounded-lg bg-white" style={{ height: 420, border: 0 }} />
    </div>
  );
}
