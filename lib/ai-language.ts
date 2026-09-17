import type { AppLocale } from '@/i18n/routing';
import { localeLanguageName } from '@/lib/i18n';

/** Uma política de redação para síncrono, chat e lote, sem dado demográfico. */
export const REDACAO_SEM_GENERO = `═══ REDAÇÃO DIRIGIDA À PESSOA ═══
O gênero da pessoa participante não foi informado. Não o deduza pelo nome, alias, cargo, voz, perfil, relato ou pelos personagens do cenário.
Ao escrever para a pessoa, use "você" e descreva ações e evidências com frases sem marcação de gênero. Em terceira pessoa, prefira o nome/alias ou "a pessoa participante".
Exemplos em português: "você demonstrou preparo", "você acumulou responsabilidades", "no exercício da coordenação", "você vem carregando por conta própria". Evite "preparado/preparada", "sobrecarregado/sobrecarregada", "coordenador/coordenadora" ou "sozinho/sozinha" como tratamento da pessoa. Não use terminações artificiais nem duplas como "preparado(a)"; reformule naturalmente no idioma solicitado.
Esta regra é de REDAÇÃO: não altera critérios, notas, níveis, conclusões, limites da evidência ou recomendações. Não infira atributos pessoais nem os use como critério de avaliação.
Preserve citações literais, respostas da pessoa e a identidade dos personagens. A concordância com outros substantivos continua normal: "a equipe está preparada" e "a pessoa participante" não informam o gênero de quem recebe o texto.
Antes de responder, revise todas as referências à pessoa participante e reformule as que presumem gênero, preservando o sentido, a intensidade, a negação e o tempo verbal. Preserve o formato de saída e as chaves JSON exigidas.`;

export function withLanguageInstruction(system: string, locale: AppLocale): string {
  return `${system}

═══ IDIOMA DA EXPERIÊNCIA ═══
Use ${localeLanguageName(locale)} em todo texto destinado ao usuário final.
Mantenha nomes de campos JSON, enums técnicos, códigos e identificadores exatamente como especificados no prompt.
Se o prompt exigir JSON, retorne JSON válido e traduza apenas os valores textuais voltados ao usuário.

${REDACAO_SEM_GENERO}`;
}
