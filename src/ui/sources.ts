/** How many cited sources the popover lists under an answer. */
export const MAX_SOURCES_SHOWN = 3;

/** Display form of a source URL: its host without a leading "www.". Unparsable input is returned as is. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}
