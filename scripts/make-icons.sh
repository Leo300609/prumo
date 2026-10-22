#!/usr/bin/env bash
# Gera os PNGs do ícone a partir de public/icon.svg (requer ImageMagick com librsvg).
# Tamanhos: PWA 192/512 (any), 512 maskable (safe zone de 80%), iOS 180 (apple-touch-icon),
# favicon 32. O fundo é sangrado e sem cantos — iOS e Android recortam com a própria máscara.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/icons
SRC=public/icon.svg

render() { convert -background none -density 384 "$SRC" -resize "$1x$1" "$2"; }

render 512 public/icons/icon-512.png
render 192 public/icons/icon-192.png
render 180 public/icons/apple-touch-icon.png
render 32  public/icons/favicon-32.png

# maskable: o desenho cabe no círculo central de 80%; encolhemos para 82% sobre o fundo inteiro
convert -size 512x512 xc:'#0C3338' \
  \( -background none -density 384 "$SRC" -resize 420x420 \) -gravity center -composite \
  public/icons/maskable-512.png

# 1024 sem transparência, para quem quiser publicar numa loja ou usar como "App Store icon"
convert -background '#0C3338' -density 384 "$SRC" -resize 1024x1024 -alpha remove -alpha off public/icons/icon-1024.png

echo "✔ ícones em public/icons"
