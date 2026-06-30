/**
 * Feature auto-discovery (additive). Vite globs two roots at build time and
 * collects whatever feature manifests it finds, so a new feature is a
 * self-contained folder - no edit to App.tsx or NavRail.tsx.
 *
 *   frontend/src/features/<name>/feature.tsx   PRODUCT  - ships on release
 *   frontend/src/lab/<name>/feature.tsx        LAB      - gitignored, stays local
 *
 * Each feature.tsx default-exports a FeatureManifest:
 *
 *   export default {
 *     path: '/<name>',
 *     navLabel: '<name>',
 *     group: 'rest',          // 'top' | 'rest' (default 'rest')
 *     component: MyPage,
 *   } satisfies FeatureManifest;
 *
 * The 14 central pages in App.tsx stay centrally registered - this runs
 * ALONGSIDE them. Discovery is additive; it does not replace the core wiring.
 */
import type { ComponentType } from 'react';

export type FeatureManifest = {
  path: string;
  navLabel: string;
  group?: 'top' | 'rest';
  component: ComponentType;
};

// Both globs are string literals (Vite requires that). A missing lab/ dir just
// resolves to an empty object, so this is safe when no Lab features exist.
const mods = {
  ...import.meta.glob('./*/feature.tsx', { eager: true }),
  ...import.meta.glob('../lab/*/feature.tsx', { eager: true }),
} as Record<string, { default: FeatureManifest }>;

export const features: FeatureManifest[] = Object.values(mods).map((m) => m.default);
