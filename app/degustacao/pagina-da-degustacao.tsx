import type { Metadata } from 'next';
import { ArrowRight, Check, MessageCircle } from 'lucide-react';
import AberturaBeacon from './abertura-beacon';
import {
  carregarPaginaDaDegustacao,
  type CartaoDeVisao,
  type IdentificacaoDaPagina,
} from '@/lib/demo/degustacao-hub';
import {
  formatAcmeProspectExpiry,
  pessoalVemPrimeiro,
  type DestinoDegustacao,
} from '@/lib/demo/acme-prospect-config';

/**
 * Metadado GENÉRICO de propósito: é o que o robô de preview do WhatsApp lê para
 * montar o cartão, e o cartão aparece na conversa. Sem nome, sem empresa e sem
 * `openGraph.url` (que levaria o passe ou o código junto).
 */
export const METADADOS_DA_DEGUSTACAO: Metadata = {
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

/*
  RESPONSIVO (16/09/2026, pedido do dono: "no PC fica parecendo de celular").
  Até `lg` a página é a coluna de celular. A partir dela, a largura abre, os três
  cartões ficam lado a lado e a seção pessoal vira duas colunas. Os marcadores
  `data-layout` existem para a verificação ler a composição, não a copy.
*/
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh" style={{ background: FUNDO }}>
      <div className="mx-auto w-full max-w-[560px] px-5 pb-12 pt-8 lg:max-w-[1120px] lg:px-10 lg:pb-16 lg:pt-12">
        <img src="/logo-vertho.png" alt="Vertho" className="block h-7 w-auto lg:h-8" style={{ opacity: 0.95 }} />
        {children}
      </div>
    </main>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p
      role="status"
      className="mt-6 rounded-xl border px-4 py-3 text-[13px] leading-relaxed lg:max-w-[640px]"
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

/*
  HIERARQUIA (pedido do dono, 18/09): três cartões com o mesmo peso obrigam quem
  não conhece a plataforma a decidir por onde começar, e essa decisão é trabalho.
  A visão recomendada leva selo, borda de acento e um botão sólido; as outras
  continuam abertas, só mais discretas.
*/
function CartaoVisao({ visao }: { visao: CartaoDeVisao }) {
  const visto = Boolean(visao.vistoEm);
  const destaque = visao.recomendada;
  return (
    <a
      href={visao.url}
      data-layout="cartao-visao"
      data-recomendada={destaque ? 'sim' : 'nao'}
      className={`${destaque ? 'flex-col items-stretch' : 'items-center'} flex gap-4 rounded-2xl border p-4 transition-colors hover:bg-white/[0.07] lg:h-full lg:flex-col lg:items-stretch lg:justify-between lg:gap-8 lg:p-6`}
      style={{
        background: destaque ? 'rgba(52,197,204,0.07)' : COR.card,
        borderColor: destaque || visto ? COR.bordaAcento : COR.borda,
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          {destaque && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ background: COR.acento, color: '#04212B' }}
            >
              Comece por aqui
            </span>
          )}
          {visto && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ background: 'rgba(52,197,204,0.12)', color: COR.acento }}
            >
              <Check size={11} strokeWidth={3} aria-hidden="true" /> Acessado
            </span>
          )}
        </span>
        <span className="mt-1 block text-[16px] font-bold lg:text-[19px]" style={{ color: COR.texto }}>{visao.titulo}</span>
        <span className="mt-1 block text-[13.5px] leading-snug lg:mt-2 lg:text-[15px] lg:leading-relaxed" style={{ color: COR.texto2 }}>
          {visao.descricao}
        </span>
      </span>
      {destaque ? (
        <span
          className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-[14px] font-bold lg:w-auto lg:self-start"
          style={{ background: COR.acento, color: '#04212B' }}
        >
          Explorar
          <ArrowRight size={16} aria-hidden="true" />
        </span>
      ) : (
        <ArrowRight size={22} className="shrink-0 lg:self-end" style={{ color: COR.acento }} aria-hidden="true" />
      )}
    </a>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] lg:mb-4" style={{ color: COR.acento }}>
      {children}
    </p>
  );
}

function Titulo({ children, nivel = 2 }: { children: React.ReactNode; nivel?: 2 | 3 }) {
  const Tag = nivel === 2 ? 'h2' : 'h3';
  return (
    <Tag className={nivel === 2 ? 'text-[20px] font-bold lg:text-[22px]' : 'text-[17px] font-bold lg:text-[20px]'} style={{ color: COR.texto }}>
      {children}
    </Tag>
  );
}

