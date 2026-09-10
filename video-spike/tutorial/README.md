# Tutoriais de uso da plataforma — TTS

São vídeos genéricos de instrução, **não** os vídeos curriculares ou nominais do
pipeline. O narrador acompanha `ELENCO.beto` (voz, modelo Vertex, direção e régua).

## Produção local

1. Confira o roteiro em `storyboard.ts`, inclusive datas de campanhas antigas.
2. Configure `TUTORIAL_ENV_FILE`, `TUTORIAL_OUT_DIR` e `TUTORIAL_PUBLIC_DIR` para
   separar credenciais e artefatos do código. Não versione chaves ou mídia gerada.
3. Rode `npx tsx --tsconfig tsconfig.scripts.json video-spike/tutorial/narrate.mts <flow>`.
   Essa etapa envia o roteiro ao Vertex e tem custo de síntese. Gera um take
   **contínuo**, limitado às tentativas do elenco e sem publicar reprovados.
4. No ambiente local que já contém `faster-whisper` e o modelo `large-v3-turbo`,
   rode `python video-spike/tutorial/transcribe.py <arquivo-continuous.mp3>`.
   A transcrição é local, somente do arquivo indicado; não acessa microfone.
5. Rode `npx tsx --tsconfig tsconfig.scripts.json video-spike/tutorial/align.mts <flow>`.
   A etapa verifica texto, limites e hash do take, depois fatia **o mesmo áudio**
   para a montagem. O QA das fatias é o QA do take contínuo de origem, não uma
   medição nova de cada fatia. Nenhum ajuste de pitch ou velocidade é aplicado.
6. Com capturas completas, use `build.mts <flow> <cut>` e a composição Remotion.
   `TUTORIAL_FRAMES_DIR` aponta para os manifestos de captura; opcionalmente
   `TUTORIAL_TIMELINE_DIR` guarda uma timeline por corte sem sobrescrever a ativa.

### Quando faltam capturas antigas

`retime.mts <flow> <cut>` preserva o vídeo Full HD publicado e suas legendas,
ajustando apenas o tempo visual aos limites da nova fala. Requer em
`TUTORIAL_OUT_DIR/originais/<flow>.<cut>.timeline.json` uma timeline original
conferida: GUID, caminho e SHA-256 da mídia, fps, totalFrames, outroFromFrame,
delta entre duração original e timeline, e etapas com id, narration, fromFrame,
durationInFrames, audioSeconds e leadFrames. Ela deve coincidir com o corte e o
roteiro; alterações de texto exigem nova montagem visual, não essa reutilização.

O comando só grava novos arquivos locais em `renders/`. Valida duração e Full HD
e registra origem, QA e hashes em `render.json`. Não faz upload nem troca URLs.

## Publicação

- Conferir fala, legendas e telas da prévia antes de publicar.
- Fazer backup dos GUIDs e criar **novos** vídeos no Bunny; não usar os scripts
  antigos que excluem o vídeo anterior antes do upload.
- Trocar referências somente quando o novo vídeo estiver pronto em 1080p.
- Preservar links já compartilhados e as regras de autenticação/tenant de `/v/`.
- Nunca misturar essa operação com a fila de vídeos personalizados.

O cache legado baseado apenas na existência de `abertura.mp3` não é aceito:
texto, voz/modelo/direção, versão do elenco, QA e integridade do arquivo precisam
corresponder. `--force` cria outro take sem apagar o anterior.
