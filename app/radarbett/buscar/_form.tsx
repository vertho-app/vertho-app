'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Search, X, Loader2 } from 'lucide-react';
import { listarMunicipiosPorUf, type MunicipioListagem } from '../../radar/actions';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const REDES = [
  { v: 'PRIVADA', label: 'Privada' },
  { v: 'MUNICIPAL', label: 'Municipal' },
  { v: 'ESTADUAL', label: 'Estadual' },
  { v: 'FEDERAL', label: 'Federal' },
];

const ETAPAS = [
  { v: '5_EF', label: '5º EF' },
  { v: '9_EF', label: '9º EF' },
  { v: '3_EM', label: '3º EM' },
];

export function BuscaForm({
  initial,
}: {
  initial: {
    termo?: string;
    uf?: string;
    rede?: string;
    etapa?: string;
    municipio_ibge?: string;
    municipio_nome?: string;
  };
}) {
  const router = useRouter();
  const [termo, setTermo] = useState(initial.termo || '');
  const [uf, setUf] = useState(initial.uf || '');
  const [rede, setRede] = useState(initial.rede || '');
  const [etapa, setEtapa] = useState(initial.etapa || '');
  const [municipioIbge, setMunicipioIbge] = useState(initial.municipio_ibge || '');
  const [municipioNome, setMunicipioNome] = useState(initial.municipio_nome || '');

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const p = new URLSearchParams();
    if (termo.trim()) p.set('termo', termo.trim());
    if (uf) p.set('uf', uf);
    if (rede) p.set('rede', rede);
    if (etapa) p.set('etapa', etapa);
    if (municipioIbge) p.set('municipio', municipioIbge);
    const qs = p.toString();
    router.push(qs ? `/buscar?${qs}` : '/buscar');
  }

  function limpar() {
    setTermo('');
    setUf('');
    setRede('');
    setEtapa('');
    setMunicipioIbge('');
    setMunicipioNome('');
    router.push('/buscar');
  }

  // Quando UF muda, limpa município selecionado se a anterior era de outra UF
  function handleUfChange(novaUf: string) {
    if (novaUf !== uf) {
      setMunicipioIbge('');
      setMunicipioNome('');
    }
    setUf(novaUf);
  }

  return (
    <form onSubmit={submit}>
      <div
        className="rounded-2xl border p-5 sm:p-6"
        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(52,197,204,0.18)' }}
      >
        {/* Linha 1: input nome + UF */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3 mb-3">
          <div className="relative flex items-center">
            <Search size={16} className="text-white/40 absolute left-4" />
            <input
              type="text"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome da escola (opcional)"
              className="w-full bg-white/[0.03] text-white placeholder:text-white/40 outline-none rounded-full h-11 pl-11 pr-4 border border-white/[0.10] focus:border-cyan-400/60 transition-colors text-[14px]"
            />
          </div>
          <SelectChip
            value={uf}
            onChange={handleUfChange}
            options={[{ v: '', label: 'Todas UFs' }, ...UFS.map((u) => ({ v: u, label: u }))]}
            label="UF"
          />
        </div>

        {/* Linha 2: município (autocomplete dependente da UF) */}
        {uf && (
          <div className="mb-3">
            <MunicipioAutocomplete
              uf={uf}
              ibge={municipioIbge}
              nome={municipioNome}
              onSelect={(item) => {
                setMunicipioIbge(item?.municipio_ibge || '');
                setMunicipioNome(item?.municipio || '');
              }}
            />
          </div>
        )}

        {/* Linha 3: rede e etapa como chip groups */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChipGroup label="Rede" value={rede} onChange={setRede} options={REDES} />
          <ChipGroup label="Etapa" value={etapa} onChange={setEtapa} options={ETAPAS} />
        </div>

        {/* Botões */}
        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all"
            style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)', color: '#06172C' }}
          >
            <Search size={14} /> Buscar
          </button>
          <button
            type="button"
            onClick={limpar}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold border text-white/65 hover:text-white transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.12)' }}
          >
            Limpar filtros
          </button>
        </div>
      </div>
    </form>
  );
}

function SelectChip({
  value, onChange, options, label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
  label: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none bg-white/[0.03] text-white/90 rounded-full font-bold cursor-pointer outline-none border border-white/[0.10] hover:bg-white/[0.06] focus:border-cyan-400/60 transition-colors h-11 w-full pl-4 pr-9 text-[12px]"
        style={{ letterSpacing: '0.04em' }}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v} style={{ background: '#0c2848', color: 'white' }}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 pointer-events-none"
      />
    </div>
  );
}

