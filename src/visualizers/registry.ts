import type { VisualizerModule } from './types';
export const registry = [
  {
    id: 'road',
    name: 'Prism Drive',
    label: 'Road',
    subtitle: '光の先へ、走りつづける。',
    color: '#ba99ff',
    secondary: '#83e9ff',
    load: async () => new (await import('./road')).default(),
  },
  {
    id: 'transit',
    name: 'Pulse Transit',
    label: 'Transit',
    subtitle: '未来の低音が、いまを通過する。',
    color: '#8affe0',
    secondary: '#bf9aff',
    load: async () => new (await import('./transit')).default(),
  },
  {
    id: 'rain',
    name: 'Rain Chamber',
    label: 'Rain',
    subtitle: '雨音のない、雨の世界。',
    color: '#8fe3f4',
    secondary: '#d9eef5',
    load: async () => new (await import('./rain')).default(),
  },
  {
    id: 'bloom',
    name: 'Kinetic Bloom',
    label: 'Particles',
    subtitle: '音がほどけて、花ひらく。',
    color: '#ff9e8e',
    secondary: '#c9a6ff',
    load: async () => new (await import('./bloom')).default(),
  },
] satisfies {
  id: string;
  name: string;
  label: string;
  subtitle: string;
  color: string;
  secondary: string;
  load: () => Promise<VisualizerModule>;
}[];
