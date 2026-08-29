# Template — Módulo-Base de Conteúdo

> Copie este arquivo, renomeie pra `modulo-<grupo_id>-<locale>.md` (ou edite no admin Vertho quando a frente 2 estiver pronta) e preencha os campos abaixo.
>
> Spec completa: [`MODULOS-BASE-CONTEUDO.md`](./MODULOS-BASE-CONTEUDO.md). Em caso de dúvida sobre o que cada campo significa, consulte lá.
>
> **Antes de preencher**: leia a régua de maturidade do descritor escolhido e identifique de qual nível pra qual nível este módulo vai apoiar a transição. O foco aqui é **matéria-prima pedagógica reutilizável**, não régua, não conteúdo final.

---

## Cabeçalho (Identificação)

| Campo | Valor |
|---|---|
| `grupo_id` | _(uuid — gerado automaticamente; deixe em branco no rascunho)_ |
| `locale` | `pt-BR` / `pt-PT` / `es-ES` / `en-US` |
| `competencia_id` | _(uuid → catálogo Vertho)_ |
| `competencia` (referência humana) | _ex.: Comunicação e relacionamento com famílias_ |
| `descritor_id` | _(uuid → régua de maturidade)_ |
| `descritor` (referência humana) | _ex.: Comunica situações delicadas com clareza, acolhimento e objetividade_ |
| `nivel_entrada` | `N1` / `N2` / `N3` |
| `nivel_destino` | `N2` / `N3` / `N4` _(deve ser > nivel_entrada)_ |
| `titulo` | _título interno (≤ 120 chars). Não é título de vídeo/podcast — só interno._ |
| `finalidade` | _o que esse módulo precisa permitir que a IA ensine. ≤ 400 chars._ |
| `contexto_pedagogico` | _opcional. Ex.: `educacao-infantil`, `fundamental-1`, `equipe-comercial`, `transversal`._ |
| `tags` | _opcional, multi. Ex.: `acolhimento`, `escuta-ativa`, `conversa-dificil`._ |
| `preferido` | `false` _(default; admin Vertho marca como `true` se quiser que este variante seja o padrão pra esta transição)_ |
| `status` | `rascunho` _(começa sempre como rascunho)_ |
| `versao` | `1` |
| `substitui_modulo_id` | _opcional — preencher se for nova versão de um módulo anterior_ |

---

## Bloco 1 — Conteúdo central

> Ancora o que a IA **não pode perder** ao gerar conteúdo. Vira `system prompt` do gerador.

### 1.1 Ideia principal
> _3-5 linhas (~300-500 chars). Markdown. Resuma o conceito essencial que nunca pode ser perdido na geração personalizada._

```
[ideia principal aqui]
```

### 1.2 Explicação expandida
> _400-1200 palavras. Markdown. Desenvolva o tema com substância suficiente pra IA conseguir gerar consistentemente vídeo curto, texto, podcast e outros formatos. Inclua: fundamentos, nuances, relações com o cotidiano de trabalho, diferenças entre execução superficial e madura, pontos que costumam gerar confusão, consequências práticas de aplicação mal feita._

```
[explicação expandida aqui]
```

### 1.3 Princípios do tema
> _5 a 8 princípios. Cada princípio orienta o que a IA deve preservar ao gerar qualquer formato._

#### Princípio 1
- **Nome**: _≤ 60 chars. Ex.: "Acolhimento antes de explicação"_
- **Explicação**: _1-2 frases sobre o que esse princípio significa_
- **Implicação prática**: _1 frase aplicada ao trabalho real_

#### Princípio 2
- **Nome**:
- **Explicação**:
- **Implicação prática**:

#### Princípio 3
- **Nome**:
- **Explicação**:
- **Implicação prática**:

#### Princípio 4
- **Nome**:
- **Explicação**:
- **Implicação prática**:

#### Princípio 5
- **Nome**:
- **Explicação**:
- **Implicação prática**:

> _(opcionais: princípios 6, 7, 8 — duplique o bloco acima se precisar)_

### 1.4 Síntese executiva
> _5-8 linhas (~400-600 chars). Markdown. Explique em alto nível o que esse módulo ensina e qual transformação ele pretende apoiar._

```
[síntese executiva aqui]
```

---

## Bloco 2 — Conteúdo aplicável

> Matéria-prima reutilizável. Vai no `user prompt` do gerador, filtrada por contexto e cargo.
>
> **Regra**: nada de nomes próprios. Nada de situações ultra-específicas que prendam o exemplo a um único cargo. O ponto é dar repertório que a IA adapta depois.

