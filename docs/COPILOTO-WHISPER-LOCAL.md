# Whisper local do Copiloto

O apoio ao vivo usa um sidecar de transcrição na própria máquina. O áudio bruto
não é enviado à aplicação: o navegador entrega PCM ao WebSocket local e somente
os trechos de texto entram na análise do Copiloto.

## Instalação única no Windows

Na raiz do projeto, execute:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\instalar-whisper-local.ps1
```

O instalador:

- copia o sidecar para `%LOCALAPPDATA%\Vertho\Whisper`;
- instala as dependências Python com `uv`;
- registra `vertho-whisper://` apenas para o usuário atual (`HKCU`);
- inicia o Whisper para validar a instalação.

Não há tarefa no login do Windows. Quando o Copiloto detecta a porta `8765`
fechada, o clique em **Iniciar conversa** abre o protocolo local e aguarda o
modelo carregar. Assim que o status ficar pronto, um segundo clique abre o
seletor de compartilhamento de áudio exigido pelo navegador.

O processo encerra sozinho após cinco minutos sem nenhum cliente conectado,
liberando a GPU. Durante uma conversa, a conexão WebSocket impede o desligamento.

## Diagnóstico

Os arquivos ficam em `%LOCALAPPDATA%\Vertho\Whisper\.runtime`:

- `launcher.err.log`: falha ao iniciar o processo;
- `whisper.err.log`: erros do Python/CUDA;
- `whisper.out.log`: carregamento do modelo, conexões e desligamento ocioso;
- `processo.json`: PID e horário do último acionamento.

Após atualizar `tools/copiloto-whisper`, execute novamente o instalador para
sincronizar a cópia local e suas dependências.
