import type { Source } from '../lib/api/claude-client';

/** How many cited sources the popover lists under an answer before a "+N more" control. */
export const MAX_SOURCES_SHOWN = 3;

/** The sources to list, and how many a collapsed "+N more" control still hides. */
export function visibleSources(
  sources: Source[],
  expanded: boolean,
): { shown: Source[]; hidden: number } {
  if (expanded || sources.length <= MAX_SOURCES_SHOWN) return { shown: sources, hidden: 0 };
  return {
    shown: sources.slice(0, MAX_SOURCES_SHOWN),
    hidden: sources.length - MAX_SOURCES_SHOWN,
  };
}

/** Display form of a source URL: its host without a leading "www.". Unparsable input is returned as is. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www./, '') || url;
  } catch {
    return url;
  }
}
