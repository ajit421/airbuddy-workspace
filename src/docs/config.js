export const docsConfig = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    file: () => import('./getting-started.md?raw'),
  },
  {
    id: 'features',
    title: 'Platform Features',
    file: () => import('./features.md?raw'),
  },
  {
    id: 'company-roadmap',
    title: 'Company Roadmap',
    file: () => import('./company-roadmap.md?raw'),
  },
  {
    id: 'permissions',
    title: 'Permissions',
    file: () => import('./permissions.md?raw'),
  },
  {
    id: 'claude-connector',
    title: 'Connect your Claude',
    file: () => import('./claude-connector.md?raw'),
  },
  {
    id: 'architecture',
    title: 'Architecture',
    file: () => import('./architecture.md?raw'),
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    file: () => import('./api-reference.md?raw'),
  },
  {
    id: 'deployment',
    title: 'Deployment Guide',
    file: () => import('./deployment.md?raw'),
  },
];
