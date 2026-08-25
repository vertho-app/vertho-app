'use client';
/**
 * Home do RH — o Admin da empresa NÃO é participante.
 *
 * A home padrão desenha a jornada de 5 fases (DISC → avaliação → PDI →
 * temporada → evolução) e o CTA principal convida a começá-la. Para o papel
 * `rh` isso é a tela pedindo à administradora que faça o diagnóstico que ela
 * aplica nos outros: medido em 24/08/2026, 0 dos 8 colaboradores com
 * `role='rh'` têm sessão de avaliação, e a barra de progresso ficava em 0%
 * para sempre.
 *
 * O que entra no lugar é o que o papel de fato consome: o estado do TENANT e as
 * três telas de leitura que ele já alcança. Nenhum botão de operação — pela
 * decisão de 24/08, configuração, conteúdo e disparo são da Vertho.
 */
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Users2, Brain, Route, ListOrdered, TrendingUp, ArrowRight } from 'lucide-react';

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

const ACCENT = 'var(--brand-400, #34C5CC)';

type Panorama = {
  empresaNome: string | null;
  pessoas: number;
  comPerfil: number;
  emJornada: number;
  indisponivel: boolean;
};

function Numero({ valor, label, icon: Icon, indisponivel }: { valor: number; label: string; icon: any; indisponivel: boolean }) {
  return (
    <div
      className="rounded-[20px] p-4"
      style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <Icon size={16} style={{ color: ACCENT }} />
      <p className="mt-2 leading-none" style={{ ...serifStyle, fontSize: 32, color: '#fff' }}>
        {/* Erro de banco não vira "0" na tela — 0 é um estado real da empresa. */}
        {indisponivel ? '—' : valor}
      </p>
      <p className="text-[11px] text-white/50 mt-1.5 leading-snug">{label}</p>
    </div>
  );
}

function Atalho({ titulo, descricao, icon: Icon, onClick }: { titulo: string; descricao: string; icon: any; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-[22px] p-4 flex items-start gap-4 transition-all active:scale-[0.99]"
      style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid color-mix(in oklab, ${ACCENT} 22%, transparent)` }}
      >
        <Icon size={18} style={{ color: ACCENT }} />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="mb-0.5" style={{ ...serifStyle, fontSize: 17, color: '#fff' }}>{titulo}</h4>
        <p className="text-sm text-white/55 leading-relaxed">{descricao}</p>
      </div>
      <ArrowRight size={18} className="mt-1 shrink-0" style={{ color: ACCENT }} />
    </button>
  );
}

export default function HomeRH({ firstName, panorama }: { firstName: string; panorama: Panorama | null }) {
  const t = useTranslations('DashboardHome');
  const router = useRouter();

  const p: Panorama = panorama ?? { empresaNome: null, pessoas: 0, comPerfil: 0, emJornada: 0, indisponivel: true };

  return (
    <div>
      <header className="px-5 pt-6 pb-4">
        <p className="text-sm text-white/60 mb-1">{t('header.hello', { name: firstName })}</p>
        <h1 style={{ ...serifStyle, fontSize: 'clamp(32px, 6vw, 52px)', lineHeight: 1.0, letterSpacing: '-0.02em', color: '#fff' }}>
          {t('rh.titlePrefix')} <em style={{ color: ACCENT }}>{p.empresaNome || t('rh.fallbackCompany')}</em>
        </h1>
      </header>

      <main className="flex-1 px-5 pb-28 space-y-5" style={{ maxWidth: 640 }}>
        <section>
          <h3 className="text-[11px] font-bold tracking-[0.18em] uppercase mb-3" style={{ color: ACCENT }}>
            {t('rh.overview')}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <Numero valor={p.pessoas} label={t('rh.people')} icon={Users2} indisponivel={p.indisponivel} />
            <Numero valor={p.comPerfil} label={t('rh.withProfile')} icon={Brain} indisponivel={p.indisponivel} />
            <Numero valor={p.emJornada} label={t('rh.inJourney')} icon={Route} indisponivel={p.indisponivel} />
          </div>
          {p.indisponivel && (
            <p className="text-[11px] text-amber-400/80 mt-2">{t('rh.unavailable')}</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: ACCENT }}>
            {t('rh.follow')}
          </h3>
          <Atalho
            titulo={t('rh.team')}
            descricao={t('rh.teamDescription')}
            icon={Users2}
            onClick={() => router.push('/dashboard/gestor')}
          />
          <Atalho
            titulo={t('rh.ranking')}
            descricao={t('rh.rankingDescription')}
            icon={ListOrdered}
            onClick={() => router.push('/dashboard/gestor/ranking')}
          />
          <Atalho
            titulo={t('rh.evolution')}
            descricao={t('rh.evolutionDescription')}
            icon={TrendingUp}
            onClick={() => router.push('/dashboard/gestor/equipe-evolucao')}
          />
        </section>

        {/* Diz por que não há botão de operar aqui — sem isto a tela parece
            incompleta, e a pergunta "cadê importar/disparar?" volta. */}
        <p className="text-[11px] text-white/35 leading-relaxed pt-1">{t('rh.operatedByVertho')}</p>
      </main>
    </div>
  );
}
