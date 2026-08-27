/**
 * A regra que todo gerador de TAREFA precisa saber: **a evidência é sempre o
 * RELATO da pessoa, falado ou digitado na conversa. Nunca um arquivo.**
 *
 * 🔴 POR QUE (decisão de produto, confirmada no código em 27/08/2026)
 * ──────────────────────────────────────────────────────────────────
 * A tela da semana não tem — e não vai ter — input de arquivo: só `textarea` e
 * microfone. A pessoa pode perfeitamente PRECISAR preencher uma planilha ou
 * mandar um documento no trabalho dela; o que nunca acontece é isso chegar ao
 * app. O que chega é ela contando.
 *
 * Sem esta regra no prompt, o gerador escreve o `criterio_de_execucao` como se
 * alguém fosse INSPECIONAR o artefato. Medido em 27/08, antes desta correção:
 * **14 de 308** tarefas geradas (2 do par, 12 do kit por descritor) traziam
 * critério do tipo *"o documento existe fisicamente (papel ou arquivo)"* — uma
 * verificação que não existe em lugar nenhum do produto.
 *
 * ⚠️ O QUE NÃO É PROBLEMA: a tarefa pedir que a pessoa produza, preencha ou
 * compartilhe algo no trabalho real. Isso é a ação, e é legítima — 78 das 308
 * tarefas citam artefato e estão certas. O que não pode é o CRITÉRIO depender de
 * ver o artefato, porque a única coisa que chega ao avaliador é a fala.
 *
 * Fonte ÚNICA de propósito: os dois geradores (kit por descritor e tarefa do
 * par) precisam dizer a MESMA coisa. Duas cópias divergiriam na primeira vez que
 * alguém ajustasse uma delas — foi assim com todas as réguas desta camada.
 */
export const BLOCO_EVIDENCIA_E_RELATO = `COMO A EXECUÇÃO SERÁ VERIFICADA (isto muda o que você escreve):
- A pessoa vai RELATAR o que fez numa conversa, falando ou digitando. Ela NÃO envia arquivo, foto, planilha nem documento — o produto não recebe anexo, e ninguém vai inspecionar o que ela produziu.
- A ação PODE envolver produzir, preencher ou compartilhar algo no trabalho dela. Isso é normal e desejável. O que não pode é o critério depender de alguém VER esse material.
- Portanto o \`criterio_de_execucao\` descreve **o que a pessoa vai conseguir CONTAR** que distingue quem fez de quem só diz que fez: o que ela decidiu e por quê, o que mudou depois, como alguém reagiu, um número, um nome, uma frase que foi dita.
- PROIBIDO no critério: "o documento existe", "o arquivo está salvo", "anexar", "enviar o registro", "print", "captura de tela" — nada disso é verificável aqui.
- Um bom critério é aquele que uma pessoa que NÃO fez a tarefa não conseguiria responder com detalhe.`;
