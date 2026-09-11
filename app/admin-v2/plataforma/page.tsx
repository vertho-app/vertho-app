import Link from 'next/link';
import { Activity, ArrowRight, ExternalLink, Layers3, ShieldCheck, Wrench } from 'lucide-react';

export const metadata = { title: 'Plataforma · Admin por fluxo' };

const GRUPOS = [
  {
    chave: 'acessos',
    titulo: 'Acessos e governança',
    descricao: 'Quem administra a plataforma e o que cada papel pode fazer.',
    itens: [
      { rotulo: 'Administradores da plataforma', detalhe: 'convites, papéis e situação de acesso', href: '/admin/platform-admins' },
      { rotulo: 'Permissões', detalhe: 'matriz de capacidades administrativas', href: '/admin/permissoes' },
    ],
  },
  {
    chave: 'dados',
    titulo: 'Dados e qualidade',
    descricao: 'Importações, consistência e fontes que sustentam o produto.',
    itens: [
      // ⛔ 31/08/2026: 'Radar e bases externas' apontava para o Radar Empresas,
      // hoje bloco OFF-LINE (lib/blocos-offline.ts). A ingestão de dados de
      // ESCOLAS, que é a que segue viva, tem porta própria em /admin/radar.
      { rotulo: 'Radar e bases externas', detalhe: 'ingestão e leitura dos dados de escolas', href: '/admin/radar' },
      { rotulo: 'Knowledge base', detalhe: 'fontes e vetores usados pelo conteúdo', href: '/admin/vertho/knowledge-base' },
      { rotulo: 'Auditorias da jornada', detalhe: 'checagens estruturais por semana', href: '/admin/vertho/auditorias' },
    ],
  },
  {
    chave: 'integracoes',
    titulo: 'Integrações e canais',
    descricao: 'Pontos de saída que conectam a jornada às pessoas.',
    itens: [
      { rotulo: 'WhatsApp', detalhe: 'templates, envios e saúde do canal', href: '/admin/whatsapp' },
      { rotulo: 'Vídeos', detalhe: 'geração, publicação e falhas de render', href: '/admin/videos' },
    ],
  },
  {
    chave: 'jobs',
    titulo: 'Jobs e automações',
    descricao: 'Processos assíncronos que precisam de acompanhamento operacional.',
    itens: [
      { rotulo: 'Produção de kits', detalhe: 'rodadas, erros e reprocessamento', href: '/admin/conteudos/kit' },
      { rotulo: 'Temporadas', detalhe: 'agendamentos e execução das jornadas', href: '/admin/temporadas' },
      { rotulo: 'Métricas de vídeo', detalhe: 'fila de render e última atividade', href: '/admin/videos' },
    ],
  },
  {
    chave: 'auditoria',
    titulo: 'Auditoria e recuperação',
    descricao: 'Rastrear mudanças e recuperar objetos removidos com segurança.',
    itens: [
      { rotulo: 'Auditoria administrativa', detalhe: 'registro de ações sensíveis', href: '/admin/auditoria' },
      { rotulo: 'Lixeira', detalhe: 'itens removidos e opções de restauração', href: '/admin/lixeira' },
    ],
  },
  {
    chave: 'saude',
    titulo: 'Saúde e custo',
    descricao: 'Entender degradações e o custo de operar a plataforma.',
    itens: [
      // Um item só desde 01/09/2026: `custo-ia` (HTML estático) e `simulador-custo`
      // descreviam o mesmo assunto, e o primeiro prometia "consumo" sem ler o ledger.
      { rotulo: 'Custos de IA', detalhe: 'ledger real, projeções por escala e catálogo de modelos', href: '/admin/vertho/simulador-custo' },
    ],
  },
] as const;

export default async function PlataformaPage({ searchParams }: { searchParams: Promise<{ secao?: string }> }) {
  const { secao } = await searchParams;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-white/[0.08] pb-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
        <div>
          <p className="font-[family-name:var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--cyan)]">Backstage do produto</p>
          <h1 className="mt-2 max-w-[790px] text-[clamp(30px,4vw,50px)] font-semibold leading-[0.98] tracking-[-0.045em]">
            Governança, dados e <span className="font-[family-name:var(--font-serif)] font-normal italic text-[var(--cyan-soft)]">saúde</span>
          </h1>
          <p className="mt-4 max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--ink-dim)]">
            Ferramentas transversais ficam fora do fluxo de uma empresa ou turma. Aqui a navegação parte do tipo de cuidado que a plataforma exige.
          </p>
        </div>
        <div className="flex items-start gap-3 border-l border-[#34c5cc35] pl-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--cyan)]" />
          <div>
            <p className="text-[12px] font-semibold">Escopo global</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--ink-faint)]">Ações daqui podem afetar mais de um cliente. Os workbenches atuais continuam sendo a camada de execução.</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.06] pb-3">
        <span className="flex items-center gap-2 font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]"><Wrench size={12} /> Ir para</span>
        {GRUPOS.map((grupo) => (
          <Link key={grupo.chave} href={`/admin-v2/plataforma?secao=${grupo.chave}#${grupo.chave}`} className={`text-[10.5px] transition-colors hover:text-[var(--cyan)] ${secao === grupo.chave ? 'font-semibold text-[var(--cyan)]' : 'text-[var(--ink-dim)]'}`}>
            {grupo.titulo}
          </Link>
        ))}
      </div>

      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-2">
        {GRUPOS.map((grupo) => {
          const emFoco = secao === grupo.chave;
          return (
            <section id={grupo.chave} key={grupo.chave} className={`scroll-mt-24 border-t pt-4 ${emFoco ? 'border-[var(--cyan)]' : 'border-white/[0.1]'}`}>
              <div className="flex items-start gap-3">
                {grupo.chave === 'jobs' ? <Layers3 size={15} className="mt-0.5 text-[var(--cyan)]" /> : <Activity size={15} className="mt-0.5 text-[var(--ink-faint)]" />}
                <div>
                  <h2 className="text-[15px] font-semibold tracking-[-0.015em]">{grupo.titulo}</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-faint)]">{grupo.descricao}</p>
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-[13px] border border-white/[0.08] bg-[var(--navy-card)]">
                {grupo.itens.map((item) => (
                  <Link key={item.href} href={item.href} className="group flex items-center gap-4 border-b border-white/[0.06] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.025]">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold">{item.rotulo}</span>
                      <span className="mt-0.5 block text-[10.5px] leading-snug text-[var(--ink-faint)]">{item.detalhe}</span>
                    </span>
                    <ExternalLink size={12} className="shrink-0 text-[var(--ink-faint)] transition-colors group-hover:text-[var(--cyan)]" />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Link href="/admin-v2" className="inline-flex items-center gap-2 text-[11px] font-semibold text-[var(--cyan)] hover:underline">
        Voltar às prioridades de hoje <ArrowRight size={11} />
      </Link>
    </div>
  );
}
