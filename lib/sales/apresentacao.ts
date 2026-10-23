// Apresentação personalizada que o RC gera pelo portal (decisão do dono de
// 23/10/2026; mig 299). Página pública `/apresentacao/[token]`, SEM preço: a
// história da vertho.ai no segmento do cliente, com o nome dele, o contexto que
// o RC confirmou e o contato do RC. O conteúdo institucional é o do documento da
// proposta (`conteudoInstitucional`): as duas peças não podem divergir.
//
// Os vídeos ficam para depois (o dono vai gravar): `VIDEOS_DA_APRESENTACAO` vazio
// = a seção não aparece. Quando houver, cada vídeo entra aqui com o seu segmento.
import { conteudoInstitucional, termosDoCliente, type ProposalSegmento } from './proposal-document';

export type VideoDaApresentacao = { titulo: string; url: string; segmentos: ProposalSegmento[] };

/** Vazio até o dono gravar os vídeos: a seção some sozinha. */
export const VIDEOS_DA_APRESENTACAO: VideoDaApresentacao[] = [];

/** Formato do token público (o mesmo gerador da proposta: 18 bytes em base64url). */
export const TOKEN_APRESENTACAO = /^[A-Za-z0-9_-]{20,40}$/;

/** Teto do contexto que o cliente lê: é um parágrafo, não um relatório. */
export const CONTEXTO_MAX = 600;

export type ApresentacaoVM = {
  cliente: { nome: string | null };
  segmento: ProposalSegmento;
  termos: ReturnType<typeof termosDoCliente>;
  contexto: string | null;
  contato: { nome: string; email: string | null; whatsapp: string | null };
  videos: VideoDaApresentacao[];
} & ReturnType<typeof conteudoInstitucional>;

export function buildApresentacao(
  a: { cliente_nome: string | null; segmento: string; contexto: string | null },
  rep: { name: string | null; email: string | null; phone: string | null } | null,
): ApresentacaoVM {
  const segmento: ProposalSegmento = a.segmento === 'educacao' ? 'educacao' : 'corporativo';
  const nome = a.cliente_nome?.trim() || null;
  return {
    cliente: { nome },
    segmento,
    termos: termosDoCliente(segmento, nome),
    contexto: a.contexto?.trim() || null,
    contato: {
      nome: rep?.name?.trim() || 'Representante vertho.ai',
      email: rep?.email?.trim() || null,
      whatsapp: rep?.phone?.trim() || null,
    },
    videos: VIDEOS_DA_APRESENTACAO.filter((v) => v.segmentos.includes(segmento)),
    ...conteudoInstitucional(segmento),
  };
}
