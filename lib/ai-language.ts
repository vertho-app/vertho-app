import { defaultLocale, type AppLocale } from '@/i18n/routing';
import { localeLanguageName } from '@/lib/i18n';

/** Uma política de redação para síncrono, chat e lote, sem dado demográfico. */
export const REDACAO_SEM_GENERO = `═══ REDAÇÃO DIRIGIDA À PESSOA ═══
O gênero da pessoa participante não foi informado. Não o deduza pelo nome, alias, cargo, voz, perfil, relato ou pelos personagens do cenário.
Ao escrever para a pessoa, use "você" e descreva ações e evidências com frases sem marcação de gênero. Em terceira pessoa, prefira o nome/alias ou "a pessoa participante".
Exemplos em português: "você demonstrou preparo", "você acumulou responsabilidades", "no exercício da coordenação", "você vem carregando por conta própria". Evite "preparado/preparada", "sobrecarregado/sobrecarregada", "coordenador/coordenadora" ou "sozinho/sozinha" como tratamento da pessoa. Não use terminações artificiais nem duplas como "preparado(a)"; reformule naturalmente no idioma solicitado.
Esta regra é de REDAÇÃO: não altera critérios, notas, níveis, conclusões, limites da evidência ou recomendações. Não infira atributos pessoais nem os use como critério de avaliação.
Preserve citações literais, respostas da pessoa e a identidade dos personagens. A concordância com outros substantivos continua normal: "a equipe está preparada" e "a pessoa participante" não informam o gênero de quem recebe o texto.
Antes de responder, revise todas as referências à pessoa participante e reformule as que presumem gênero, preservando o sentido, a intensidade, a negação e o tempo verbal. Preserve o formato de saída e as chaves JSON exigidas.`;

/**
 * Regra de pontuação das tarefas cujo texto chega ao cliente (R-57). Só entra no
 * system das tarefas do registro `SAIDAS_AO_CLIENTE` (`lib/ai-saida-sem-travessao.ts`);
 * as demais seguem byte a byte como antes. É a primeira camada: o sanitizador da
 * resposta é a segunda, porque o exemplo do prompt e o hábito do modelo vencem a prosa.
 */
export const REGRA_PONTUACAO_DA_SAIDA = `═══ PONTUAÇÃO ═══
Não use travessão (nem o longo nem o médio) no texto que você escreve: para uma pausa, use vírgula, dois-pontos ou ponto final. Hífen e intervalos como "3 a 5" continuam normais. Citações literais da pessoa ficam exatamente como ela escreveu.`;

/**
 * Só entra quando o idioma NÃO é o padrão (Onda E, 04/10/2026). O código confere por NOME o que o
 * modelo devolve: o PDI casa cada competência pelo nome (`alinhar`, em `individual-core`) e, sem
 * casar, grava a competência sem o texto que a IA escreveu; o blueprint aplica o nível real pelo
 * nome; o scorer do fechamento casa o descritor pelo nome. Pedir "traduza os valores textuais"
 * sem esta ressalva convida o modelo a traduzir o nome da competência junto com a prosa.
 * No idioma padrão o prompt segue byte a byte como sempre foi (o cache do prefixo não muda).
 */
export const REGRA_NOMES_DOS_DADOS = 'Nomes de competências, descritores, cargos, empresas e pessoas que o prompt traz como dados ficam exatamente como foram escritos, sem tradução: o sistema os confere por nome.';

export function withLanguageInstruction(system: string, locale: AppLocale, opcoes: { semTravessao?: boolean } = {}): string {
  const nomesDosDados = locale === defaultLocale ? '' : `\n${REGRA_NOMES_DOS_DADOS}`;
  const base = `${system}

═══ IDIOMA DA EXPERIÊNCIA ═══
Use ${localeLanguageName(locale)} em todo texto destinado ao usuário final.
Mantenha nomes de campos JSON, enums técnicos, códigos e identificadores exatamente como especificados no prompt.
Se o prompt exigir JSON, retorne JSON válido e traduza apenas os valores textuais voltados ao usuário.${nomesDosDados}

${REDACAO_SEM_GENERO}`;
  return opcoes.semTravessao ? `${base}

${REGRA_PONTUACAO_DA_SAIDA}` : base;
}
