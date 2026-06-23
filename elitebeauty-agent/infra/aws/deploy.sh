#!/bin/bash
set -e

# ─── Configuración — editar antes de usar ────────────────────────────────────
AWS_REGION=${AWS_REGION:-"us-east-1"}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE_TAG=${IMAGE_TAG:-"latest"}

echo "🚀 Elite Beauty Agent — Deploy a AWS"
echo "   Región: $AWS_REGION"
echo "   Cuenta: $AWS_ACCOUNT_ID"
echo "   Tag:    $IMAGE_TAG"

# ─── Login a ECR ─────────────────────────────────────────────────────────────
echo "🔑 Autenticando en ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

# ─── Crear repos ECR si no existen ───────────────────────────────────────────
for repo in elitebeauty-backend elitebeauty-wa-bridge elitebeauty-frontend; do
  aws ecr describe-repositories --repository-names "$repo" --region "$AWS_REGION" 2>/dev/null || \
    aws ecr create-repository --repository-name "$repo" --region "$AWS_REGION"
done

# ─── Build y push imágenes ───────────────────────────────────────────────────
echo "🔨 Build backend..."
docker build -t "$ECR_REGISTRY/elitebeauty-backend:$IMAGE_TAG" ./backend
docker push "$ECR_REGISTRY/elitebeauty-backend:$IMAGE_TAG"

echo "🔨 Build WA Bridge..."
docker build -t "$ECR_REGISTRY/elitebeauty-wa-bridge:$IMAGE_TAG" ./backend/wa_bridge
docker push "$ECR_REGISTRY/elitebeauty-wa-bridge:$IMAGE_TAG"

echo "🔨 Build frontend..."
docker build \
  --build-arg VITE_API_URL="" \
  --build-arg VITE_WS_URL="" \
  -t "$ECR_REGISTRY/elitebeauty-frontend:$IMAGE_TAG" ./frontend
docker push "$ECR_REGISTRY/elitebeauty-frontend:$IMAGE_TAG"

# ─── Actualizar servicios ECS ─────────────────────────────────────────────────
CLUSTER=${ECS_CLUSTER:-"elitebeauty-cluster"}

echo "📦 Actualizando servicios ECS en $CLUSTER..."

for service in elitebeauty-backend elitebeauty-wa-bridge elitebeauty-frontend; do
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$service" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    --output table
done

echo ""
echo "✅ Deploy completado. Los servicios se están actualizando."
echo "   Monitorear en: https://console.aws.amazon.com/ecs/home?region=$AWS_REGION#/clusters/$CLUSTER/services"
