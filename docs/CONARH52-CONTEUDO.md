# CONARH 52 — Pacote offline de conteúdo (`app/conarh/_data/conteudo.json`)

Nota de proveniência: o que veio de onde. Atualizar quando o caso ou os assets mudarem.

## Caso canônico — "O recado foi dado — e nada mudou" (tema: feedback)

- **Personagens fictícios** (Renata Falcão, gerente de operações; Diego Sampaio, coordenador de expedição). Nenhum dado de cliente real. O registro da conversa, a matriz FBK-D01…D06 e as leituras do motor foram escritos para a feira no padrão do motor real:
  - **Matriz N1–N4** segue o formato dos descritores de `lib/demo/acme-demo-fixture.json` (`n1_gap`/`n2_desenvolvimento`/`n3_meta`/`n4_referencia`).
  - **`leitura_motor`** segue o padrão do `avaliacao_ia` do fixture (nota decimal, evidência literal entre aspas, racional "por que este nível e não outro", `limites_da_evidencia`). A divergência intencional está em FBK-D01 (evento ≠ comportamento) e FBK-D04 (intenção ≠ próximo passo); os outros 4 convergem com um bom gestor.
- **Conversa avaliativa da etapa 2** (05/08/2026): cada régua traz a pessoa avaliada (Renata · Marcelo · Sérgio) e **4 turnos** — pergunta da plataforma, resposta dela, e a leitura da régua (nível, trecho literal, racional). As respostas ficam entre N1 e N2 de propósito: é a lacuna que a etapa 3 transforma em PDI. **A nota não é escrita no JSON** — sai da média dos turnos em `lib/conarh/leitura.ts`, e um guard amarra essa média ao número citado no texto da etapa 3.
- **Porta 3 (PDI)** deriva do descritor mais baixo (FBK-D04, **1,5** — a média dos 4 turnos da conversa) e segue o schema do sprint de `lib/relatorio-individual-prompt.ts` (foco/ação/evidência/ritual/checklist de 3 itens).
- **Porta 4 (espelho)** segue o modelo do Kit Semanal (`docs/KIT-SEMANAL.md`): mesma espinha (competência × descritor × ideia central), kits por DISC (D e S) com exemplo, linguagem, desafio e formato próprios.
- **Porta 5 (painel)** usa as personas do fixture ACME com antes/depois plausível; os valores "antes" de Bruna, Paulo e Mariana partem das notas reais do fixture (ex.: Bruna "Demonstração e prova" 1,0; Paulo "Criação de senso de urgência" 1,5; Mariana "Comunicação com stakeholders" 2,0).

## Personas e mídia (`public/conarh/media/`)

Personas reutilizadas do fixture ACME (`lib/demo/acme-demo-fixture.json` + `acme-demo-extra-artifacts.json`): Bruna Costa (CS, Rep. Comercial), Paulo (ID, Rep. Comercial), Carla (D, Diretor Geral), Ana (I, Rep. Comercial), Mariana Lopes (C, Analista Financeiro — do extra-artifacts).

| Arquivo em `public/conarh/media/` | Origem | Uso |
|---|---|---|
| `pilula-video-demonstracao-prova.mp4` (22,8 MB) | `outputs/vertho-video-spike-v3.mp4` | Bruna · pílula vídeo |
| `pilula-video-urgencia.mp4` (21,7 MB) | `outputs/vertho-video-spike-v2.mp4` | Paulo · pílula vídeo |
| `pilula-video-carla-lideranca.mp4` (10,6 MB) | `outputs/local-1782156459687-perso.mp4` | Carla · pílula vídeo |
| `pilula-video-mariana-jornada.mp4` (26,4 MB) | `outputs/tutorial-jornada.mp4` | Mariana · pílula vídeo |
| `pilula-audio-bruna-metodo.mp3` | `outputs/espansione-secoes/04-metodo-espansione.mp3` | Bruna · pílula áudio |
| `pilula-audio-paulo-abertura.mp3` | `outputs/espansione-secoes/01-abertura.mp3` | Paulo · pílula áudio |
| `pilula-audio-carla-pilares.mp3` | `outputs/espansione-secoes/03-quatro-pilares.mp3` | Carla · pílula áudio |
| `pilula-audio-ana-crescer.mp3` | `outputs/espansione-secoes/02-o-que-e-crescer.mp3` | Ana · pílula áudio |
| `perfil-fator-c.pdf` | `public/Teoria Comportamental/Fator C.pdf` | Bruna · pdf |
| `perfil-fator-i.pdf` | `public/Teoria Comportamental/Fator I.pdf` | Paulo · pdf |
| `perfil-fator-d.pdf` | `public/Teoria Comportamental/Fator D.pdf` | Carla · pdf |
| `perfil-combinacao-disc.pdf` | `public/Teoria Comportamental/Combinação DISC.pdf` | Ana · pdf |
| `perfil-disc-geral.pdf` | `public/Teoria Comportamental/DISC.pdf` | Mariana · pdf |

**Ficou como texto (`tipo: "texto"`, `src: null`)** por falta de asset adequado: a pílula 1 da Ana e a pílula 2 da Mariana. `outputs/tutorial-pdi.mp4` (34 MB) foi descartado por exceder o limite de 30 MB para os tablets.

## Agenda

Dias da feira mantidos (18–20/08/2026, slots 10:00–16:00) + 4º dia `2026-08-25` "Pós-feira · call 20 min" (10:00/11:00/14:00/15:00).
