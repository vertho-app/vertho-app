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
import { Users2, Brain, Route, ListOrdered, TrendingUp, ArrowRight, ClipboardCheck, CalendarCheck, CalendarClock, FileText, Eye } from 'lucide-react';

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

const ACCENT = 'var(--brand-400, #34C5CC)';

type Relatorio = { url: string; em: string | null } | null;
type RelatoriosGerenciais = { rh: Relatorio; perfilOrg: Relatorio; dna: Relatorio } | null;

/** Um documento pronto: entra na leitura interna, com a data da geração. */
function Documento({ titulo, descricao, em, onOpen }: { titulo: string; descricao: string; em: string | null; onOpen: () => void }) {
  const quando = em ? new Date(em).toLocaleDateString('pt-BR') : null;
  return (
    <button type="button" onClick={onOpen}
      className="w-full text-left rounded-[22px] p-4 flex items-start gap-4 transition-all active:scale-[0.99] block"
      style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid color-mix(in oklab, ${ACCENT} 22%, transparent)` }}>
        <FileText size={18} style={{ color: ACCENT }} />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="mb-0.5" style={{ ...serifStyle, fontSize: 17, color: '#fff' }}>{titulo}</h4>
        <p className="text-sm text-white/55 leading-relaxed">{descricao}</p>
        {quando && <p className="text-[10px] text-white/35 mt-1">{quando}</p>}
      </div>
      <Eye size={17} className="mt-1 shrink-0" style={{ color: ACCENT }} />
    </button>
  );
}

type Panorama = {
  empresaNome: string | null;
  pessoas: number;
  comPerfil: number;
  comMapeamento: number;
  emJornada: number;
  emDia: number;
  atrasadas: number;
  jornadasEncerradas: number;
  indisponivel: boolean;
};

/**
 * Um degrau do funil. A BARRA é o que faz o funil funcionar: três números soltos
 * (283 · 144 · 38) parecem três fatos independentes; em proporção do topo eles
 * viram a pergunta "onde as pessoas param?" — e a resposta, em Macaé, é entre o
 * perfil e o mapeamento.
 */
function Degrau({
  valor, total, label, icon: Icon, indisponivel, cor = ACCENT, nota,
}: { valor: number; total: number; label: string; icon: any; indisponivel: boolean; cor?: string; nota?: string }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="rounded-[18px] p-3.5" style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-3">
        <Icon size={15} style={{ color: cor }} className="shrink-0" />
        <span className="leading-none tabular-nums" style={{ ...serifStyle, fontSize: 26, color: '#fff' }}>
          {/* Erro de banco não vira "0" na tela — 0 é um estado real da empresa. */}
          {indisponivel ? '—' : valor}
        </span>
        <span className="text-[12px] text-white/60 flex-1 min-w-0 truncate">{label}</span>
        {!indisponivel && total > 0 && (
          <span className="text-[10px] text-white/35 tabular-nums shrink-0" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
            {pct}%
          </span>
        )}
      </div>
      <div className="mt-2 h-[3px] rounded-full overflow-hidden bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${indisponivel ? 0 : pct}%`, background: cor }} />
      </div>
      {nota && <p className="text-[10px] text-white/35 mt-1.5">{nota}</p>}
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

export default function HomeRH({ firstName, panorama, relatorios }: { firstName: string; panorama: Panorama | null; relatorios: RelatoriosGerenciais }) {
  const t = useTranslations('DashboardHome');
  const router = useRouter();

  const p: Panorama = panorama ?? {
    empresaNome: null, pessoas: 0, comPerfil: 0, comMapeamento: 0,
    emJornada: 0, emDia: 0, atrasadas: 0, jornadasEncerradas: 0, indisponivel: true,
  };

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
          {/* Funil: cada degrau em proporção do TOPO (pessoas), porque a
              pergunta do RH é "onde elas param?". Os dois últimos são a mesma
              população da jornada aberta em dia × atrasada — estar numa trilha
              não é estar andando nela. */}
          <div className="space-y-2">
            <Degrau valor={p.pessoas} total={p.pessoas} label={t('rh.people')} icon={Users2} indisponivel={p.indisponivel} />
            <Degrau valor={p.comPerfil} total={p.pessoas} label={t('rh.withProfile')} icon={Brain} indisponivel={p.indisponivel} />
            <Degrau valor={p.comMapeamento} total={p.pessoas} label={t('rh.withMapping')} icon={ClipboardCheck} indisponivel={p.indisponivel} />
            <Degrau valor={p.emJornada} total={p.pessoas} label={t('rh.inJourney')} icon={Route} indisponivel={p.indisponivel} />
            <div className="grid grid-cols-2 gap-2 pl-3">
              <Degrau valor={p.emDia} total={p.emJornada} label={t('rh.onTrack')} icon={CalendarCheck} indisponivel={p.indisponivel} cor="#34D399" />
              <Degrau valor={p.atrasadas} total={p.emJornada} label={t('rh.behind')} icon={CalendarClock} indisponivel={p.indisponivel} cor="#FCD34D" />
            </div>
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
            titulo={t('rh.reports')}
            descricao={t('rh.reportsDescription')}
            icon={FileText}
            onClick={() => router.push('/dashboard/relatorios')}
          />
          {/* Só depois que a primeira jornada encerra: o veredito de evolução
              nasce no fechamento, então antes disso o atalho leva a seis KPIs
              zerados. Atalho para o vazio ensina a ignorar o menu. */}
          {p.jornadasEncerradas > 0 && (
            <Atalho
              titulo={t('rh.evolution')}
              descricao={t('rh.evolutionDescription')}
              icon={TrendingUp}
              onClick={() => router.push('/dashboard/gestor/equipe-evolucao')}
            />
          )}
        </section>

        {/* Os documentos de GESTÃO — o que o RH leva para a diretoria. Só os
            que EXISTEM aparecem: card de relatório que ainda não foi gerado é
            uma porta fechada com placa de porta aberta. O Relatório do Gestor
            fica de fora de propósito — é da liderança direta, não do RH. */}
        {relatorios && (relatorios.rh || relatorios.perfilOrg || relatorios.dna) && (
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: ACCENT }}>
              {t('rh.reports')}
            </h3>
            {relatorios.rh && (
              <Documento titulo={t('rh.reportHr')} descricao={t('rh.reportHrDescription')} em={relatorios.rh.em} onOpen={() => router.push('/dashboard/relatorios?document=organization-rh')} />
            )}
            {relatorios.perfilOrg && (
              <Documento titulo={t('rh.reportProfile')} descricao={t('rh.reportProfileDescription')} em={relatorios.perfilOrg.em} onOpen={() => router.push('/dashboard/relatorios?document=organization-profile')} />
            )}
            {relatorios.dna && (
              <Documento titulo={t('rh.reportDna')} descricao={t('rh.reportDnaDescription')} em={relatorios.dna.em} onOpen={() => router.push('/dashboard/relatorios?document=organization-dna')} />
            )}
          </section>
        )}

        {/* Diz por que não há botão de operar aqui — sem isto a tela parece
            incompleta, e a pergunta "cadê importar/disparar?" volta. */}
        <p className="text-[11px] text-white/35 leading-relaxed pt-1">{t('rh.operatedByVertho')}</p>
      </main>
    </div>
  );
}
