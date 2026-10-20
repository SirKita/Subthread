// Dev helper for calibrating MESSAGE_SELECTORS in Phase 2.
// PRIVACY RULE: never include text content — only lengths. Attribute values
// (ids, classes, data-*, role, aria-label) are structural identifiers and are
// included, truncated defensively.

export interface AncestorInfo {
  depth: number;
  tag: string;
  id: string;
  classes: string[];
  dataAttrs: Record<string, string>;
  role: string;
  ariaLabel: string;
  childElementCount: number;
  textLength: number;
}

export interface SiblingSample {
  tag: string;
  classes: string[];
  dataAttrs: Record<string, string>;
  textLength: number;
}

export interface SiblingsAtDepth {
  depth: number;
  count: number;
  sample: SiblingSample[];
}

export interface Dump {
  url: string;
  selectionLength: number;
  ancestors: AncestorInfo[];
  siblingsAtEachDepth: SiblingsAtDepth[];
}

const MAX_ATTR_CHARS = 80;
const MAX_SIBLING_SAMPLE = 8;

/**
 * Describe the ancestry of an element (up to and including <body>), structure
 * only. `selectionLength` is set to 0 — the caller overlays the real value,
 * since a pure function of the element cannot know it.
 */
export function describeAncestry(el: Element): Dump {
  const ancestors: AncestorInfo[] = [];
  const siblingsAtEachDepth: SiblingsAtDepth[] = [];
  const body = el.ownerDocument.body;

  let current: Element | null = el;
  let depth = 0;
  while (current) {
    ancestors.push({
      depth,
      tag: current.tagName.toLowerCase(),
      id: current.id,
      classes: Array.from(current.classList),
      dataAttrs: dataAttrsOf(current),
      role: truncate(current.getAttribute('role') ?? ''),
      ariaLabel: truncate(current.getAttribute('aria-label') ?? ''),
      childElementCount: current.childElementCount,
      textLength: (current.textContent ?? '').length,
    });

    const parent: Element | null = current.parentElement;
    if (parent) {
      const children = Array.from(parent.children);
      siblingsAtEachDepth.push({
        depth,
        count: children.length,
        sample: children.slice(0, MAX_SIBLING_SAMPLE).map((sibling) => ({
          tag: sibling.tagName.toLowerCase(),
          classes: Array.from(sibling.classList),
          dataAttrs: dataAttrsOf(sibling),
          textLength: (sibling.textContent ?? '').length,
        })),
      });
    }

    if (current === body) break;
    current = parent;
    depth++;
  }

  return {
    url: el.ownerDocument.defaultView?.location.pathname ?? '',
    selectionLength: 0,
    ancestors,
    siblingsAtEachDepth,
  };
}

function dataAttrsOf(el: Element): Record<string, string> {
  const dataAttrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('data-')) dataAttrs[attr.name] = truncate(attr.value);
  }
  return dataAttrs;
}

function truncate(value: string): string {
  return value.length > MAX_ATTR_CHARS ? value.slice(0, MAX_ATTR_CHARS) + '…' : value;
}
