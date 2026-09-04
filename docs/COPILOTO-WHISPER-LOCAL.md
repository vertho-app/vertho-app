# Whisper local do Copiloto

O apoio ao vivo usa um sidecar de transcrição na própria máquina. O áudio bruto
não é enviado à aplicação: o navegador entrega PCM ao WebSocket local e somente
os trechos de texto entram na análise do Copiloto.

> Estado validado em 01/09/2026: extensão `1.0.1`, acionamento sob demanda e
> interface de foco para uso lado a lado com a tela da reunião.

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

## Interface durante a reunião (meia tela)

Ao começar a captura, `/copiloto` entra automaticamente no modo de foco. Não há
um botão separado para ativá-lo: o estado `gravando` é a fonte da mudança. O
layout foi desenhado para uma janela de aproximadamente meia tela e também
validado em larguras de `900 px` e `520 px`.

Durante a conversa permanecem visíveis somente:

- estado do áudio e botão **Encerrar** na barra superior;
- objetivo da hora — ou o compromisso a pedir na fase de fechamento;
- avanço da descoberta e os três marcadores das perguntas essenciais;
- a orientação **Agora**, com no máximo duas perguntas sugeridas;
- alerta ou objeção em aberto, quando existirem;
- as três falas mais recentes e a transcrição parcial em andamento.

Hero, abas, trilha PACE completa, checklist detalhado, justificativas das
perguntas e aviso de privacidade saem da tela enquanto a captura está ativa. Um
problema de áudio continua aparecendo porque exige ação imediata. Ao encerrar a
conversa, a navegação e o formato completo voltam automaticamente, permitindo
salvar o resultado quando uma empresa estiver selecionada.

## Diagnóstico

### Mensagens da página

| Mensagem | O que significa | Ação |
|---|---|---|
| “O complemento ‘Vertho Whisper Local’ não está ativo no Chrome” | A página não encontrou a extensão com o ID esperado. | Abra `chrome://extensions`, confirme que **Vertho Whisper Local 1.0.1** está ativa e use **Recarregar**. |
| “O Chrome encontrou o complemento, mas não conseguiu iniciar o Whisper local” | A extensão respondeu, mas o Chrome não abriu o host nativo. | Execute novamente o instalador em um PowerShell normal do usuário do Windows e recarregue a extensão. |
| “O iniciador local não respondeu” | O host foi chamado, mas o sidecar não ficou disponível na porta `8765` dentro do prazo. | Consulte `native-host.err.log`, `launcher.err.log` e `whisper.err.log`. |
| “Estou ouvindo apenas você” | O microfone chegou, mas o áudio da reunião não. | Depende da superfície escolhida, e a tela agora diz qual é: **janela nunca carrega áudio** no Chrome; **tela inteira** exige marcar *Compartilhar áudio do sistema*; **aba** precisa ser a aba da reunião. |
| “O Whisper local iniciou e parou antes de ficar pronto” | O servidor subiu e morreu ao carregar o modelo. A tela mostra a linha que ele registrou. | Se falar em permissão negada, é antivírus: libere `%LOCALAPPDATA%\Vertho\Whisper` nas exceções. |

## Onde compartilhar o áudio, e o que o cliente vê

A captura do Chrome é **local**: o Copiloto lê o áudio, descarta o vídeo e nada
sai da máquina. Ela é independente do compartilhamento do Teams ou do Meet, que
não sabe que ela existe. O único caso em que alguém enxerga alguma coisa é
quando **você** está apresentando a sua tela na reunião: aí a barra do Chrome
("app.vertho.ai está compartilhando sua tela") entra no que você projeta.

As três superfícies não são equivalentes:

| Escolha | Áudio dos participantes | Observação |
|---|---|---|
| **Aba** (reunião no navegador) | sim, marcando *Compartilhar áudio da guia* | Melhor opção: nada de tela inteira, e o áudio vem limpo da aba. |
| **Tela inteira** | sim, marcando *Compartilhar áudio do sistema* | Necessária quando a reunião roda em aplicativo de desktop. |
| **Janela** | **nunca** | O Chrome não oferece a caixa de áudio para janela; a faixa vem muda. |

`Medido: 04/09/2026` — com a janela do app do Teams compartilhada, o canal do
cliente ficou em zero e só a voz do vendedor foi transcrita. O sintoma não é de
transcrição: o servidor trata os dois canais com o mesmo detector e o mesmo
limiar.

🔑 **Com Teams ou Meet, entrar pelo navegador é o caminho mais simples**: a
reunião vira uma aba, você compartilha só ela com o áudio da guia, e não precisa
da tela inteira nem da barra de compartilhamento à mostra.

O host nativo deve estar registrado para o mesmo usuário do Windows que executa
o Chrome. Esta verificação deve devolver o caminho de
`native-host-manifest.json`:

```powershell
(Get-Item 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\ai.vertho.whisper').GetValue('')
```

Os arquivos ficam em `%LOCALAPPDATA%\Vertho\Whisper\.runtime`:

- `native-host.err.log`: falha na ponte entre o Chrome e o iniciador;
- `launcher.err.log`: falha ao iniciar o processo;
- `whisper.err.log`: erros do Python/CUDA;
- `whisper.out.log`: carregamento do modelo, conexões e desligamento ocioso;
- `processo.json`: PID e horário do último acionamento.

Após atualizar `tools/copiloto-whisper`, execute novamente o instalador e use o
botão **Recarregar** da extensão em `chrome://extensions`.

Não use uma tarefa de inicialização do Windows como contorno. O fluxo suportado
é extensão → host nativo → `launcher.ps1`, somente quando a conversa começa.