function Texto({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-[14px] leading-relaxed lg:text-[15px]" style={{ color: COR.texto2 }}>
      {children}
    </p>
  );
}

export async function PaginaDaDegustacaoView({ identificacao, aviso, hostname }: {
  identificacao: IdentificacaoDaPagina;
  aviso: string | null;
  hostname: string;
}) {
  const pagina = await carregarPaginaDaDegustacao(identificacao, hostname);

  if (pagina.status === 'indisponivel') {
    return (
      <Moldura>
        <h1 className="mt-10 text-[34px] leading-[1.05] lg:text-[48px]" style={{ fontFamily: SERIF, color: COR.texto }}>
          Não conseguimos abrir seu acesso agora
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed lg:max-w-[640px] lg:text-[17px]" style={{ color: COR.texto2 }}>
          É um problema do nosso lado. Tente de novo em alguns instantes, pelo mesmo link.
        </p>
      </Moldura>
    );
  }

  if (pagina.status !== 'ok') {
    return (
      <Moldura>
        <h1 className="mt-10 text-[34px] leading-[1.05] lg:text-[48px]" style={{ fontFamily: SERIF, color: COR.texto }}>
          Este acesso não está mais disponível
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed lg:max-w-[640px] lg:text-[17px]" style={{ color: COR.texto2 }}>
          O link pode ter vencido ou sido encerrado. Peça um novo a quem enviou para você.
        </p>
      </Moldura>
    );
  }

  const { pessoal, passe } = pagina;
  const avisoTexto = aviso && Object.prototype.hasOwnProperty.call(AVISOS, aviso) ? AVISOS[aviso] : null;

  const secaoVisoes = (
    <section className="mt-8 lg:mt-12" aria-label="Veja a plataforma por dentro">
      <Eyebrow>Veja por dentro</Eyebrow>
      <div data-layout="grade-visoes" className="grid gap-3 lg:grid-cols-3 lg:gap-5">
        {pagina.visoes.map((visao) => <CartaoVisao key={visao.roleKey} visao={visao} />)}
      </div>
    </section>
  );

  const secaoPessoal = (
    <section className="mt-8 lg:mt-12" aria-label="Seu perfil">
      <Eyebrow>{pessoal.passo === 'descobrir-perfil' ? 'Se quiser, sinta na pele' : 'Sua experiência'}</Eyebrow>
      <div
        data-layout="cartao-pessoal"
        className="rounded-2xl border p-5 lg:p-8"
        style={{ background: COR.card, borderColor: COR.bordaAcento }}
      >
        {pessoal.passo === 'descobrir-perfil' && (
          <div className="lg:grid lg:grid-cols-[1fr_300px] lg:items-center lg:gap-10">
            <div>
              <Titulo>Descubra o seu perfil comportamental</Titulo>
              <Texto>
                Algumas perguntas rápidas sobre o seu jeito de agir, e você vê o resultado na hora. É o mesmo mapeamento
                que cada participante faz no início da jornada.
              </Texto>
            </div>
            {/* Secundário de propósito: enquanto a pessoa não fez o DISC, o
                botão sólido da página é a visão recomendada. O perfil é opção,
                não o caminho principal (pedido do dono, 18/09). */}
            <BotaoPessoal passe={passe} destino="mapeamento" secundario>Descobrir meu perfil</BotaoPessoal>
          </div>
        )}

        {pessoal.passo === 'responder-situacao' && (
          <div className="lg:grid lg:grid-cols-2 lg:gap-10">
            <div>
              <Titulo>Seu perfil comportamental está pronto</Titulo>
              <BotaoPessoal passe={passe} destino="perfil" secundario>Ver meu perfil</BotaoPessoal>
            </div>
            <div className="mt-5 border-t pt-5 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0" style={{ borderColor: COR.borda }}>
              <Titulo nivel={3}>Responda uma situação do seu cargo</Titulo>
              <Texto>
                Um caso real de {pagina.cargo}, com perguntas abertas. A devolutiva fica pronta em alguns minutos,
                enquanto você segue pelas visões.
              </Texto>
              <BotaoPessoal passe={passe} destino="assessment">Responder a situação</BotaoPessoal>
            </div>
          </div>
        )}

        {pessoal.passo === 'perfil-pronto' && (
          <div className="lg:grid lg:grid-cols-[1fr_300px] lg:items-center lg:gap-10">
            <div>
              <Titulo>Seu perfil comportamental está pronto</Titulo>
              <Texto>
                Na Vertho, quem lidera acompanha a jornada da equipe em vez de percorrer a própria. Veja por dentro o
                que a liderança acompanha.
              </Texto>
            </div>
            <BotaoPessoal passe={passe} destino="perfil">Ver meu perfil</BotaoPessoal>
          </div>
        )}

        {pessoal.passo === 'aguardar-devolutiva' && (
          <div className="lg:grid lg:grid-cols-[1fr_300px] lg:items-center lg:gap-10">
            <div>
              <Titulo>Suas respostas estão em análise</Titulo>
              <Texto>A devolutiva fica pronta em alguns minutos. Enquanto isso, veja a plataforma por dentro.</Texto>
            </div>
            <div>
              <BotaoPessoal passe={passe} destino="assessment">Ver o andamento</BotaoPessoal>
              <BotaoPessoal passe={passe} destino="perfil" secundario>Ver meu perfil</BotaoPessoal>
            </div>
          </div>
        )}

        {pessoal.passo === 'ler-devolutiva' && (
          <div className="lg:grid lg:grid-cols-[1fr_300px] lg:items-center lg:gap-10">
            <Titulo>Sua devolutiva está pronta</Titulo>
            <div>
              <BotaoPessoal passe={passe} destino="assessment">Ler a devolutiva</BotaoPessoal>
              <BotaoPessoal passe={passe} destino="perfil" secundario>Ver meu perfil</BotaoPessoal>
            </div>
          </div>
        )}
      </div>
    </section>
  );

  /*
    O próximo passo fica no FIM, depois de tudo o que a pessoa veio ver: ele é a
    saída da página, não uma cobrança na entrada. Quem manda a mensagem é ela, do
    próprio aparelho (ver `lib/demo/degustacao-contato.ts`), então isto é um formulário: funciona sem JavaScript e registra somente o clique, nunca o envio.
  */
  const secaoContato = (
    <section className="mt-8 lg:mt-12" aria-label="Falar com a Vertho">
      <Eyebrow>Próximo passo</Eyebrow>
      <div
        data-layout="cartao-contato"
        className="rounded-2xl border p-5 lg:grid lg:grid-cols-[1fr_300px] lg:items-center lg:gap-10 lg:p-8"
        style={{ background: COR.card, borderColor: COR.borda }}
      >
        <div>
          <Titulo>{pagina.contato.titulo}</Titulo>
          <Texto>Converse com a gente sobre como aplicar a Vertho à realidade da sua equipe. A mensagem já vai escrita.</Texto>
        </div>
        <form action="/auth/degustacao/contato" method="post" target="_blank" rel="noopener noreferrer">
          <input type="hidden" name="passe" value={passe} />
          <button type="submit"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-center text-[15px] font-bold transition-transform active:scale-[0.99] lg:mt-0"
            style={{ background: 'transparent', color: COR.texto, border: `1px solid ${COR.bordaAcento}` }}
          >
            <MessageCircle size={17} className="shrink-0" aria-hidden="true" />
            {pagina.contato.botao}
          </button>
        </form>
      </div>
    </section>
  );

  return (
    <Moldura>
      <p className="mt-9 text-[15px] lg:mt-14 lg:text-[17px]" style={{ color: COR.texto2 }}>Olá, {pagina.primeiroNome}</p>
      <h1
        className="mt-1 text-[40px] leading-[1.02] tracking-[-0.01em] lg:text-[64px]"
        style={{ fontFamily: SERIF, color: COR.texto }}
      >
        Conheça a Vertho <em style={{ color: COR.acento }}>por dentro</em>
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed lg:mt-4 lg:max-w-[640px] lg:text-[18px]" style={{ color: COR.texto2 }}>
        A plataforma funcionando {pagina.contexto}. Comece pela visão em destaque, ou explore outra perspectiva.
      </p>

      {avisoTexto && <Aviso texto={avisoTexto} />}

      {pessoalVemPrimeiro(pessoal) ? <>{secaoPessoal}{secaoVisoes}</> : <>{secaoVisoes}{secaoPessoal}</>}

      {secaoContato}

      <p className="mt-10 text-[12px] leading-relaxed lg:mt-14 lg:text-[13px]" style={{ color: COR.texto3 }}>
        Acesso individual, ativo até {formatAcmeProspectExpiry(pagina.expiraEm)} (horário de Brasília).
      </p>

      <AberturaBeacon passe={passe} />
    </Moldura>
  );
}
