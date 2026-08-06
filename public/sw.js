/* Service worker do Vertho — EXCLUSIVAMENTE para push.
 *
 * ⚠️ NÃO ADICIONE UM HANDLER DE `fetch` AQUI. ⚠️
 *
 * Quem é atingido: o registro acontece SÓ quando a pessoa toca em "Ativar
 * notificações" (`components/notifications/ativar-push.tsx`), botão que só
 * aparece em tenant com a flag ligada. Não é registrado para todo visitante —
 * uma versão anterior deste comentário afirmava isso e estava errada.
 *
 * Ainda assim a regra vale, e por um motivo que sobrevive à correção: uma vez
 * registrado, o worker controla o escopo `/` INTEIRO daquele aparelho, para
 * sempre, inclusive depois de a pessoa desativar as notificações. Um handler de
 * `fetch` passaria a intermediar cada requisição da aplicação — e a primeira
 * estratégia de cache que alguém escrever aqui serviria app shell antigo depois
 * de um deploy, sem erro em lugar nenhum. O sintoma é "o deploy não subiu" e a
 * causa fica invisível por dias.
 *
 * Sem handler de `fetch`, este worker é ESTRUTURALMENTE incapaz de servir
 * conteúdo: ele só sabe reagir a `push` e a `notificationclick`. Essa é a
 * garantia — não a disciplina de quem edita depois.
 *
 * Se um dia o app precisar de offline/cache, isso é uma decisão de produto
 * separada, com seu próprio plano de invalidação. Não é para nascer de um
 * acréscimo casual neste arquivo.
 */

self.addEventListener('install', () => {
  // Assume o controle sem esperar a próxima navegação: sem isto, a primeira
  // inscrição só passa a receber push depois que a pessoa fecha e reabre o app
  // — e isso pareceria "o push não funcionou".
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (e) {
    dados = {};
  }

  const titulo = dados.title || 'Vertho';
  const opcoes = {
    body: dados.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // `data` sobrevive até o clique — é por aqui que a URL de destino e o
    // deliveryId chegam ao handler de notificationclick.
    data: { url: dados.url || '/dashboard', deliveryId: dados.deliveryId || null },
    // Sem tag: duas pílulas diferentes não devem colapsar numa notificação só.
  };

  // O iOS EXIGE que todo push mostre uma notificação visível. Push silencioso
  // faz o Safari revogar a permissão do site depois de algumas ocorrências —
  // ou seja, engolir um payload inválido aqui custaria a inscrição.
  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const dados = event.notification.data || {};
  const url = dados.url || '/dashboard';
  const deliveryId = dados.deliveryId;

  event.waitUntil(
    (async () => {
      // Marca a abertura por POST autenticado (mesma origem, cookies incluídos).
      // Um GET de redirect seria disparado por prefetcher/antivírus/bot de
      // preview e inflaria a métrica com robô. Se este POST falhar, perdemos UMA
      // abertura — o viés é para baixo, que é o lado seguro.
      if (deliveryId) {
        try {
          await fetch('/api/notifications/opened', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deliveryId }),
          });
        } catch (e) {
          // Registrar abertura nunca pode impedir a pessoa de chegar no conteúdo.
        }
      }

      // Reaproveita uma janela já aberta quando ela existe: abrir uma segunda
      // instância do PWA no iOS confunde e perde o estado da sessão.
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const janela of janelas) {
        if ('focus' in janela) {
          await janela.focus();
          if ('navigate' in janela) {
            try {
              await janela.navigate(url);
              return;
            } catch (e) {
              // navigate pode falhar em cross-origin; cai pro openWindow abaixo
            }
          }
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })()
  );
});
