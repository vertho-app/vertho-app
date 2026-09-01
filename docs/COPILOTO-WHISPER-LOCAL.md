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
- registra um host nativo do Chrome apenas para o usuário atual (`HKCU`);
- prepara a extensão em `%LOCALAPPDATA%\Vertho\Whisper\extension`.

Ele não inicia o modelo. Para validar o carregamento durante a instalação, use o
parâmetro opcional `-Validar`.

Depois, no Chrome:

1. abra `chrome://extensions`;
2. ative **Modo do desenvolvedor**;
3. clique em **Carregar sem compactação** e selecione
   `%LOCALAPPDATA%\Vertho\Whisper\extension`;
4. recarregue `app.vertho.ai`.

Esse carregamento é feito uma única vez. A chave pública embutida no manifesto
mantém o ID da extensão estável: `eigabofjjdigicbphdgdolhelcaiebfo`.

## Funcionamento sob demanda

Não há tarefa, serviço ou processo no login do Windows. Ao clicar em **Iniciar
conversa**, a página envia um pedido à extensão. O Chrome cria o host nativo por
poucos milissegundos; ele aciona `launcher.ps1` e encerra. Só então o modelo é
carregado na porta `8765`.

O Whisper encerra sozinho após cinco minutos sem nenhum cliente conectado,
liberando a GPU. Durante uma conversa, a conexão WebSocket impede o desligamento.

## Diagnóstico

Os arquivos ficam em `%LOCALAPPDATA%\Vertho\Whisper\.runtime`:

- `native-host.err.log`: falha na ponte entre o Chrome e o iniciador;
- `launcher.err.log`: falha ao iniciar o processo;
- `whisper.err.log`: erros do Python/CUDA;
- `whisper.out.log`: carregamento do modelo, conexões e desligamento ocioso;
- `processo.json`: PID e horário do último acionamento.

Após atualizar `tools/copiloto-whisper`, execute novamente o instalador e use o
botão **Recarregar** da extensão em `chrome://extensions`.
