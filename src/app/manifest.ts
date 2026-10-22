import type { MetadataRoute } from 'next';

// Servido em /manifest.webmanifest. É o que permite "Adicionar à tela de início"
// abrir em tela cheia, com ícone e nome próprios.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Prumo — finanças pessoais',
    short_name: 'Prumo',
    description: 'Saldos, lançamentos e conciliação das suas contas, num só lugar.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ECEFF3',
    theme_color: '#0F1D3A',
    lang: 'pt-BR',
    categories: ['finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Novo lançamento', short_name: 'Novo', url: '/novo' },
      { name: 'A classificar', short_name: 'Revisar', url: '/revisar' },
    ],
  };
}
