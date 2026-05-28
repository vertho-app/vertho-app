#!/usr/bin/env bash
#
# Provisiona o pipeline de render de vídeo IA da Vertho no Google Cloud:
#   - Artifact Registry + build da imagem (Node + FFmpeg)
#   - Cloud Run Job (vertho-video-render)
#   - Service accounts (job lê segredos; trigger dispara o job a partir da Vercel)
#   - Segredos no Secret Manager (GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY)
#
# Pré-requisitos: `gcloud auth login` num projeto com billing ativo.
# Idempotente: pode rodar de novo com segurança (recria só o que falta).
#
# Uso:
#   1) Preencha as variáveis abaixo (ou exporte-as no shell antes de rodar).
#   2) bash scripts/setup-video-gcp.sh
#   3) No fim, copie GCP_SA_KEY (trigger-key.json) para a Vercel e APAGUE o arquivo.
#
set -euo pipefail

# ─── Configuração (edite ou exporte antes de rodar) ──────────────────────────
PROJECT="${GCP_PROJECT_ID:-vertho-prod}"
REGION="${GCP_REGION:-southamerica-east1}"
REPO="${GCP_REPO:-vertho}"
JOB="${GCP_VIDEO_JOB:-vertho-video-render}"

# URL do Supabase (https://<ref>.supabase.co)
SUPABASE_URL="${SUPABASE_URL:-}"
# Segredos (passe via env; NÃO comite valores aqui)
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
# Opcional: PNG público do logo (overlay abertura/fecho)
LOGO_URL="${LOGO_URL:-}"
# Opcional: modelo Veo (default no código)
VEO_MODEL="${VEO_MODEL:-veo-3.1-lite-generate-preview}"
# ─────────────────────────────────────────────────────────────────────────────

# Diretório do contexto de build (este script vive em nextjs-app/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_CTX="$SCRIPT_DIR/../cloud-run/video-render"
IMG="$REGION-docker.pkg.dev/$PROJECT/$REPO/$JOB:latest"
JOB_SA="vertho-video-job@$PROJECT.iam.gserviceaccount.com"
TRIG_SA="vertho-video-trigger@$PROJECT.iam.gserviceaccount.com"

# ─── Validação ───────────────────────────────────────────────────────────────
fail() { echo "ERRO: $1" >&2; exit 1; }
[ -d "$BUILD_CTX" ] || fail "contexto de build não encontrado: $BUILD_CTX"
[ -n "$SUPABASE_URL" ] || fail "defina SUPABASE_URL (https://<ref>.supabase.co)"
[ -n "$GEMINI_API_KEY" ] || fail "defina GEMINI_API_KEY"
[ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || fail "defina SUPABASE_SERVICE_ROLE_KEY"
command -v gcloud >/dev/null || fail "gcloud não encontrado no PATH"

echo "==> Projeto $PROJECT / região $REGION / job $JOB"
gcloud config set project "$PROJECT" >/dev/null

# ─── 1. APIs ─────────────────────────────────────────────────────────────────
echo "==> Habilitando APIs..."
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com

# ─── 2. Artifact Registry + build ────────────────────────────────────────────
echo "==> Artifact Registry ($REPO)..."
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location="$REGION" \
  --description="Vertho video render" 2>/dev/null || echo "    (repo já existe)"

echo "==> Build da imagem ($IMG)..."
gcloud builds submit --tag "$IMG" "$BUILD_CTX"

# ─── 3. Segredos ─────────────────────────────────────────────────────────────
put_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=-
  fi
}
echo "==> Segredos (Secret Manager)..."
put_secret GEMINI_API_KEY "$GEMINI_API_KEY"
put_secret SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"

# ─── 4. Service account do Job (lê segredos) ─────────────────────────────────
echo "==> Service account do job..."
gcloud iam service-accounts create vertho-video-job \
  --display-name="Vertho video render job" 2>/dev/null || echo "    (já existe)"
for S in GEMINI_API_KEY SUPABASE_SERVICE_ROLE_KEY; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:$JOB_SA" \
    --role=roles/secretmanager.secretAccessor >/dev/null
done

# ─── 5. Cria/atualiza o Cloud Run Job ────────────────────────────────────────
ENV_VARS="SUPABASE_URL=$SUPABASE_URL,VEO_MODEL=$VEO_MODEL"
[ -n "$LOGO_URL" ] && ENV_VARS="$ENV_VARS,LOGO_URL=$LOGO_URL"
SECRETS="GEMINI_API_KEY=GEMINI_API_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest"

if gcloud run jobs describe "$JOB" --region="$REGION" >/dev/null 2>&1; then
  echo "==> Atualizando job existente..."
  gcloud run jobs update "$JOB" --region="$REGION" \
    --image="$IMG" --service-account="$JOB_SA" \
    --memory=4Gi --cpu=2 --task-timeout=3600 --max-retries=1 \
    --set-env-vars="$ENV_VARS" --set-secrets="$SECRETS"
else
  echo "==> Criando job..."
  gcloud run jobs create "$JOB" --region="$REGION" \
    --image="$IMG" --service-account="$JOB_SA" \
    --memory=4Gi --cpu=2 --task-timeout=3600 --max-retries=1 \
    --set-env-vars="$ENV_VARS" --set-secrets="$SECRETS"
fi

# ─── 6. Service account que o APP (Vercel) usa pra disparar o job ─────────────
echo "==> Service account de trigger (app -> job)..."
gcloud iam service-accounts create vertho-video-trigger \
  --display-name="Vertho video trigger" 2>/dev/null || echo "    (já existe)"
gcloud run jobs add-iam-policy-binding "$JOB" --region="$REGION" \
  --member="serviceAccount:$TRIG_SA" --role=roles/run.invoker >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$TRIG_SA" --role=roles/run.developer >/dev/null

KEY_FILE="$SCRIPT_DIR/trigger-key.json"
if [ -f "$KEY_FILE" ]; then
  echo "==> trigger-key.json já existe; pulando geração (apague p/ gerar nova)."
else
  echo "==> Gerando chave da service account de trigger..."
  gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="$TRIG_SA"
fi

# ─── Resumo ──────────────────────────────────────────────────────────────────
cat <<EOF

✅ Pronto. Configure na Vercel (Project Settings → Environment Variables):

   GCP_PROJECT_ID = $PROJECT
   GCP_REGION     = $REGION
   GCP_VIDEO_JOB  = $JOB
   GCP_SA_KEY     = (conteúdo de $KEY_FILE)

⚠️  Depois de colar GCP_SA_KEY na Vercel, APAGUE a chave local:
       rm "$KEY_FILE"

Rodar a migration do banco (se ainda não rodou):
   node --env-file=.env.local scripts/apply-migration.mjs migrations/124-video-render-status.sql

Testar um render manual (sem passar pelo app):
   gcloud run jobs execute $JOB --region=$REGION --update-env-vars=CONTEUDO_ID=<uuid>
EOF