function ChipGroup({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/45 mb-2">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        <Chip ativo={value === ''} onClick={() => onChange('')}>Todas</Chip>
        {options.map((o) => (
          <Chip key={o.v} ativo={value === o.v} onClick={() => onChange(o.v)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function MunicipioAutocomplete({
  uf, ibge, nome, onSelect,
}: {
  uf: string;
  ibge: string;
  nome: string;
  onSelect: (m: MunicipioListagem | null) => void;
}) {
  const [lista, setLista] = useState<MunicipioListagem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(nome);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const carregadoUf = useRef<string>('');

  // Carrega lista quando UF muda
  useEffect(() => {
    let cancelado = false;
    if (!uf) {
      setLista([]);
      carregadoUf.current = '';
      return;
    }
    if (carregadoUf.current === uf) return;
    setLoading(true);
    listarMunicipiosPorUf(uf)
      .then((r) => {
        if (cancelado) return;
        setLista(r);
        carregadoUf.current = uf;
      })
      .catch(() => { if (!cancelado) setLista([]); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [uf]);

  // Sincroniza filter com nome externo (quando vem de URL)
  useEffect(() => {
    setFilter(nome);
  }, [nome]);

  // Fecha quando clica fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Remove diacríticos (combining marks U+0300..U+036F). Usa escape
  // explícito para evitar problemas de encoding do arquivo fonte.
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filtroNorm = norm(filter.trim());
  const filtrados = filtroNorm.length === 0
    ? lista.slice(0, 60)
    : lista.filter((m) => norm(m.municipio).includes(filtroNorm)).slice(0, 60);

  return (
    <div ref={wrapperRef} className="relative">
      <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/45 mb-2">Município</p>
      <div className="relative flex items-center">
        <input
          type="text"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setOpen(true);
            // Se digitou algo diferente do município selecionado, limpa o ibge
            if (ibge && e.target.value !== nome) onSelect(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder={`Filtrar municípios de ${uf}…`}
          className="w-full bg-white/[0.03] text-white placeholder:text-white/40 outline-none rounded-full h-11 pl-4 pr-20 border focus:border-cyan-400/60 transition-colors text-[14px]"
          style={{ borderColor: ibge ? 'rgba(52,197,204,0.45)' : 'rgba(255,255,255,0.10)' }}
        />
        <div className="absolute right-3 flex items-center gap-1.5">
          {loading && <Loader2 size={13} className="animate-spin text-cyan-400" />}
          {!loading && filter && (
            <button
              type="button"
              onClick={() => { setFilter(''); onSelect(null); setOpen(false); }}
              className="text-white/40 hover:text-white/85 transition-colors"
              aria-label="Limpar município"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {ibge && (
        <p className="text-[11px] text-cyan-300/70 mt-1.5 pl-2">
          Filtrando por <strong>{nome}</strong> (IBGE {ibge})
        </p>
      )}
      {open && filtrados.length > 0 && (
        <div
          className="absolute left-0 right-0 mt-2 rounded-2xl border overflow-hidden z-30 max-h-[280px] overflow-y-auto"
          style={{
            background: 'linear-gradient(180deg, #0c2848, #091D35)',
            borderColor: 'rgba(52,197,204,0.18)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.4)',
          }}
        >
          {filtrados.map((m) => (
            <button
              key={m.municipio_ibge}
              type="button"
              onClick={() => {
                onSelect(m);
                setFilter(m.municipio);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-[13px] text-white/85 hover:bg-white/[0.05] transition-colors border-b border-white/[0.04] last:border-0 flex items-center justify-between"
            >
              <span>{m.municipio}</span>
              <span className="font-mono text-[10px] text-white/35">{m.municipio_ibge}</span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && filtrados.length === 0 && filter.trim().length > 0 && (
        <div
          className="absolute left-0 right-0 mt-2 rounded-2xl border px-4 py-3 z-30"
          style={{ background: '#0c2848', borderColor: 'rgba(255,255,255,0.10)' }}
        >
          <p className="text-[12px] text-white/55">Nenhum município de {uf} bate com "{filter}".</p>
        </div>
      )}
    </div>
  );
}

function Chip({
  ativo, onClick, children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border"
      style={{
        background: ativo ? 'linear-gradient(135deg, #34c5cc, #2aa8ae)' : 'rgba(255,255,255,0.04)',
        color: ativo ? '#06172C' : 'rgba(255,255,255,0.75)',
        borderColor: ativo ? 'transparent' : 'rgba(255,255,255,0.10)',
      }}
    >
      {children}
    </button>
  );
}
