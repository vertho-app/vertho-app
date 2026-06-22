# Codex Session Notes - Modulos-Base / Extracao

Data: 2026-06-15

## Contexto

Trabalhamos no fluxo de `Módulos-Base de Conteúdo`, especialmente:

- Extração de vídeo/material em `/admin/vertho/modulos-base/extracao-video`
- Estruturação de módulos-base a partir de vídeo, TED e DOCX
- Listagem de módulos-base em `/admin/vertho/modulos-base`

## Commits feitos e enviados

- `78023d5` - Melhora fallback da extração de vídeo
  - Se a extração síncrona de YouTube falhar/demorar, envia automaticamente para background.
  - Mostra erro persistente em vez de toast curto.

- `48c829c` - Normaliza markdown extraido de videos
  - Corrige `\n\n` literal e `\"` no texto-base extraído por Gemini.

- `817c3d4` - Adiciona fallback background para estruturar texto-base
  - Se "Gerar módulo(s)-base" falhar, permite enviar texto-base já extraído para background.

- `3382f24` - Limita contexto pedagogico em modulos extraidos
  - Corrige erro de constraint `modulos_base_conteudo_contexto_pedagogico_check`.
  - `contexto_pedagogico` agora é normalizado como slug curto <= 80 chars.

- `5e55633` - Reduz timeout na estruturacao de materiais longos
  - Para DOCX/material grande:
    - task manda só `extracaoId`, rota interna busca `transcricao` no banco.
    - se conexão do callback cair, task checa banco antes de marcar erro.
    - segmentação paraleliza até 12 janelas.
  - Trigger deploy feito com sucesso: version `20260615.8`.

- `68c6fb4` - Usa Gemini Flash em modulos-base autor
  - `modulo_base_autor` alterado temporariamente de `claude-sonnet-4-6` para `gemini-3.5-flash`.
  - `modulo_base_auditor` continua `gpt-5.4`.
  - Trigger deploy feito com sucesso: version `20260615.9`.

- `c9d262b` - Exibe descritor na lista de modulos-base
  - Adiciona coluna `Descritor` entre `Competência` e `N->N`.

## Deploys / comandos

- `npm run typecheck` passou após as alterações.
- Pushes feitos para `origin/master`.
- Deploy Trigger:
  - Tentativa direta falhou por bug da CLI com caminho Windows contendo espaço (`Vertho%20App`).
  - Workaround usado:
    - criar worktree temporário em `C:\GAS\VerthoAppTriggerDeploy`
    - copiar `.env.local`
    - rodar `npm ci`
    - rodar `npx trigger.dev@4.4.6 deploy . --config trigger.config.ts --env-file .env.local`
    - remover worktree

## Erros diagnosticados

### Vídeo YouTube

Problema inicial:
- Extração rodava e voltava para tela inicial.

Causa:
- fluxo síncrono podia falhar/estourar e a UI só mostrava toast curto.

Correção:
- fallback automático para background + erro persistente.

### Markdown sem formatação

Problema:
- texto-base vinha com `\n\n` literal.

Causa:
- Gemini devolvia escapes duplos no JSON.

Correção:
- `normalizeModelText` em `lib/gemini-video.ts`.

### Estruturação sem gerar módulos

Erro:
- `5 seções, 0 estruturadas`
- constraint `modulos_base_conteudo_contexto_pedagogico_check`

Causa:
- IA colocava frase longa em `contexto_pedagogico`; banco limita a 80 chars.

Correção:
- normalização defensiva em `actions/modulos-base.ts`.

### DOCX grande

Arquivo testado:
- `C:\Users\rdnav\Downloads\LIDERANÇA PEDAGÓGICA (1).docx`
- `mammoth` extraiu 352.783 chars.

Erro real no banco:
- `callback de estruturação falhou (conexão): fetch failed`

Causa:
- task aguardava rota interna longa e conexão caía perto de 5 min.

Correção:
- rota interna busca transcrição pelo `extracaoId`.
- task reduz payload e faz polling de recuperação.
- segmentação mais paralela.

### TED

URL:
- `https://www.ted.com/talks/michael_timms_how_to_claim_your_leadership_power_sep_2024`

Resultado no banco:
- status `done`
- 4 módulos gerados:
  - `21304bac-f0a6-4c6b-ba89-0c013d2f5ac0`
  - `f0149d91-6cc9-46a1-af29-ccafc444a5e9`
  - `47060f10-3117-4323-84da-5792912dfc17`
  - `4e498a95-79c3-4cb2-b42a-02be60363427`

## Modelo atual

- Extração de vídeo para texto-base:
  - `GEMINI_VIDEO_MODEL || gemini-3.5-flash`

- Módulos-base autora/estruturação:
  - `modulo_base_autor = gemini-3.5-flash`

- Módulos-base auditora:
  - `modulo_base_auditor = gpt-5.4`

## Decisões sobre geração de vídeo em massa

Sugestão discutida:

- `InfiniteTalk` self-host:
  - melhor para escala/fábrica de talking-head.
  - mais previsível para aulas em massa.

- `LongCat / LongCat-Video-Avatar`:
  - potencialmente melhor qualidade visual/naturalidade.
  - mais risco operacional para industrializar.

- `HeyGen`:
  - manter para vídeos premium/institucionais/SLA simples.

Resumo:
- InfiniteTalk para volume.
- LongCat para acabamento visual ou cenas.
- HeyGen para premium.

## Pendências / próximos passos sugeridos

- Retestar upload do DOCX `LIDERANÇA PEDAGÓGICA (1).docx` após deploy Vercel + Trigger.
- Verificar na UI se a coluna `Descritor` ficou visualmente boa em telas menores.
- Se Gemini 3.5 Flash gerar módulos com qualidade inferior, reavaliar:
  - voltar `modulo_base_autor` para Claude.
  - ou separar: segmentação em Gemini, estruturação final em Claude.
- Considerar adicionar botão "reprocessar extração" para registros `error` em `extracoes_video`.

