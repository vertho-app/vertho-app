# Extração de Conteúdo-Base de Vídeos — Spec

> Status: **Fase 1 + 2 entregues** (extração + salvar + complementos). Fase 3 (upload de arquivo, lote, áudio via worker ffmpeg, auditoria dual-IA) pendente.

## Pra que serve

A empresa **já tem vídeos** na plataforma dela. Em vez de gerar vídeo (caro, Veo ~US$36), a Vertho **reaproveita o vídeo da empresa**: extrai um **texto-base** do conteúdo do vídeo e usa esse texto como matéria-prima para gerar os **micro-conteúdos complementares** da jornada (texto, podcast, reflexão).

Resultado: biblioteca de conteúdo **barata e relevante** (material da própria empresa), sem custo de renderização.

## Fluxo

```
URL do vídeo da empresa
  → transcrição/leitura (Gemini multimodal)
  → TEXTO-BASE estruturado + sugestão de competência/descritor
  → revisão humana (admin)
  → micro_conteudos (origem='empresa_video', formato='video', url=link, conteudo_inline=texto-base)
  → "gerar complementos" → micro_conteudos complementares ancorados no texto-base
```

## Transcrição em camadas (automática)

A fonte varia por empresa e nem sempre dá pra saber se há legenda. O sistema tenta na ordem:

1. **YouTube/Vimeo** → o Gemini ingere a **URL nativamente** (transcreve + estrutura, sem baixar nada).
2. **URL direta de mídia** (.mp4 etc.) → baixa os bytes → Gemini multimodal (inline).
3. (Fase 3) **Upload de arquivo / áudio via worker** (ffmpeg + Files API) para fontes sem URL pública.

`GEMINI_VIDEO_MODEL` (default `gemini-3.5-flash`) — modelo multimodal usado.

## Texto-base (não a transcrição crua)

O Gemini devolve JSON estruturado: título, resumo, **texto-base** (markdown: ideia central, conceitos, exemplos, aplicações, para refletir), pontos-chave, duração estimada e **sugestão de competência/descritor**. O texto-base é o que alimenta os geradores (`text-content`, `podcast-script`).

## Armazenamento

Reusa `micro_conteudos`:
- `origem='empresa_video'`, `formato='video'`, `url`=link do vídeo da empresa (não re-hospeda), `conteudo_inline`=texto-base, `competencia`/`descritor`, `titulo`, `descricao`.
- Os complementos são novos `micro_conteudos` (`origem='complemento_video'`) ligados à mesma competência/descritor.

## Riscos

- **Direitos**: só vídeos que a empresa pode usar (confirmação no admin).
- **Custo/limite**: vídeos longos = mais tokens de áudio; serverless tem limite de tempo. Fase 3 move para worker assíncrono.
- **Aderência**: nem todo vídeo mapeia limpo num descritor — sugestão + revisão humana resolvem.
