import { isEditableTarget } from './dom';
import type { AnchorRect } from './types';

const HEIGHT = 36;
const GAP = 6;
const MARGIN = 8;
const WIDTH = 150;

interface Props {
  rect: AnchorRect;
  onExplain: () => void;
  onAsk: () => void;
}

export function Toolbar({ rect, onExplain, onAsk }: Props) {
  const fitsBelow = rect.bottom + GAP + HEIGHT + MARGIN <= window.innerHeight;
  const top = fitsBelow ? rect.bottom + GAP : Math.max(MARGIN, rect.top - GAP - HEIGHT);
  const left = Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - WIDTH / 2),
    window.innerWidth - WIDTH - MARGIN,
  );

  return (
    <div
      class="st-toolbar"
      style={{ top: `${top}px`, left: `${left}px` }}
      // Keep the page selection alive: without this, mousedown clears it.
      // (Never blocks editable targets; the toolbar has none, but keep the audit rule.)
      onMouseDown={(e) => {
        if (!isEditableTarget(e)) e.preventDefault();
      }}
    >
      <button type="button" onClick={onExplain}>
        Explain
      </button>
      <button type="button" onClick={onAsk}>
        Ask
      </button>
    </div>
  );
}
