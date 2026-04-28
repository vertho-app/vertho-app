import { headers } from 'next/headers';
import { Sparkles } from 'lucide-react';
import {
  getNarrativaEscola,
  getNarrativaMunicipio,
  isLikelyBot,
} from '@/lib/radar/ia-narrativa';
import type {
  Escola, SaebSnapshot, IcaSnapshot,
  CensoInfra, IdebSnapshot, SarespSnapshot, PddeRepasse, FundebRepasse, PddeMunicipal,
} from '@/lib/radar/queries';

type CommonProps = {
  determRefBlock: React.ReactNode;
};

type EscolaProps = CommonProps & {
  scope: 'escola';
  escola: Escola;
  saeb: SaebSnapshot[];
  censo?: CensoInfra | null;
  ideb?: IdebSnapshot[];
  saresp?: SarespSnapshot[];
  pdde?: PddeRepasse[];
};

type MunicipioProps = CommonProps & {
  scope: 'municipio';
  municipio: { ibge: string; nome: string; uf: string; totalEscolas: number; redes: Record<string, number> };
  ica: IcaSnapshot[];
  fundeb?: FundebRepasse[];
  pddeMunicipal?: PddeMunicipal[];
};

/**
 * Componente server async — bloqueia até a IA gerar (com cache rápido).
 * Wrap em <Suspense fallback={<NarrativaSkeleton />}> pra UX progressiva.
 */
export async function NarrativaIA(props: EscolaProps | MunicipioProps) {
  const h = await headers();
  const generateIfMissing = !isLikelyBot(h.get('user-agent'));
  const ia = props.scope === 'escola'
    ? await getNarrativaEscola(props.escola, props.saeb, {
        generateIfMissing,
        censo: props.censo ?? null,
        ideb: props.ideb || [],
        saresp: props.saresp || [],
        pdde: props.pdde || [],
      })
    : await getNarrativaMunicipio(props.municipio, props.ica, {
        generateIfMissing,
        fundeb: props.fundeb || [],
        pddeMunicipal: props.pddeMunicipal || [],
      });

  return (
    <>
      <div
        className="md:col-span-2 rounded-2xl p-5 border border-white/[0.06]"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: '#34c5cc' }}>
          Leitura
        </p>
        <p className="text-sm text-white/80 leading-relaxed mb-3">{ia.resumo}</p>
        {props.determRefBlock}
      </div>
      <div className="space-y-3">
        {ia.pontos_atencao.length > 0 && (
          <Bloco titulo="Pontos de Atenção" cor="#F97354" itens={ia.pontos_atencao} />
        )}
        {ia.pontos_destaque.length > 0 && (
          <Bloco titulo="Destaques" cor="#34D399" itens={ia.pontos_destaque} />
        )}
      </div>

      {ia.perguntas_pedagogicas.length > 0 && (
        <section className="md:col-span-3 rounded-2xl p-5 border border-white/[0.06] mt-1"
          style={{ background: 'rgba(154,226,230,0.04)' }}>
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: '#9ae2e6' }}>
            {props.scope === 'escola' ? 'Perguntas pedagógicas para discussão' : 'Perguntas para discussão na secretaria'}
          </p>
          <ul className="space-y-2">
            {ia.perguntas_pedagogicas.map((q, i) => (
              <li key={i} className="text-sm text-white/75 leading-relaxed">
                <span className="text-cyan-400 mr-2">→</span>{q}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Bloco({ titulo, cor, itens }: { titulo: string; cor: string; itens: string[] }) {
  return (
    <div className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: cor }}>
        {titulo}
      </p>
      <ul className="space-y-1.5">
        {itens.map((t, i) => (
          <li key={i} className="text-xs text-white/70 leading-relaxed">{t}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Skeleton mostrado enquanto a IA processa (primeira visita ~5-10s).
 * Visitas com cache hit pulam direto pro NarrativaIA sem mostrar skeleton.
 */
export function NarrativaSkeleton({ resumoDeterm }: { resumoDeterm: string }) {
  return (
    <>
      <div
        className="md:col-span-2 rounded-2xl p-5 border border-white/[0.06]"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3 flex items-center gap-2" style={{ color: '#34c5cc' }}>
          Leitura
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] normal-case tracking-normal animate-pulse"
            style={{ background: 'rgba(52,197,204,0.12)', color: '#34c5cc', letterSpacing: 0 }}
          >
            <Sparkles size={10} />
            Gerando análise…
          </span>
        </p>

        {/* placeholder skeleton bars */}
        <div className="space-y-2 mb-4">
          <div className="h-3 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: '92%' }} />
          <div className="h-3 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: '85%' }} />
          <div className="h-3 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: '78%' }} />
          <div className="h-3 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: '65%' }} />
        </div>

        {/* leitura determinística aparece imediatamente */}
        <p className="text-xs text-white/45 leading-relaxed italic border-l-2 border-white/10 pl-3">
          {resumoDeterm}
        </p>
        <p className="text-[10px] text-white/35 mt-3">
          Análise contextual feita pelo Claude Sonnet 4.6 a partir dos dados oficiais. Visitas seguintes servem do cache (instantâneo).
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="h-2.5 w-24 rounded animate-pulse mb-3" style={{ background: 'rgba(249,115,84,0.18)' }} />
          <div className="space-y-1.5">
            <div className="h-2 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: '90%' }} />
            <div className="h-2 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: '70%' }} />
          </div>
        </div>
        <div className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="h-2.5 w-20 rounded animate-pulse mb-3" style={{ background: 'rgba(52,211,153,0.18)' }} />
          <div className="space-y-1.5">
            <div className="h-2 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: '85%' }} />
            <div className="h-2 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: '60%' }} />
          </div>
        </div>
      </div>
    </>
  );
}
