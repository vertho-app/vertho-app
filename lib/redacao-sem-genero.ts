/**
 * Revisão determinística de construções dirigidas a "você". Complementa a
 * instrução de redação da IA e corrige relatórios antigos na LEITURA.
 *
 * Não é um analisador geral de português: só reformula construções conhecidas
 * cujo sujeito está explícito. Não troca terminações a/o, não infere gênero,
 * não atravessa uma oração para achar um adjetivo e não reescreve citações.
 * Assim "você deixou a equipe preparada" e "a avaliação sozinha" ficam intactos.
 */
const INICIO = '(?<![\\p{L}\\p{N}_])';
// Não transformar só metade de "preparado(a)", "preparado/preparada" ou compostos.
const FIM = '(?![\\p{L}\\p{N}_(/-])';
const MODIFICADORES = '(?:(?:não|nunca|já|ainda|também|sempre)\\s+){0,3}';

const ESTADOS: Record<string, { nome: string; feminino?: boolean }> = {
  preparad: { nome: 'preparo' },
  motivad: { nome: 'motivação', feminino: true },
  engajad: { nome: 'engajamento' },
  comprometid: { nome: 'comprometimento' },
  sobrecarregad: { nome: 'sobrecarga', feminino: true },
  orgulhos: { nome: 'orgulho' },
  cansad: { nome: 'cansaço' },
  frustrad: { nome: 'frustração', feminino: true },
  insegur: { nome: 'insegurança', feminino: true },
};

const ESTADO_DA_PESSOA = new RegExp(
  `${INICIO}(você\\s+${MODIFICADORES}(?:está|estava|estará|estaria|fica|ficou|ficava|ficará|ficaria|se sente|se sentiu|se sentia)\\s+${MODIFICADORES})`
  + `(?:(mais|menos|muito|pouco|tão)\\s+)?(${Object.keys(ESTADOS).join('|')})[oa]${FIM}`,
  'giu',
);

// Objetos enumerados: um ".*?" aqui atravessaria "você viu a equipe trabalhando
// sozinha" e passaria a reescrever uma terceira pessoa. Sem elipse de sujeito.
const ATIVIDADE_POR_CONTA_PROPRIA = new RegExp(
  `${INICIO}(você\\s+${MODIFICADORES}`
  + '(?:(?:vem|vinha|está|estava|continua|continuava)\\s+(?:carregando|fazendo|resolvendo|trabalhando|assumindo|conduzindo)'
  + '|(?:precisa|precisava|pode|podia|consegue|conseguia|vai)\\s+(?:carregar|fazer|resolver|trabalhar|assumir|conduzir)'
  + '|carrega|carregava|carregou|faz|fazia|fez|resolve|resolvia|resolveu|trabalha|trabalhava|trabalhou|assume|assumia|assumiu|conduz|conduzia|conduziu)'
  + '(?:\\s+(?:tudo|isso|o trabalho|a tarefa|as tarefas|as demandas|muitas responsabilidades|a responsabilidade|as responsabilidades))?'
  + `\\s+)sozinh[oa]${FIM}`,
  'giu',
);

const PAPEL_DA_PESSOA = new RegExp(
  `${INICIO}(você\\s+(?:atua|atuava|atuou|trabalha|trabalhava|trabalhou)\\s+)como\\s+`
  + '(coordenador(?:a)?(?:\\s+pedagógic[oa])?|diretor(?:a)?(?:\\s+escolar)?|professor(?:a)?)'
  + '(?=\\s*(?:[,.!?;:]|$)|\\s+(?:de|da|do|em|na|no)\\b)',
  'giu',
);

// Só protege pares completos. Aspas também são usadas no relato para citar
// falas literais; mudar a fala seria alterar a evidência, não corrigir redação.
const TRECHO_LITERAL = /("[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’|«[^»]*»|`[^`]*`|^[ \t]*>[^\n]*(?:\n[ \t]*>[^\n]*)*)/gm;

function revisarTrecho(texto: string): string {
  return texto
    .replace(ESTADO_DA_PESSOA, (_m, inicio: string, intensidade: string | undefined, radical: string) => {
      const { nome, feminino } = ESTADOS[radical.toLowerCase()];
      const intensidadeOriginal = intensidade?.toLowerCase();
      const quantificador = intensidadeOriginal === 'tão'
        ? (feminino ? 'tanta' : 'tanto')
        : intensidadeOriginal === 'muito' || intensidadeOriginal === 'pouco'
          ? intensidadeOriginal.slice(0, -1) + (feminino ? 'a' : 'o')
          : intensidadeOriginal;
      return `${inicio}com ${quantificador ? `${quantificador} ` : ''}${nome}`;
    })
    .replace(ATIVIDADE_POR_CONTA_PROPRIA, '$1por conta própria')
    .replace(PAPEL_DA_PESSOA, (_m, inicio: string, cargo: string) => {
      const papel = /coordenador/iu.test(cargo) ? 'coordenação' : /diretor/iu.test(cargo) ? 'direção' : 'docência';
      const complemento = /pedagógic/iu.test(cargo) ? ' pedagógica' : /escolar/iu.test(cargo) ? ' escolar' : '';
      return `${inicio}na ${papel}${complemento}`;
    });
}

export function semTratamentoDeGenero<T>(texto: T): T {
  if (typeof texto !== 'string') return texto;
  // split com grupo capturante mantém os trechos literais nas posições ímpares.
  return texto.split(TRECHO_LITERAL)
    .map((trecho, i) => i % 2 ? trecho : revisarTrecho(trecho))
    .join('') as T;
}

/** Só a narrativa autoral: evidências citadas e demais campos passam intactos. */
export function resumoSemTratamentoDeGenero<T>(resumo: T): T {
  if (typeof resumo === 'string') return semTratamentoDeGenero(resumo);
  if (!resumo || typeof resumo !== 'object' || Array.isArray(resumo)) return resumo;
  const r = resumo as Record<string, unknown>;
  return {
    ...r,
    ...Object.fromEntries(['mensagem_geral', 'principal_avanco', 'principal_ponto_de_atencao']
      .filter((chave) => chave in r)
      .map((chave) => [chave, semTratamentoDeGenero(r[chave])])),
  } as T;
}
