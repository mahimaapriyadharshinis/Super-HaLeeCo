import { useState } from 'react';

interface Props {
  initialKey: string;
  onClose: () => void;
  onSave: (key: string) => void;
}

export default function GeminiKeyModal({ initialKey, onClose, onSave }: Props) {
  const [value, setValue] = useState(initialKey);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="pixel-panel add-panel" onClick={(e) => e.stopPropagation()}>
        <div className="add-panel-header">
          <span>YOUR GEMINI KEY</span>
          <button className="pixel-btn close-btn" onClick={onClose}>
            X
          </button>
        </div>

        <div className="ai-disabled-note">
          This demo doesn't ship with a shared Gemini key, so every visitor's AI use doesn't
          drain the same quota. Paste your own free key to enable AI-generated solutions and
          quiz questions — get one at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>
          . It's stored only in this browser (localStorage) and sent only with your own AI
          requests — never saved on the server.
        </div>

        <input
          className="search-input"
          type="password"
          placeholder="AIza..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />

        <div className="action-row">
          <button
            className="pixel-btn accent"
            onClick={() => {
              onSave(value.trim());
              onClose();
            }}
          >
            Save
          </button>
          {initialKey && (
            <button
              className="pixel-btn"
              onClick={() => {
                onSave('');
                onClose();
              }}
            >
              Clear key
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
