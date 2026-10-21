import { useEffect, useRef, useState } from 'preact/hooks';
import type { Mode } from '../lib/api/prompts';
import type { ExtractedContext } from '../lib/context/adapter';
import { claudeAiAdapter } from '../lib/context/claude-ai';
import { isOwnUiEvent } from './dom';
import { Popover } from './Popover';
import { Toolbar } from './Toolbar';
import type { AnchorRect } from './types';
import { snapshotRect } from './types';

const SELECTION_DEBOUNCE_MS = 100;

interface ToolbarState {
  ctx: ExtractedContext;
  rect: AnchorRect;
}

type PopoverState =
  | { id: number; kind: 'selection'; mode: Mode; ctx: ExtractedContext; rect: AnchorRect }
  | { id: number; kind: 'history' };

export function App() {
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    let debounce: number | undefined;

    const showToolbarForSelection = () => {
      const selection = window.getSelection();
      const ctx = selection ? claudeAiAdapter.extract(selection) : null;
      if (!ctx || !selection) {
        setToolbar(null);
        return;
      }
      // Capture context and rect at show time — clicking the toolbar must not re-read them.
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setToolbar(null);
        return;
      }
      setToolbar({ ctx, rect: snapshotRect(rect) });
    };

    const onMouseUp = (event: MouseEvent) => {
      if (isOwnUiEvent(event)) return;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(showToolbarForSelection, SELECTION_DEBOUNCE_MS);
    };

    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) setToolbar(null);
    };

    const onMouseDown = (event: MouseEvent) => {
      if (isOwnUiEvent(event)) return;
      // Click outside: hide the toolbar and close any popover.
      setToolbar(null);
      setPopover(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setToolbar(null);
      setPopover(null);
    };

    // Toolbar-icon click, routed from the background worker.
    const onRuntimeMessage = (raw: unknown): undefined => {
      if ((raw as { type?: string })?.type !== 'open-history') return;
      setToolbar(null);
      setPopover({ id: nextId.current++, kind: 'history' });
      return;
    };

    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    return () => {
      window.clearTimeout(debounce);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    };
  }, []);

  const openPopover = (mode: Mode) => {
    if (!toolbar) return;
    // Only one popover at a time; replacing unmounts the old one, aborting its stream.
    setPopover({
      id: nextId.current++,
      kind: 'selection',
      mode,
      ctx: toolbar.ctx,
      rect: toolbar.rect,
    });
    setToolbar(null); // toolbar hides when the popover opens
  };

  return (
    <>
      {toolbar && !popover && (
        <Toolbar
          rect={toolbar.rect}
          onExplain={() => openPopover('explain')}
          onAsk={() => openPopover('ask')}
        />
      )}
      {popover && popover.kind === 'selection' && (
        <Popover
          key={popover.id}
          mode={popover.mode}
          ctx={popover.ctx}
          rect={popover.rect}
          onClose={() => setPopover(null)}
        />
      )}
      {popover && popover.kind === 'history' && (
        <Popover
          key={popover.id}
          rect={null}
          initialView="history"
          onClose={() => setPopover(null)}
        />
      )}
    </>
  );
}
