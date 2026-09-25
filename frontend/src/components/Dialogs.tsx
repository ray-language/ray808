import { useEffect } from 'react';

export interface MenuAction {
  id: string;
  label: string;
}

/** The toolbar actions: inline buttons on a wide screen, a sheet behind "⋯" on a phone. */
export function Toolbar({ actions, onAction }: { actions: MenuAction[]; onAction: (id: string) => void }) {
  return (
    <nav className="toolbar">
      {actions.map((a) => (
        <button key={a.id} onClick={() => onAction(a.id)}>
          {a.label}
        </button>
      ))}
    </nav>
  );
}

export function ActionSheet({ open, actions, onAction, onClose }: { open: boolean; actions: MenuAction[]; onAction: (id: string) => void; onClose: () => void }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="menu" onClick={(e) => e.stopPropagation()}>
        {actions.map((a) => (
          <button
            key={a.id}
            role="menuitem"
            className="sheet__item"
            onClick={() => {
              onClose();
              onAction(a.id);
            }}
          >
            {a.label}
          </button>
        ))}
        <button className="sheet__item sheet__item--cancel" onClick={onClose}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

/**
 * An in-page confirmation: the mobile webview shells do not implement window.confirm
 * (it would silently answer "no"), so the app asks with its own dialog everywhere.
 */
export function ConfirmDialog({ text, onConfirm, onCancel }: { text: string | null; onConfirm: () => void; onCancel: () => void }) {
  useEscape(text !== null, onCancel);
  if (text === null) return null;
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="confirm" role="alertdialog" aria-label={text} onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="confirm__buttons">
          <button className="mini-btn" onClick={onCancel}>
            CANCEL
          </button>
          <button className="mini-btn mini-btn--danger" onClick={onConfirm}>
            RESET
          </button>
        </div>
      </div>
    </div>
  );
}

function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}
