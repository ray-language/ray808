import { useState, type DragEvent } from 'react';
import { VOICE_IDS, VOICES, type VoiceId } from '../machine/instruments';
import { pickFile } from '../lib/files';

interface Props {
  open: boolean;
  custom: Map<VoiceId, string>;
  onClose: () => void;
  onLoadFile: (voiceId: VoiceId, file: File) => void;
  onReset: (voiceId: VoiceId) => void;
  onResetAll: () => void;
  onPreview: (voiceId: VoiceId) => void;
}

/**
 * The sound bank drawer: for each of the 16 voices, the active sample (factory or
 * custom), a button to load an audio file (picker or drag & drop) and one to go back
 * to the factory sound. A side drawer on desktop, a full-screen sheet on a phone.
 */
export function SamplePanel({ open, custom, onClose, onLoadFile, onReset, onResetAll, onPreview }: Props) {
  const [dropOn, setDropOn] = useState<VoiceId | null>(null);

  const load = async (voiceId: VoiceId) => {
    const file = await pickFile('audio/*');
    if (file) onLoadFile(voiceId, file);
  };

  return (
    <aside className={`sample-panel${open ? ' sample-panel--open' : ''}`} aria-hidden={!open}>
      <div className="sample-panel__head">
        <h2>SOUND BANK</h2>
        <button className="mini-btn" onClick={onResetAll}>
          ALL FACTORY
        </button>
        <button className="sample-panel__close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="sample-panel__hint">
        Load a WAV/MP3/OGG per voice (on a computer you can also drop a file on any strip of the panel). Factory bank:
        TR-808 sampled by Michael Fischer (1994), via Dirt-Samples.
      </p>
      <div className="sample-panel__list">
        {VOICE_IDS.map((voiceId) => {
          const name = custom.get(voiceId);
          const onDrop = (e: DragEvent) => {
            e.preventDefault();
            setDropOn(null);
            const file = e.dataTransfer.files?.[0];
            if (file) onLoadFile(voiceId, file);
          };
          return (
            <div
              key={voiceId}
              className={`sample-row${dropOn === voiceId ? ' sample-row--drop' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDropOn(voiceId);
              }}
              onDragLeave={() => setDropOn(null)}
              onDrop={onDrop}
            >
              <button className="sample-row__play" aria-label={`Play ${VOICES[voiceId].name}`} onClick={() => onPreview(voiceId)}>
                ▶
              </button>
              <div className="sample-row__info">
                <span className="sample-row__name">
                  {voiceId} · {VOICES[voiceId].name}
                </span>
                <span className={`sample-row__src${name ? ' sample-row__src--custom' : ''}`}>{name ?? 'factory'}</span>
              </div>
              <button className="mini-btn" onClick={() => void load(voiceId)}>
                LOAD…
              </button>
              {name && (
                <button className="mini-btn" onClick={() => onReset(voiceId)}>
                  FACTORY
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
