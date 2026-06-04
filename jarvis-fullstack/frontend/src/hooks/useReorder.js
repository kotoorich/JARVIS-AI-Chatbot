import { useState, useRef } from 'react';

/**
 * Headless drag-to-reorder. Works with native HTML5 drag and drop — no
 * library dependency, no touch (mobile fall back to other UX, e.g. up/down
 * buttons).
 *
 * Usage:
 *   const reorder = useReorder(items.map(i => i.id), (nextIds) => {
 *     // persist nextIds (e.g. POST to backend)
 *   });
 *
 *   {items.map(item => (
 *     <div key={item.id} {...reorder.itemProps(item.id)}>
 *       {item.name}
 *     </div>
 *   ))}
 *
 * itemProps returns: { draggable, onDragStart, onDragOver, onDragEnter,
 * onDragEnd, onDrop, 'data-dragging' } — spread onto your row element.
 *
 * If `enabled` is false (e.g. while a save is in flight), draggable is
 * removed.
 */
export default function useReorder(ids, onCommit, { enabled = true } = {}) {
  const [draggingId, setDraggingId] = useState(null);
  const [overId, setOverId] = useState(null);
  // We keep a local copy of the order while a drag is in progress so the UI
  // can preview the new arrangement. Once committed, the parent re-renders
  // with the new server-confirmed order and this resets.
  const localOrder = useRef(null);

  const commit = (nextIds) => {
    localOrder.current = null;
    setDraggingId(null);
    setOverId(null);
    // Only fire if the order actually changed
    if (nextIds.some((id, i) => id !== ids[i])) {
      onCommit(nextIds);
    }
  };

  const itemProps = (id) => {
    if (!enabled) return {};
    return {
      draggable: true,
      onDragStart: (e) => {
        setDraggingId(id);
        // Necessary for Firefox to actually start the drag
        try { e.dataTransfer.setData('text/plain', String(id)); } catch {}
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      },
      onDragEnter: () => {
        if (draggingId !== null && draggingId !== id) setOverId(id);
      },
      onDragLeave: () => {
        // No-op — onDragEnter on the next element will take over
      },
      onDrop: (e) => {
        e.preventDefault();
        if (draggingId === null || draggingId === id) {
          setDraggingId(null); setOverId(null); return;
        }
        const cur = localOrder.current || [...ids];
        const fromIdx = cur.indexOf(draggingId);
        const toIdx = cur.indexOf(id);
        if (fromIdx < 0 || toIdx < 0) {
          setDraggingId(null); setOverId(null); return;
        }
        const next = [...cur];
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, draggingId);
        commit(next);
      },
      onDragEnd: () => {
        setDraggingId(null);
        setOverId(null);
      },
      'data-dragging': draggingId === id ? 'true' : undefined,
      'data-drop-target': overId === id ? 'true' : undefined,
    };
  };

  return { itemProps, draggingId, overId };
}
