# Reparo do pipeline — 10/09/2026

## Invariantes que ficaram

- Não re-renderizar células com erro sem conferir a âncora em `micro_conteudos.modulo_base_id`. Arquivamento é reversível; preserva tentativas e motivo.
- Brief publicado exige módulo-base e matéria-prima canônica. O desafio integrado do par de descritores é preparado pelo kit e pelo cron diário, não apenas no acesso da pessoa.
- A reconciliação nominal é diária, paginada e usa compare-and-set. Falta de worker/configuração é erro explícito. Box desligada/em manutenção conta no teto de provisionamento.
- Produção: `HCLOUD_TOKEN`, `RENDER_SNAPSHOT_ID`, `DATABASE_URL`, `RENDER_SSH_KEY_ID`; `MAX_RENDER_BOXES=1`. O nome informal do token no `.env.local` não é reconhecido pela Vercel.
- TTS: reprovar todas as tentativas impede publicação. Não relaxar `LIMIARES_DERIVA` nem mudar o elenco para limpar um alerta. Canário usa a direção do personagem correspondente à voz.
- `tts_qa_log.publicado` identifica o take escolhido pelo sintetizador, não prova upload, reprodução ou referência atual. `artifact_key` e `synthesis_id` amarram novos eventos. Resoluções históricas exigem evidência, mantendo os logs.
- `render_fingerprint` e `deck_fingerprint` impedem que uma correção de cena deixe os nominais na revisão antiga. A mídia anterior permanece disponível enquanto a substituta é preparada.
- Podcast de job usa o núcleo headless com filtro de tenant, não uma action dependente de cookies. Falha de áudio torna o resultado do job incompleto e explícito.

## Upload não é publicação

Durante a recuperação, vários uploads ficaram em `encoding`, sem duração nem resoluções, embora o HTTP de upload tivesse retornado sucesso. O arquivo local estava íntegro. Trocar a URL nesse momento deixava a pessoa vendo “Processing video”.

O worker agora registra `video_publicacoes` (migração 248). O cron `publicar_videos`, a cada cinco minutos, verifica reprodução na resolução pedida e só então troca a referência, com guarda de revisão no UPDATE. Esperar o Bunny não mantém box ligada e não re-renderiza. Falha e espera prolongada aparecem no health-check. A fila rotaciona para que um encode lento não bloqueie os seguintes.

O módulo `worker-hetzner/publicacao-bunny.mjs` é compartilhado pelo worker e pelo cron: a régua de publicação não diverge entre os dois ambientes. Alterar o worker exige atualizar também a imagem Hetzner e `RENDER_SNAPSHOT_ID` na Vercel e no Trigger.dev.

A imagem com essa proteção é o snapshot `430327052`, disponível e configurado em produção na Vercel e no Trigger.dev, com teto normal de uma box. As quatro boxes desta recuperação foram encerradas após os uploads. Os arquivos locais de recuperação foram copiados para `backups/recovery-pipeline-20260910.tar.xz` e conferidos por SHA-256 antes da limpeza da box: `b8c7dd700a2a00194d6d08af77bb6b5949ea091e0d3367f7158fe15fa232e761`.

## Evidências da manutenção

Backups locais em `backups/` preservam as três tentativas de vídeo e os três briefs arquivados, o fechamento original da conversa, os registros TTS anteriores, nove decks e seus nominais, a auditoria das 121 cenas e as referências de cada upload novo. Nenhum conteúdo original foi apagado.

Foram preparados 53 desafios integrados ausentes e mais cinco kits DISC de Macaé detectados pelo horizonte, com cinco podcasts aprovados de primeira. Treze cenas exigiram correção; a auditoria posterior das 121 cenas encontrou zero reprovações. O canário do Beto, repetido com direção correta, aprovou 167 Hz e distância de timbre de 0,06σ: elenco e limites preservados.

Os runs de diagnóstico usam o banco de produção sem disparar notificações. Presença de VAPID foi conferida pelos metadados da Vercel; não se troca uma credencial de cron apenas para testar. A trilha antiga de `teste-piloto` exige decisão do dono antes de encerrar envios ou produzir conteúdo novo.