### 2.1 Situações típicas
> _4 a 6 situações em que esse descritor aparece no dia a dia. Sem cargo específico (a menos que o módulo seja exclusivo de um contexto)._

#### Situação 1
- **Contexto**: _ex.: "família procura a escola dizendo que a criança voltou triste"_
- **Desafio envolvido**:
- **Risco comum**: _o que costuma dar errado_
- **Boa abordagem**: _o caminho de aplicação madura_

#### Situação 2
- **Contexto**:
- **Desafio envolvido**:
- **Risco comum**:
- **Boa abordagem**:

#### Situação 3
- **Contexto**:
- **Desafio envolvido**:
- **Risco comum**:
- **Boa abordagem**:

#### Situação 4
- **Contexto**:
- **Desafio envolvido**:
- **Risco comum**:
- **Boa abordagem**:

> _(opcionais: situações 5 e 6)_

### 2.2 Exemplos universais
> _Exemplos genéricos que a IA adapta depois pra diferentes cargos/contextos. Sem nomes reais. Sem situações específicas demais._

- **Simples**: _exemplo de aplicação básica, com 1 elemento do tema_
- **Intermediário**: _exemplo com 2-3 elementos combinados_
- **Complexo**: _exemplo com várias variáveis, decisão difícil_
- **Aplicação inadequada**: _exemplo do que a pessoa faz no nível de entrada (errado típico)_
- **Aplicação adequada**: _o mesmo cenário do "inadequada", agora bem aplicado (nível de destino)_

### 2.3 Erros comuns
> _4 a 8 erros que pessoas no nível de entrada costumam cometer._

#### Erro 1
- **Descrição**:
- **Por que acontece**:
- **Impacto negativo**:
- **Como corrigir**:

#### Erro 2
- **Descrição**:
- **Por que acontece**:
- **Impacto negativo**:
- **Como corrigir**:

#### Erro 3
- **Descrição**:
- **Por que acontece**:
- **Impacto negativo**:
- **Como corrigir**:

#### Erro 4
- **Descrição**:
- **Por que acontece**:
- **Impacto negativo**:
- **Como corrigir**:

> _(opcionais: erros 5-8)_

### 2.4 Repertório de linguagem
> _Frases e perguntas adaptáveis pela IA. Quando o contexto for educacional, use linguagem adequada pra escolas, educadores, famílias, alunos e equipes pedagógicas._

- **Frases úteis**:
  - _"..."_
  - _"..."_
  - _"..."_
- **Perguntas poderosas** _(que provocam reflexão)_:
  - _"..."_
  - _"..."_
  - _"..."_
- **Abertura** _(como começar uma conversa sobre o tema)_:
  - _"..."_
  - _"..."_
- **Condução de situação difícil** _(quando a conversa esquenta ou trava)_:
  - _"..."_
  - _"..."_
- **Fechamento com compromisso** _(garantir próximo passo claro)_:
  - _"..."_
  - _"..."_
- **Frases a evitar**:
  - _"..."_ — _por que evitar_
  - _"..."_ — _por que evitar_

### 2.5 Boas práticas
> _4 a 8 boas práticas aplicáveis ao desenvolvimento desse descritor._

#### Boa prática 1
- **O que fazer**:
- **Por que fazer**:
- **Como aplicar**:
- **Evidência de boa aplicação** _(o que indica que foi bem feito)_:

#### Boa prática 2
- **O que fazer**:
- **Por que fazer**:
- **Como aplicar**:
- **Evidência de boa aplicação**:

#### Boa prática 3
- **O que fazer**:
- **Por que fazer**:
- **Como aplicar**:
- **Evidência de boa aplicação**:

#### Boa prática 4
- **O que fazer**:
- **Por que fazer**:
- **Como aplicar**:
- **Evidência de boa aplicação**:

> _(opcionais: boas práticas 5-8)_

---

## Bloco 3 — Guarda-corpos pra IA

> Define o que é negociável e o que é intocável. Anexado ao `system prompt` de qualquer formato gerado a partir deste módulo.

### 3.1 A IA deve preservar
> _Conceitos, limites e princípios que NÃO podem ser alterados na geração. 3 a 6 itens._

- _ex.: "o equilíbrio entre acolhimento, fato observável e encaminhamento"_
- _ex.: "a centralidade da escuta ativa antes de qualquer proposta"_
- _..._

### 3.2 A IA deve evitar
> _Anti-padrões. Viram "Nunca..." no prompt. 3 a 6 itens._

- _ex.: "tom de defesa institucional"_
- _ex.: "linguagem técnica desnecessária com famílias"_
- _ex.: "promessa de resultado sem corresponsabilização"_
- _..._

