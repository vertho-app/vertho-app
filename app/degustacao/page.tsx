import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ArrowRight, Check } from 'lucide-react';
import AberturaBeacon from './abertura-beacon';
import { carregarPaginaDaDegustacao, type CartaoDeVisao } from '@/lib/demo/degustacao-hub';
import {
  formatAcmeProspectExpiry,
  pessoalVemPrimeiro,
  type DestinoDegustacao,
} from '@/lib/demo/acme-prospect-config';

export const dynamic = 'force-dynamic';

/**
 * Metadado GENÉRICO de propósito: é o que o robô de preview do WhatsApp lê para
 * montar o cartão, e o cartão aparece na conversa. Sem nome, sem empresa e sem
 * `openGraph.url` (que levaria o passe junto).
 */
export const metadata: Metadata = {
  title: 'Conheça a Vertho por dentro',
  description: 'Veja a plataforma funcionando e, se quiser, descubra o seu perfil comportamental.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Conheça a Vertho por dentro',
    description: 'Veja a plataforma funcionando e, se quiser, descubra o seu perfil comportamental.',
    siteName: 'Vertho',
    type: 'website',
  },
};

const COR = {
  acento: '#34C5CC',
  texto: '#FFFFFF',
  texto2: 'rgba(255,255,255,0.74)',
  texto3: 'rgba(255,255,255,0.5)',
  card: 'rgba(255,255,255,0.045)',
  borda: 'rgba(255,255,255,0.10)',
  bordaAcento: 'rgba(52,197,204,0.35)',
} as const;

const FUNDO =
  'radial-gradient(900px 520px at 85% -10%, rgba(52,197,204,.12), transparent 55%),'
  + 'radial-gradient(700px 480px at -10% 45%, rgba(52,197,204,.06), transparent 60%),'
  + 'linear-gradient(180deg,#06172C 0%,#0A1F3A 100%)';

const SERIF = 'var(--font-serif, "Instrument Serif"), Georgia, serif';

const AVISOS: Record<string, string> = {
  aguarde: 'Foram muitas tentativas seguidas. Espere um minuto e tente de novo.',
  indisponivel: 'Não conseguimos abrir essa parte agora. Tente de novo em alguns instantes.',
  destino: 'Não deu para abrir essa parte. Tente de novo pelo botão.',
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function lerParametro(valor: string | string[] | undefined): string | null {
  return typeof valor === 'string' && valor ? valor : null;
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh" style={{ background: FUNDO }}>
      <div className="mx-auto w-full max-w-[560px] px-5 pb-12 pt-8">
        <img src="/logo-vertho.png" alt="Vertho" className="block h-7 w-auto" style={{ opacity: 0.95 }} />
        {children}
      </div>
    </main>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p
      role="status"
      className="mt-6 rounded-xl border px-4 py-3 text-[13px] leading-relaxed"
      style={{ borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.07)', color: 'rgba(254,243,199,0.9)' }}
    >
      {texto}
    </p>
  );
}

function BotaoPessoal({ passe, destino, children, secundario = false }: {
  passe: string;
  destino: DestinoDegustacao;
  children: React.ReactNode;
  secundario?: boolean;
}) {
  return (
    <form method="post" action="/auth/degustacao" className="mt-4">
      <input type="hidden" name="passe" value={passe} />
      <input type="hidden" name="destino" value={destino} />
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[15px] font-bold transition-transform active:scale-[0.99]"
        style={secundario
          ? { background: 'transparent', color: COR.texto, border: `1px solid ${COR.borda}` }
          : { background: COR.acento, color: '#04212B' }}
      >
        {children}
      </button>
    </form>
  );
}

function CartaoVisao({ visao }: { visao: CartaoDeVisao }) {
  const visto = Boolean(visao.vistoEm);
  return (
    <a
      href={visao.url}
      className="flex items-center gap-4 rounded-2xl border p-4 transition-colors"
      style={{ background: COR.card, borderColor: visto ? COR.bordaAcento : COR.borda }}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[16px] font-bold" style={{ color: COR.texto }}>{visao.titulo}</span>
          {visto && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ background: 'rgba(52,197,204,0.12)', color: COR.acento }}
            >
              <Check size={11} strokeWidth={3} aria-hidden="true" /> Visto
            </span>
          )}
        </span>
        <span className="mt-1 block text-[13.5px] leading-snug" style={{ color: COR.texto2 }}>{visao.descricao}</span>
      </span>
      <ArrowRight size={22} style={{ color: COR.acento, flexShrink: 0 }} aria-hidden="true" />
    </a>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: COR.acento }}>
      {children}
    </p>
  );
}

