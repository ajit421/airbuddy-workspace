export const docsConfig = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '🚀',
    file: () => import('./getting-started.md?raw'),
  },
  {
    id: 'features',
    title: 'Platform Features',
    icon: '⚡',
    file: () => import('./features.md?raw'),
  },
  {
    id: 'company-roadmap',
    title: 'Company Roadmap',
    icon: '🗺️',
    file: () => import('./company-roadmap.md?raw'),
  },
  {
    id: 'architecture',
    title: 'Architecture',
    icon: '🏗️',
    file: () => import('./architecture.md?raw'),
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    icon: '📡',
    file: () => import('./api-reference.md?raw'),
  },
  {
    id: 'deployment',
    title: 'Deployment Guide',
    icon: '🚀',
    file: () => import('./deployment.md?raw'),
  },
];