### 3.3 Pode adaptar livremente
> _Dimensões que a IA pode/deve adaptar conforme o colab e o tenant._

- cargo
- contexto institucional
- formato (texto, vídeo, podcast)
- tom (formal, próximo, etc.)
- exemplos concretos
- _adicionar outros se fizer sentido pra esse módulo_

### 3.4 NÃO pode adaptar
> _Dimensões intocáveis._

- conceito central (Bloco 1.1)
- profundidade pedagógica
- princípios (Bloco 1.3)
- limites éticos
- _adicionar outros se fizer sentido_

### 3.5 Cuidados éticos
> _Cuidados específicos pra esse tema. Ex.: não fazer diagnóstico psicológico; não substituir profissional especializado; não atribuir intenção._

- _..._
- _..._

### 3.6 Cuidados de linguagem
> _Cuidados de tom e escolha de palavra. Ex.: não usar DISC como rótulo determinista; não generalizar "todas as famílias"; preferir descrição a julgamento._

- _..._
- _..._

---

## Bloco 4 — Adaptação por formato

> Orientação específica de **como esse módulo deve ser usado** em cada formato. Por hora, 3 formatos têm adaptador específico. Outros formatos (case, desafio, simulação, perguntas socráticas, missão prática, checklist) consomem os Blocos 1+2+3 sem orientação específica.

### 4.1 Texto de apoio
> _Estrutura sugerida, profundidade, comprimento. Ex.: "abrir com a ideia central em 2 parágrafos, depois 3 exemplos universais adaptados ao contexto, fechar com 3 perguntas de reflexão. 800-1200 palavras."_

```
[orientação para texto de apoio aqui]
```

### 4.2 Roteiro de podcast
> _Abertura, narrativa, ganchos, fechamento. Tom conversacional. Ex.: "abrir com gancho narrativo (uma situação típica em 30s), explicar princípio central em 2 min com voz coloquial, trazer 1 exemplo desenvolvido em 3 min, fechar com pergunta pra ouvinte. 5-7 min total."_

```
[orientação para roteiro de podcast aqui]
```

### 4.3 Roteiro de vídeo
> _Estrutura cena-a-cena, abertura, recursos visuais. Ex.: "Cena 1 (10s): gancho. Cena 2 (40s): conceito central com texto na tela. Cena 3 (1min30): exemplo dramatizado. Cena 4 (30s): fechamento com chamada pra ação. 2-3 min total."_

```
[orientação para roteiro de vídeo aqui]
```

---

## Checklist de revisão antes de publicar

Antes de mover de `rascunho` → `revisao`, confira:

- [ ] Cabeçalho completo (competência, descritor, níveis, locale, contexto pedagógico).
- [ ] `nivel_destino > nivel_entrada`.
- [ ] **Bloco 1**: ideia principal cabe em 3-5 linhas e sintetiza o conceito sem perder substância.
- [ ] **Bloco 1**: explicação expandida tem entre 400-1200 palavras e dá matéria-prima pra IA gerar consistentemente.
- [ ] **Bloco 1**: pelo menos 5 princípios, cada um com nome, explicação e implicação prática.
- [ ] **Bloco 1**: síntese executiva entre 5-8 linhas.
- [ ] **Bloco 2**: pelo menos 4 situações típicas (sem cargo específico, salvo se módulo for exclusivo).
- [ ] **Bloco 2**: 5 exemplos universais (simples, intermediário, complexo, inadequado, adequado) sem nomes próprios.
- [ ] **Bloco 2**: pelo menos 4 erros comuns com causa, impacto, correção.
- [ ] **Bloco 2**: repertório de linguagem nas 6 categorias (úteis, perguntas, abertura, condução, fechamento, evitar).
- [ ] **Bloco 2**: pelo menos 4 boas práticas com o quê / por quê / como / evidência.
- [ ] **Bloco 3**: listas de preservar/evitar/pode adaptar/não pode adaptar preenchidas.
- [ ] **Bloco 3**: cuidados éticos e de linguagem específicos do tema.
- [ ] **Bloco 4**: 3 adaptações por formato (texto, podcast, vídeo).
- [ ] Sem nomes próprios reais, sem dados inventados, sem leis/normas/estatísticas fabricadas.
- [ ] Sem diagnóstico psicológico, sem DISC como determinismo.
- [ ] Não escrito como "aula final pro colaborador" — é base de conhecimento pra IA.
- [ ] Não duplica a régua de maturidade — ênfase em conceito, repertório, exemplos, orientações.

Quando todos os checks passarem, mover pra `revisao` e atribuir a outro admin Vertho pra leitura cruzada.
