#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: ejecuta este script dentro del repo git." >&2
  exit 1
fi

echo "== Reautenticacion GitHub (PAT con scopes: repo + workflow) =="
echo
echo "Este script:"
echo "1) Limpia credenciales anteriores de github.com"
echo "2) Carga tu nueva credencial PAT"
echo "3) Verifica acceso remoto"
echo "4) Prueba push --dry-run (incluye validacion de scope workflow)"
echo

read -rp "GitHub username: " GH_USER
if [[ -z "${GH_USER:-}" ]]; then
  echo "Username vacio." >&2
  exit 1
fi

read -rsp "GitHub PAT: " GH_PAT
echo
if [[ -z "${GH_PAT:-}" ]]; then
  echo "PAT vacio." >&2
  exit 1
fi

git remote set-url origin "https://github.com/Nicosm1988/chatbot_whatsapp.git"

# Usa helper store para persistir y evitar prompts en cada push.
git config --global credential.helper store

# Limpia credencial previa de github.com para evitar mezcla de tokens.
printf "protocol=https\nhost=github.com\nusername=%s\n\n" "$GH_USER" | git credential reject || true

# Guarda nueva credencial.
printf "protocol=https\nhost=github.com\nusername=%s\npassword=%s\n\n" "$GH_USER" "$GH_PAT" | git credential approve

echo
echo "Verificando autenticacion contra origin..."
git ls-remote origin >/dev/null
echo "OK: autenticacion remota valida."

echo
echo "Probando push --dry-run a main..."
if git push --dry-run origin main >/dev/null 2>&1; then
  echo "OK: credencial valida y con permisos para push/workflow."
else
  echo "ERROR: el token no pudo hacer dry-run push."
  echo "Asegurate de que el PAT tenga scopes: repo + workflow."
  exit 1
fi

echo
echo "Listo. Ya podes correr: git push origin main"
