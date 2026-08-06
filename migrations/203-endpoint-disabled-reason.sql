-- 203 — por que este endpoint foi desativado.
--
-- Há quatro caminhos que desligam um endpoint, e hoje todos deixam a linha
-- exatamente igual: `enabled = false`, sem rastro do motivo.
--
--   1. reinstalação do PWA (mesmo user-agent, installation_id novo)
--   2. troca de dono (mesma subscription, colaborador diferente)
--   3. inscrição morta (404/410 do provedor)
--   4. a pessoa desativou
--
-- O caso (1) usa uma HEURÍSTICA: "mesmo user-agent = mesmo aparelho". Ela erra
-- num cenário real, ainda que raro — dois iPhones idênticos, mesmo iOS, da mesma
-- pessoa: um desativa o outro. Esse erro é aceitável; o que não é aceitável é
-- ele ser INDISTINGUÍVEL dos outros três. Sem o motivo, "parei de receber push"
-- não tem diagnóstico: ninguém sabe se foi a heurística, o provedor ou a própria
-- pessoa.
--
-- Não se conserta a heurística (não existe impressão digital confiável de
-- aparelho no navegador) — conserta-se a INVESTIGABILIDADE dela.

ALTER TABLE notification_endpoints
  ADD COLUMN IF NOT EXISTS disabled_reason text;

COMMENT ON COLUMN notification_endpoints.disabled_reason IS
  'Por que enabled=false: reinstalacao | troca-de-dono | inscricao-morta | usuario. NULL enquanto ativo. Existe porque os quatro caminhos deixavam a linha idêntica e "parei de receber push" ficava sem diagnóstico.';

CREATE INDEX IF NOT EXISTS idx_notif_endpoints_desativados
  ON notification_endpoints (disabled_reason)
  WHERE disabled_reason IS NOT NULL;

-- Rollback (se precisar):
-- ALTER TABLE notification_endpoints DROP COLUMN IF EXISTS disabled_reason;