export default async function PaginaDaDegustacao({ searchParams }: Props) {
  const parametros = await searchParams;
  const passe = lerParametro(parametros.passe);
  const aviso = lerParametro(parametros.aviso);
  const cabecalhos = await headers();
  const hostname = String(cabecalhos.get('host') || '').split(':')[0].toLowerCase();

  const pagina = await carregarPaginaDaDegustacao(passe, hostname);

  if (pagina.status === 'indisponivel') {
    return (
      <Moldura>
        <h1 className="mt-10 text-[34px] leading-[1.05]" style={{ fontFamily: SERIF, color: COR.texto }}>
          Não conseguimos abrir seu acesso agora
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: COR.texto2 }}>
          É um problema do nosso lado. Tente de novo em alguns instantes, pelo mesmo link.
        </p>
      </Moldura>
    );
  }

  if (pagina.status !== 'ok' || !passe) {
    return (
      <Moldura>
        <h1 className="mt-10 text-[34px] leading-[1.05]" style={{ fontFamily: SERIF, color: COR.texto }}>
          Este acesso não está mais disponível
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: COR.texto2 }}>
          O link pode ter vencido ou sido encerrado. Peça um novo a quem enviou para você.
        </p>
      </Moldura>
    );
  }

  const { pessoal } = pagina;
  const avisoTexto = aviso && Object.prototype.hasOwnProperty.call(AVISOS, aviso) ? AVISOS[aviso] : null;

  const secaoVisoes = (
    <section className="mt-8" aria-label="Veja a plataforma por dentro">
      <Eyebrow>Veja por dentro</Eyebrow>
      <div className="space-y-3">
        {pagina.visoes.map((visao) => <CartaoVisao key={visao.roleKey} visao={visao} />)}
      </div>
    </section>
  );

  const secaoPessoal = (
    <section className="mt-8" aria-label="Seu perfil">
      <Eyebrow>{pessoal.passo === 'descobrir-perfil' ? 'Se quiser, sinta na pele' : 'Sua experiência'}</Eyebrow>
      <div className="rounded-2xl border p-5" style={{ background: COR.card, borderColor: COR.bordaAcento }}>
        {pessoal.passo === 'descobrir-perfil' && (
          <>
            <h2 className="text-[20px] font-bold" style={{ color: COR.texto }}>Descubra o seu perfil comportamental</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: COR.texto2 }}>
              Algumas perguntas rápidas sobre o seu jeito de agir, e você vê o resultado na hora. É o mesmo mapeamento que
              cada participante faz no início da jornada.
            </p>
            <BotaoPessoal passe={passe} destino="mapeamento">Descobrir meu perfil</BotaoPessoal>
          </>
        )}

        {pessoal.passo === 'responder-situacao' && (
          <>
            <h2 className="text-[20px] font-bold" style={{ color: COR.texto }}>Seu perfil comportamental está pronto</h2>
            <BotaoPessoal passe={passe} destino="perfil" secundario>Ver meu perfil</BotaoPessoal>
            <div className="mt-5 border-t pt-5" style={{ borderColor: COR.borda }}>
              <h3 className="text-[17px] font-bold" style={{ color: COR.texto }}>Responda uma situação do seu cargo</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: COR.texto2 }}>
                Um caso real de {pagina.cargo}, com perguntas abertas. A devolutiva fica pronta em alguns minutos,
                enquanto você segue pelas visões.
              </p>
              <BotaoPessoal passe={passe} destino="assessment">Responder a situação</BotaoPessoal>
            </div>
          </>
        )}

        {pessoal.passo === 'aguardar-devolutiva' && (
          <>
            <h2 className="text-[20px] font-bold" style={{ color: COR.texto }}>Suas respostas estão em análise</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: COR.texto2 }}>
              A devolutiva fica pronta em alguns minutos. Enquanto isso, veja a plataforma por dentro.
            </p>
            <BotaoPessoal passe={passe} destino="assessment">Ver o andamento</BotaoPessoal>
            <BotaoPessoal passe={passe} destino="perfil" secundario>Ver meu perfil</BotaoPessoal>
          </>
        )}

        {pessoal.passo === 'ler-devolutiva' && (
          <>
            <h2 className="text-[20px] font-bold" style={{ color: COR.texto }}>Sua devolutiva está pronta</h2>
            <BotaoPessoal passe={passe} destino="assessment">Ler a devolutiva</BotaoPessoal>
            <BotaoPessoal passe={passe} destino="perfil" secundario>Ver meu perfil</BotaoPessoal>
          </>
        )}
      </div>
    </section>
  );

  return (
    <Moldura>
      <p className="mt-9 text-[15px]" style={{ color: COR.texto2 }}>Olá, {pagina.primeiroNome}</p>
      <h1 className="mt-1 text-[40px] leading-[1.02] tracking-[-0.01em]" style={{ fontFamily: SERIF, color: COR.texto }}>
        Conheça a Vertho <em style={{ color: COR.acento }}>por dentro</em>
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed" style={{ color: COR.texto2 }}>
        A plataforma funcionando {pagina.contexto}. Escolha por onde começar.
      </p>

      {avisoTexto && <Aviso texto={avisoTexto} />}

      {pessoalVemPrimeiro(pessoal) ? <>{secaoPessoal}{secaoVisoes}</> : <>{secaoVisoes}{secaoPessoal}</>}

      <p className="mt-10 text-[12px] leading-relaxed" style={{ color: COR.texto3 }}>
        Acesso individual, ativo até {formatAcmeProspectExpiry(pagina.expiraEm)} (horário de Brasília).
      </p>

      <AberturaBeacon passe={passe} />
    </Moldura>
  );
}
