/**
 * Modelos de clínica do simulador de atendimento (pacote de clínicas, onlabel, decisão de 22/10/2026).
 *
 * Um modelo é uma clínica FICTÍCIA com regras próprias (convênios, horários, remarcação, falta,
 * cancelamento, autorização, o que a recepção pode ou não prometer). Cada secretária treina em um
 * modelo, escolhido no cadastro pelo admin (`colaboradores.recepcao_modelo`, mig 297), independente da
 * clínica real em que ela trabalha e do cargo dela. São 6 no contrato; os nomes ainda não foram
 * definidos (D8 do plano), e por isso a lista nasce VAZIA: lista vazia = recurso desligado (o cadastro
 * não oferece o seletor e ninguém tem modelo).
 *
 * Fonte única: o cadastro (seletor e validação no servidor), o simulador (filtro dos casos) e o
 * gerador de casos "situação × clínica" leem daqui. A `descricao` é o texto que o gerador usa para
 * reescrever um caso nas regras da clínica e o que o admin lê como ajuda ao escolher.
 *
 * 🔑 Código do CASO por modelo: `codigoDoCasoNoModelo`. Publicar no Catálogo Vertho arquiva a versão
 * publicada anterior do MESMO código e do MESMO degrau (`docs/recepcao-medica.md`, "Uso"). Se o caso
 * "remarcacao-02" existisse nos 6 modelos com o mesmo código, publicar o do modelo B arquivaria o do
 * modelo A. O modelo entra no código, e a regra de arquivamento continua certa sem exceção.
 */

export interface ModeloClinica {
  /** Código estável (vai para `colaboradores.recepcao_modelo` e `conteudo.modelo` do caso). */
  codigo: string;
  /** Nome da clínica fictícia, como aparece para quem treina e no cadastro. */
  nome: string;
  /** As regras da clínica: insumo do gerador e ajuda do seletor no cadastro. */
  descricao: string;
}

/** Formato do código: o mesmo do CHECK da mig 297 e compatível com o `id` do caso (`schema.ts`). */
export const FORMATO_CODIGO_MODELO = /^[a-z][a-z0-9_-]{1,39}$/;

/** Os modelos do contrato. Vazio até a definição dos 6 (D8). */
export const MODELOS_CLINICA: readonly ModeloClinica[] = Object.freeze([]);

export function modeloClinicaExiste(codigo: unknown, lista: readonly ModeloClinica[] = MODELOS_CLINICA): boolean {
  return typeof codigo === 'string' && lista.some((m) => m.codigo === codigo);
}

/** Código do caso de uma situação dentro de um modelo (ver o 🔑 acima). */
export function codigoDoCasoNoModelo(codigoBase: string, modelo: string): string {
  return `${codigoBase}--${modelo}`;
}
