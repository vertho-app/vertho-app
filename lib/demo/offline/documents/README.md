# Relatórios das apresentações offline

PDFs estáticos, exclusivamente dos dados fictícios de `schoolOfflineData()` e
`acmeOfflineData()`. São 18, gerados pelos componentes do produto:

| Ambiente | Arquivos |
| --- | --- |
| `acme-demo` (12) | `pdi`, `gestor`, `rh`, `engajamento`, `evolucao-lucas`, `evolucao-camila`, `evolucao-diego`, `evolucao-thiago`, `ranking-1` a `ranking-4` |
| `escolas-acme` (6) | `pdi`, `gestor`, `rh`, `engajamento`, `ranking-1`, `ranking-2` |

A numeração dos `ranking-N` e os nomes das evoluções vêm do retrato salvo do painel
(`panels-snapshot.json`: `rankings[].pdfPath`, `details[].pdfPath`, `engagementPdfPath`).

## Como regerar (um comando)

Na raiz do app:

```
node scripts/gerar-pdfs-demo-offline.mts
npm run build:demo-offline
```

O primeiro grava os 18 arquivos aqui; o segundo só copia para `public/apresentacao-offline*`
e calcula os hashes. `--output=<pasta>` grava em outra pasta para conferir antes de versionar.

Precisa de internet só para as fontes públicas que os componentes registram. Não usa banco,
credencial nem IA. O código está em `lib/demo/offline/documentos.ts`: PDI, Gestor, RH e
engajamento pelos renderizadores do app (`RelatorioIndividual`, `RelatorioGestor`,
`RelatorioRH`, `RelatorioEngajamento`), a evolução de cada pessoa por
`renderTemporadaConcluidaPDF` e o Ranking de Adequação por `renderRankingAdequacaoPDF`, com o
ranking montado sem banco (`ranking-snapshots.ts`).

Regere quando mudar um renderizador, o elenco, os fixtures ou o retrato salvo. Depois **abra as
páginas** (rasterize e leia: guard de texto não vê página cortada, glifo ausente nem sobreposição)
antes de versionar.

## O que NÃO pode aparecer

O produto mudou entre 02 e 05/10/2026 e estes PDFs ficaram para trás (R-136). Nenhum dos 18 pode
trazer:

- "14 semanas": o programa que roda é a Jornada de 7 semanas.
- "Resumo de Desempenho": o PDI mostra o "Ponto de partida por competência".
- Nota ou média decimal ("2,4 de 4", "Nota 1,78", "média geral de 2,51"). O cliente vê nível
  (1 a 4) e avanço ("+0,3" é permitido).
- "Temporada" (é Jornada), Pulso, Plenária e Dossiê.
- Travessão (intervalo "0–100" é outra coisa).
- Nos `ranking-N`: candidato, elegível, "corte de recomendação", eliminatório, entrevista, vaga,
  psicólogo. O Ranking de Adequação é produto, não o módulo de Seleção.

`tests/unit/demo-offline-pdfs-guard.test.ts` LÊ O TEXTO dos arquivos versionados e falha se algum
traz isso, ou se a pasta não tem exatamente os 18 arquivos que o pacote espera.
`demo-offline-dados-dos-pdfs.test.ts` e `demo-offline-ranking-paridade.test.ts` travam os dados que
entram: PDI de 7 semanas sem decimal nem travessão, relatório do gestor e do RH só com nível, e
ranking igual ao que a tela do pacote mostra.

O build normal só copia estes arquivos e calcula os hashes; não consulta serviços nem requer
credenciais.
