/**
 * SEGMENTOS do simulador de atendimento (domínio da conversa).
 *
 * 🔑 Decisão do dono (18/09/2026): o domínio médico sai do código e vira
 * configuração de cada empresa. O motor (prompts da pessoa simulada e do
 * avaliador, matriz, textos de referência) lê os termos do segmento do CASO;
 * a empresa escolhe o segmento em `recepcao_config.dominio`.
 *
 * `recepcao_medica` reproduz BYTE A BYTE os prompts calibrados em 06/09 e
 * 08/09 (mesmo prompt_hash): `tests/unit/recepcao-dominio.test.ts` compara com
 * a cópia congelada em `tests/fixtures/recepcao-prompts-legado.ts`. Os demais
 * segmentos usam a mesma estrutura com termos neutros; "pessoa" é feminino, e
 * por isso os adjetivos do prompt ("desconfiada", "contrariada") concordam.
 *
 * Os termos já vêm com artigo e preposição ("da secretária", "à pessoa que
 * atende") porque o português não deixa montar isso por regra sem erro.
 * Módulo puro: roda no servidor e na tela.
 */

export interface OcorrenciaCritica {
  id: string;
  /** Definição que o avaliador lê: o que conta e o que NÃO conta. */
  definicao: string;
}

export interface DominioAtendimento {
  id: string;
  /** Pessoa simulada, com artigo indefinido: "Você interpreta ___ em treino de ___." */
  personaFicticia: string;
  treino: string;
  aAtendente: string;
  daAtendente: string;
  aoAtendente: string;
  aAtendida: string;
  daAtendida: string;
  todaAtendida: string;
  /** Sem artigo: "Referências de oportunidade podem citar ___ ou ___." */
  atendidaSemArtigo: string;
  atendenteSemArtigo: string;
  /** "Peça ... em linguagem ___." */
  linguagemDaAtendida: string;
  oEstabelecimento: string;
  outrosEstabelecimentos: string;
  /** Exemplo de tranquilização genérica, entre aspas. */
  tranquilizacao: string;
  /** "Não invente ___, ameaças de violência ou insultos discriminatórios." */
  naoInventar: string;
  /** Limite próprio da pessoa simulada, frase completa ou vazio. */
  limiteDaPersona: string;
  /** Escopo do avaliador quando o caso não declara o seu. */
  escopoPadrao: string;
  /** Ids de participante no histórico que o avaliador lê. */
  idAtendente: string;
  idAtendida: string;
  /** Orientação fora da alçada, no descritor pro2 da matriz ("Oferece ___ ou toma decisão..."). */
  orientacaoIndevida: string;
  ocorrencias: OcorrenciaCritica[];
}

const DESRESPEITO: OcorrenciaCritica = {
  id: 'desrespeito_grave',
  definicao:
    'insulto, ameaça ou humilhação explícita. Frieza, resposta genérica e falta de acolhimento, isoladamente, não caracterizam essa categoria.',
};
const DIVULGACAO_GERAL: OcorrenciaCritica = {
  id: 'divulgacao_dado_terceiro',
  definicao:
    'divulgação efetiva de informação de outra pessoa, inclusive confirmação de cadastro, agenda ou compra. Oferta vaga de verificar, sem revelar informação, não prova divulgação.',
};

/** Termos neutros dos segmentos novos: quem atende e quem é atendido, sem profissão. */
const NEUTRO = {
  aAtendente: 'a pessoa que atende',
  daAtendente: 'da pessoa que atende',
  aoAtendente: 'à pessoa que atende',
  aAtendida: 'a pessoa atendida',
  daAtendida: 'da pessoa atendida',
  todaAtendida: 'toda pessoa atendida',
  atendidaSemArtigo: 'pessoa atendida',
  atendenteSemArtigo: 'quem atende',
  tranquilizacao: '"fique tranquilo"',
  limiteDaPersona: '',
  idAtendente: 'atendente',
  idAtendida: 'pessoa_atendida',
} as const;

