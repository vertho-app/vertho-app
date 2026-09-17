-- 259: bucket das mídias que as PESSOAS mandam pelo WhatsApp (imagem, áudio,
-- vídeo, documento).
--
-- POR QUE PRECISA EXISTIR
-- ───────────────────────
-- Até aqui o webhook gravava só o `media id` da Meta, e a thread buscava o
-- arquivo na Meta na hora de mostrar. A Meta APAGA a mídia recebida em poucos
-- dias. Medido em 17/09/2026: das 23 mídias recebidas desde 14/08, 19 davam
-- `400 (#100/33) Object … does not exist`, a mais nova delas com 7 dias e meio;
-- as de 2 dias ou menos ainda baixavam (e foram copiadas no mesmo dia). Na tela
-- isso virava imagem quebrada e áudio 0:00 que não toca, sem nenhum aviso de que
-- o arquivo tinha deixado de existir.
--
-- A cópia é feita no instante em que a mensagem chega (webhook, via `after()`)
-- e, como rede de segurança, na primeira vez que alguém abre a mídia.
--
-- SEPARADO DE `inbox-anexos` (mig 217) DE PROPÓSITO
-- ─────────────────────────────────────────────────
-- Aquele bucket guarda o que a EQUIPE envia e está documentado como cópia
-- descartável (a Meta re-hospeda). Aqui é o oposto: esta cópia é a ÚNICA que
-- sobra. Misturar os dois faria uma limpeza escrita para um apagar o outro.
--
-- ⚠️ SEM `allowed_mime_types`: quem escolhe o tipo é quem MANDA a mensagem
-- (figurinha webp, foto HEIC, planilha, zip…), e um tipo fora da lista seria
-- recusado no upload: o arquivo sumiria de novo, agora por regra nossa. O teto
-- de 100 MB é o maior da Meta (documento).
--
-- RETENÇÃO: sem prazo, igual ao texto das mensagens recebidas, que já fica no
-- banco sem expurgo (decisão do Rodrigo, 17/09/2026). Retenção por LGPD é uma
-- decisão única para texto e mídia, não um job isolado aqui.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('inbox-midia-recebida', 'inbox-midia-recebida', false, 104857600, NULL)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = NULL,
      public = false;
