import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isModalAboveStickyHeader, Z_MODAL, Z_STICKY_HEADER } from './zIndex.js';
import { MODAL_COMPONENT_PATHS } from './modalOverlayPolicy.js';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('modal z-index policy', () => {
  it('keeps modal layer above sticky headers', () => {
    expect(isModalAboveStickyHeader()).toBe(true);
    expect(Z_MODAL).toBeGreaterThan(Z_STICKY_HEADER);
  });
});

describe('modal overlay usage', () => {
  for (const relativePath of MODAL_COMPONENT_PATHS) {
    it(`uses ModalOverlay in ${relativePath}`, () => {
      const source = readFileSync(join(frontendRoot, relativePath), 'utf8');
      expect(source).toContain('ModalOverlay');
      // Dialog backdrops must not use low z-index layers that sit under sticky headers.
      expect(source).not.toMatch(
        /fixed inset-0 z-(?:40|50|\[(?:40|50|60|70|100|120)\]) flex items-center/
      );
    });
  }
});
