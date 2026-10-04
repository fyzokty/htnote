#!/usr/bin/env bash
set -euo pipefail

show_help() {
  cat << 'EOF'
Kullanım: bash scripts/build-windows-installers.sh [SEÇENEKLER]

Windows ortamında HTNote için NSIS (.exe) ve WiX (.msi) kurulum paketlerini derler,
çıktıları 'release-artifacts/' dizinine kopyalar ve SHA-256 özetlerini üretir.

Seçenekler:
  --ci, --clean-install    Her koşulda 'npm ci' çalıştırarak temiz bağımlılık kurulumu yapar
                           (varsayılan: yalnızca 'node_modules' mevcut değilse çalıştırılır)
  --nsis-only              Yalnızca NSIS kurulum paketini (.exe) derler
  --msi-only               Yalnızca WiX MSI kurulum paketini (.msi) derler
  -h, --help               Bu yardım metnini görüntüler ve çıkar
EOF
}

# 1. Repo köküne geç (betiğin konumundan bağımsız çalışsın)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Parametreleri ayrıştır
CLEAN_INSTALL=false
BUNDLE_MODE="both"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ci|--clean-install)
      CLEAN_INSTALL=true
      shift
      ;;
    --nsis-only)
      if [[ "${BUNDLE_MODE}" == "msi" ]]; then
        echo "Hata: '--nsis-only' ve '--msi-only' bayrakları birlikte kullanılamaz." >&2
        exit 1
      fi
      BUNDLE_MODE="nsis"
      shift
      ;;
    --msi-only)
      if [[ "${BUNDLE_MODE}" == "nsis" ]]; then
        echo "Hata: '--nsis-only' ve '--msi-only' bayrakları birlikte kullanılamaz." >&2
        exit 1
      fi
      BUNDLE_MODE="msi"
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Hata: Bilinmeyen parametre: $1" >&2
      echo "Yardım için: $0 --help" >&2
      exit 1
      ;;
  esac
done

# 2. Windows ortamı kontrolü (Git Bash / MSYS / Cygwin)
OS_NAME="$(uname -s 2>/dev/null || echo "Unknown")"
case "${OS_NAME}" in
  MINGW*|MSYS*|CYGWIN*)
    ;;
  *)
    echo "Hata: Bu betik yalnızca Windows ortamında (Git Bash / MSYS / Cygwin) çalıştırılabilir." >&2
    echo "Çapraz derleme desteklenmemektedir (algılanan sistem: ${OS_NAME})." >&2
    exit 1
    ;;
esac

# 3. Gerekli araçların kontrolü
for cmd in node npm cargo; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Hata: Gerekli '$cmd' aracı bulunamadı. Lütfen aracın kurulu ve PATH üzerinde tanımlı olduğundan emin olun." >&2
    exit 1
  fi
done

# 4. Bağımlılık kontrolü ve kurulumu
if [ "${CLEAN_INSTALL}" = true ]; then
  echo "==> Bağımlılıklar temiz kuruluyor (npm ci)..."
  npm ci
elif [ ! -d "node_modules" ]; then
  echo "==> 'node_modules' bulunamadı, bağımlılıklar kuruluyor (npm ci)..."
  npm ci
fi

# 5. Sürüm eşitliği kontrolü
echo "==> Sürüm eşitliği doğrulanıyor (npm run version:check)..."
npm run version:check

# 6. CARGO_BUILD_JOBS ayarı (bellek kısıtı)
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-4}"
echo "==> CARGO_BUILD_JOBS: ${CARGO_BUILD_JOBS}"

# 7. Tauri derlemesi
case "${BUNDLE_MODE}" in
  nsis)
    BUNDLES_ARG="nsis"
    ;;
  msi)
    BUNDLES_ARG="msi"
    ;;
  both)
    BUNDLES_ARG="nsis,msi"
    ;;
esac

echo "==> Tauri kurulum paketleri derleniyor (--bundles ${BUNDLES_ARG})..."
npx tauri build --bundles "${BUNDLES_ARG}"

# 8. Üretilen dosyaları bul, kopyala ve SHA-256 hesapla
shopt -s nullglob
found_files=()
if [[ "${BUNDLE_MODE}" == "nsis" || "${BUNDLE_MODE}" == "both" ]]; then
  found_files+=(src-tauri/target/release/bundle/nsis/*.exe)
fi
if [[ "${BUNDLE_MODE}" == "msi" || "${BUNDLE_MODE}" == "both" ]]; then
  found_files+=(src-tauri/target/release/bundle/msi/*.msi)
fi
shopt -u nullglob

if [[ ${#found_files[@]} -eq 0 ]]; then
  echo "Hata: Beklenen kurulum paketi dosyaları bulunamadı." >&2
  exit 1
fi

ARTIFACTS_DIR="${REPO_ROOT}/release-artifacts"
mkdir -p "${ARTIFACTS_DIR}"

# release-artifacts/ klasöründeki eski .exe, .msi ve .sha256 dosyalarını temizle
rm -f "${ARTIFACTS_DIR}"/*.exe "${ARTIFACTS_DIR}"/*.msi "${ARTIFACTS_DIR}"/*.sha256

echo ""
echo "==> Kurulum paketleri 'release-artifacts/' dizinine aktarılıyor:"
for src_path in "${found_files[@]}"; do
  file_name="$(basename "${src_path}")"
  dest_path="${ARTIFACTS_DIR}/${file_name}"
  sha_path="${dest_path}.sha256"

  cp "${src_path}" "${dest_path}"

  if command -v sha256sum >/dev/null 2>&1; then
    (cd "${ARTIFACTS_DIR}" && sha256sum "${file_name}") > "${sha_path}"
    hash_val="$(cut -d' ' -f1 < "${sha_path}")"
  elif command -v certutil.exe >/dev/null 2>&1 || command -v certutil >/dev/null 2>&1; then
    cmd_certutil="$(command -v certutil.exe 2>/dev/null || command -v certutil 2>/dev/null)"
    hash_val="$("${cmd_certutil}" -hashfile "${dest_path}" SHA256 | sed -n '2p' | tr -d '\r\n ')"
    printf "%s  *%s\n" "${hash_val}" "${file_name}" > "${sha_path}"
  else
    echo "Hata: SHA-256 hesaplanamadı ('sha256sum' veya 'certutil' bulunamadı)." >&2
    exit 1
  fi

  file_size="$(wc -c < "${dest_path}" | tr -d ' ')"

  echo "------------------------------------------------------------"
  echo "Dosya:   ${file_name}"
  echo "Boyut:   ${file_size} bayt"
  echo "SHA-256: ${hash_val}"
  echo "Özet:    ${file_name}.sha256"
done
echo "------------------------------------------------------------"
echo "Tüm paketler hazırlandı: ${ARTIFACTS_DIR}"