export const DOMINIOS: readonly DominioAtendimento[] = [
  {
    id: 'recepcao_medica',
    personaFicticia: 'uma paciente fictícia',
    treino: 'recepção médica',
    aAtendente: 'a secretária',
    daAtendente: 'da secretária',
    aoAtendente: 'à secretária',
    aAtendida: 'a paciente',
    daAtendida: 'da paciente',
    todaAtendida: 'toda paciente',
    atendidaSemArtigo: 'paciente',
    atendenteSemArtigo: 'secretária',
    linguagemDaAtendida: 'de paciente',
    oEstabelecimento: 'a clínica',
    outrosEstabelecimentos: 'outras clínicas',
    tranquilizacao: '"fique tranquila"',
    naoInventar: 'agenda, dados pessoais, sintomas',
    limiteDaPersona: 'Não forneça orientação clínica.',
    escopoPadrao:
      'Avalie apenas o procedimento administrativo explicitamente descrito na ficha; não exija condutas clínicas.',
    idAtendente: 'secretaria',
    idAtendida: 'paciente',
    orientacaoIndevida: 'orientação clínica',
    ocorrencias: [
      {
        id: 'orientacao_clinica_indevida',
        definicao:
          'orientação clínica efetiva sobre diagnóstico, tratamento, medicação ou interpretação de exames. "Vou verificar", prazo ruim ou promessa administrativa não são orientação clínica.',
      },
      {
        id: 'divulgacao_dado_terceiro',
        definicao:
          'divulgação efetiva de informação da outra pessoa, inclusive confirmação de presença/agenda. Oferta vaga de verificar, sem revelar informação, não prova divulgação.',
      },
      DESRESPEITO,
    ],
  },
  {
    ...NEUTRO,
    id: 'atendimento_geral',
    personaFicticia: 'uma pessoa fictícia que procura atendimento',
    treino: 'atendimento ao cliente',
    linguagemDaAtendida: 'de cliente',
    oEstabelecimento: 'a empresa',
    outrosEstabelecimentos: 'outras empresas',
    naoInventar: 'agenda, dados pessoais, preços, prazos',
    escopoPadrao:
      'Avalie apenas o procedimento de atendimento explicitamente descrito na ficha; não exija conhecimento técnico além dela.',
    orientacaoIndevida: 'orientação técnica fora da sua função',
    ocorrencias: [DIVULGACAO_GERAL, DESRESPEITO],
  },
  {
    ...NEUTRO,
    id: 'secretaria_escolar',
    personaFicticia: 'uma pessoa fictícia (estudante ou responsável)',
    treino: 'atendimento de secretaria escolar',
    linguagemDaAtendida: 'de quem procura a escola',
    oEstabelecimento: 'a escola',
    outrosEstabelecimentos: 'outras escolas',
    naoInventar: 'agenda, dados pessoais, notas, documentos',
    escopoPadrao:
      'Avalie apenas o procedimento administrativo da secretaria explicitamente descrito na ficha; não exija decisões pedagógicas.',
    orientacaoIndevida: 'orientação pedagógica fora da sua função',
    ocorrencias: [
      {
        id: 'divulgacao_dado_terceiro',
        definicao:
          'divulgação efetiva de informação de estudante ou de outra família, inclusive confirmação de matrícula, frequência ou notas. Oferta vaga de verificar, sem revelar informação, não prova divulgação.',
      },
      DESRESPEITO,
    ],
  },
  {
    ...NEUTRO,
    id: 'atendimento_loja',
    personaFicticia: 'uma pessoa fictícia, cliente da loja',
    treino: 'atendimento em loja',
    linguagemDaAtendida: 'de cliente',
    oEstabelecimento: 'a loja',
    outrosEstabelecimentos: 'outras lojas',
    naoInventar: 'estoque, preços, prazos de entrega, dados pessoais',
    escopoPadrao:
      'Avalie apenas o procedimento de atendimento e as condições comerciais explicitamente descritos na ficha; não exija conhecimento técnico do produto além dela.',
    orientacaoIndevida: 'orientação técnica fora da sua função',
    ocorrencias: [DIVULGACAO_GERAL, DESRESPEITO],
  },
];

export const DOMINIO_PADRAO = 'recepcao_medica';
export const IDS_DOMINIO = DOMINIOS.map((d) => d.id) as [string, ...string[]];

export function dominioExiste(id: unknown): id is string {
  return typeof id === 'string' && DOMINIOS.some((d) => d.id === id);
}

/** Termos do segmento; id desconhecido é erro de dado, não motivo para cair no médico. */
export function dominioAtendimento(id: string = DOMINIO_PADRAO): DominioAtendimento {
  const d = DOMINIOS.find((x) => x.id === id);
  if (!d) throw new Error(`Segmento de atendimento desconhecido: ${id}`);
  return d;
}
