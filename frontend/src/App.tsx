import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { engine } from './audio/engine';
import { scheduleStep } from './audio/playback';
import { renderPatternToWav } from './audio/recorder';
import { Scheduler } from './audio/scheduler';
import { triggerVoice, type Chokes } from './audio/voice';
import { ChannelStrip, Plate } from './components/ChannelStrip';
import { ActionSheet, ConfirmDialog, Toolbar, type MenuAction } from './components/Dialogs';
import { Display } from './components/Display';
import { SamplePanel } from './components/SamplePanel';
import { StepButtons } from './components/StepButtons';
import { PatternSection, RunButtons, TempoSection } from './components/Transport';
import { STRIPS, stripById, type Knobs, type StripId, type VoiceId } from './machine/instruments';
import {
  NUM_STEPS,
  editVariation,
  emptyVariation,
  mergeState,
  variationForBar,
  type MachineState,
  type VariationMode,
} from './machine/pattern';
import { hello } from './lib/bridge';
import { followDevServer } from './lib/devServer';
import { exportFile, importJsonText } from './lib/files';
import { clearState, deleteUserSample, loadState, loadUserSamples, saveState, saveUserSample } from './lib/storage';
import { useCompactOnScroll } from './lib/useCompactOnScroll';
import { useMediaQuery } from './lib/useMediaQuery';

const ACTIONS: MenuAction[] = [
  { id: 'export-wav', label: 'EXPORT WAV' },
  { id: 'export-json', label: 'SAVE JSON' },
  { id: 'import-json', label: 'LOAD JSON' },
  { id: 'samples', label: 'SAMPLES' },
  { id: 'reset', label: 'RESET' },
];

/** Keyboard: row A–' plays the instruments, 1–8 and Q–I toggle steps 1–16. */
const LIVE_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];
const STEP_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI'];
const PLAYABLE = STRIPS.filter((s) => s.voices);

/** The sequencer lives outside React, like the audio engine it drives. */
const sched = new Scheduler(() => engine.ensureContext());

const pt = (i: number) => `PT ${String(i + 1).padStart(2, '0')}`;

export default function App() {
  const [state, setState] = useState<MachineState | null>(null);
  // Event handlers and the audio scheduler read the latest state through this ref.
  const stateRef = useRef<MachineState | null>(null);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const phone = useMediaQuery('(max-width: 760px)');
  const [playing, setPlaying] = useState(false);
  const [running, setRunning] = useState(-1);
  const [fine, setFine] = useState(0);
  const [copyArmed, setCopyArmed] = useState(false);
  const [custom, setCustom] = useState(new Map<VoiceId, string>());
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const phoneRoot = useRef<HTMLDivElement>(null);
  const phoneHeader = useRef<HTMLDivElement>(null);
  const header = useCompactOnScroll(phoneHeader, phoneRoot, phone && state !== null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessageText] = useState('');
  const msgTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chokes = useRef<Chokes>({});
  const taps = useRef<number[]>([]);

  /** A transient (2.5 s) or sticky message on the LED display. */
  const message_ = useCallback((text: string, sticky = false) => {
    clearTimeout(msgTimer.current);
    setMessageText(text);
    if (!sticky) msgTimer.current = setTimeout(() => setMessageText(''), 2500);
  }, []);


  /** Applies a change to a copy of the state, renders it and autosaves it. */
  const update = useCallback((fn: (s: MachineState) => void) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      saveState(next);
      return next;
    });
  }, []);

  /* ---------- boot: state, samples, audio unlock ---------- */

  useEffect(() => {
    let alive = true;
    let stopDevWatch = () => {};
    (async () => {
      const [loaded, info] = await Promise.all([loadState(), hello()]);
      if (!alive) return;
      setState(loaded);
      engine.volume = loaded.volume;
      if (info) {
        document.documentElement.dataset.platform = info.platform;
        stopDevWatch = followDevServer(info.devUrl, (msg) => message_(msg, true));
      }
      message_('LOADING SAMPLES…', true);
      const { failed } = await engine.loadFactorySamples((done, total) => {
        if (done % 20 === 0 || done === total) message_(`LOADING ${done}/${total}`, true);
      });
      message_(failed.length > 0 ? `${failed.length} SAMPLES MISSING` : 'READY — PRESS START');
      const saved = await loadUserSamples();
      const names = new Map<VoiceId, string>();
      for (const [voiceId, { name, data }] of saved) {
        try {
          await engine.setUserSample(voiceId, name, data);
          names.set(voiceId, name);
        } catch {
          /* a stored file that no longer decodes: keep the factory sound */
        }
      }
      if (alive) setCustom(names);
    })();
    // Browsers and webviews only let the AudioContext sound after a gesture.
    const wake = () => {
      engine.ensureContext();
      document.removeEventListener('pointerdown', wake);
      document.removeEventListener('keydown', wake);
    };
    document.addEventListener('pointerdown', wake);
    document.addEventListener('keydown', wake);
    return () => {
      alive = false;
      stopDevWatch();
      document.removeEventListener('pointerdown', wake);
      document.removeEventListener('keydown', wake);
    };
  }, [message_]);

  /* ---------- sequencer ---------- */

  useEffect(() => {
    sched.onStep = (globalStep, time) => {
      const s = stateRef.current;
      if (!s || !engine.ctx || !engine.master) return;
      const bar = Math.floor(globalStep / NUM_STEPS);
      scheduleStep(engine.ctx, engine.master.input, engine.buffers, engine.userSamples, s, variationForBar(s.variationMode, bar), globalStep % NUM_STEPS, time, chokes.current);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    sched.tempo = Math.min(305, Math.max(30, state.tempo + fine));
    sched.swing = state.swing;
  }, [state, fine]);

  // The running LED, painted on the audio clock (rAF).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const draw = () => {
      const cur = sched.currentDrawStep();
      if (cur) setRunning(cur.step % NUM_STEPS);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const startStop = useCallback(() => {
    engine.ensureContext();
    if (sched.playing) {
      sched.stop();
      setPlaying(false);
      setRunning(-1);
    } else {
      sched.start();
      setPlaying(true);
    }
  }, []);

  /* ---------- actions ---------- */

  const activeVoice = (s: MachineState, stripId: StripId): VoiceId | undefined => stripById(stripId).voices?.[s.switches[stripId] ?? 0];

  const triggerNow = useCallback((voiceId: VoiceId, knobs: Knobs) => {
    const ctx = engine.ensureContext();
    if (!engine.master) return;
    triggerVoice(ctx, engine.master.input, engine.buffers, engine.userSamples, voiceId, knobs, ctx.currentTime + 0.001, { chokes: chokes.current });
  }, []);

  const selectAndPlay = useCallback(
    (stripId: StripId) => {
      const s = stateRef.current;
      if (!s) return;
      update((n) => {
        n.selected = stripId;
      });
      const voiceId = activeVoice(s, stripId);
      if (voiceId) triggerNow(voiceId, s.knobs[stripId]);
    },
    [update, triggerNow],
  );

  const toggleStep = useCallback(
    (i: number) =>
      update((n) => {
        const row = n.patterns[n.pattern][editVariation(n.variationMode)][n.selected];
        row[i] = row[i] ? 0 : 1;
      }),
    [update],
  );

  const tapTempo = () => {
    const now = performance.now();
    taps.current = taps.current.filter((t) => now - t < 2200);
    taps.current.push(now);
    if (taps.current.length >= 2) {
      const intervals = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      update((n) => {
        n.tempo = Math.min(300, Math.max(30, 60000 / avg));
      });
    }
  };

  const selectPattern = (i: number) => {
    if (!state) return;
    if (copyArmed) {
      update((n) => {
        n.patterns[i] = structuredClone(n.patterns[n.pattern]);
      });
      setCopyArmed(false);
      message_(`COPIED ${pt(state.pattern)} → ${pt(i)}`);
    }
    update((n) => {
      n.pattern = i;
    });
  };

  const loadSampleFile = async (voiceId: VoiceId, file: File) => {
    try {
      const data = await file.arrayBuffer();
      await engine.setUserSample(voiceId, file.name, data);
      await saveUserSample(voiceId, file.name, data);
      setCustom((m) => new Map(m).set(voiceId, file.name));
      message_(`${voiceId}: ${file.name}`);
      triggerNow(voiceId, { level: 0.85 });
    } catch {
      message_(`${file.name}: NOT VALID AUDIO`);
    }
  };

  const resetSample = async (voiceId: VoiceId) => {
    engine.clearUserSample(voiceId);
    await deleteUserSample(voiceId);
    setCustom((m) => {
      const n = new Map(m);
      n.delete(voiceId);
      return n;
    });
  };

  const onAction = async (id: string) => {
    const s = stateRef.current;
    if (!s) return;
    if (id === 'samples') {
      setSamplesOpen((o) => !o);
    } else if (id === 'reset') {
      setConfirmReset(true);
    } else if (id === 'export-wav') {
      message_('RENDERING WAV…', true);
      try {
        const tempo = sched.tempo;
        const blob = await renderPatternToWav(engine, { ...s, tempo });
        const r = await exportFile(blob, `ray808-pt${String(s.pattern + 1).padStart(2, '0')}-${Math.round(tempo)}bpm.wav`);
        message_(r.saved ? 'WAV EXPORTED' : r.cancelled ? 'CANCELLED' : `ERROR: ${r.error ?? ''}`);
      } catch {
        message_('RENDER FAILED');
      }
    } else if (id === 'export-json') {
      const r = await exportFile(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }), 'ray808-patterns.json');
      message_(r.saved ? 'STATE SAVED AS JSON' : r.cancelled ? 'CANCELLED' : `ERROR: ${r.error ?? ''}`);
    } else if (id === 'import-json') {
      const text = await importJsonText();
      if (text === null) return;
      try {
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.patterns)) throw new Error('format');
        const next = mergeState(parsed);
        setState(next);
        saveState(next);
        engine.setVolume(next.volume);
        message_('PATTERNS LOADED');
      } catch {
        message_('INVALID JSON');
      }
    }
  };

  const doReset = async () => {
    setConfirmReset(false);
    await clearState();
    const fresh = mergeState(null);
    setState(fresh);
    saveState(fresh);
    engine.setVolume(fresh.volume);
    setFine(0);
    message_('FACTORY RESET');
  };

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        startStop();
        return;
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if ((document.activeElement as HTMLElement | null)?.closest('.knob')) return;
        const s = stateRef.current;
        if (!s) return;
        const i = STRIPS.findIndex((x) => x.id === s.selected);
        const next = STRIPS[(i + (e.code === 'ArrowRight' ? 1 : -1) + STRIPS.length) % STRIPS.length];
        update((n) => {
          n.selected = next.id;
        });
        return;
      }
      const live = LIVE_KEYS.indexOf(e.code);
      if (live !== -1 && PLAYABLE[live]) {
        selectAndPlay(PLAYABLE[live].id);
        return;
      }
      const step = STEP_KEYS.indexOf(e.code);
      if (step !== -1) toggleStep(step);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [startStop, update, selectAndPlay, toggleStep]);

  /* ---------- render ---------- */

  if (!state) return <div className="boot">RAY-808</div>;

  const row = state.patterns[state.pattern][editVariation(state.variationMode)][state.selected];
  const selectedStrip = stripById(state.selected);
  const effectiveTempo = Math.min(305, Math.max(30, state.tempo + fine));
  const stripProps = (id: StripId) => {
    const strip = stripById(id);
    const voice = activeVoice(state, id);
    return {
      strip,
      knobs: state.knobs[id],
      switchValue: state.switches[id] ?? 0,
      selected: state.selected === id,
      custom: voice ? custom.has(voice) : false,
      onKnob: (name: string, v: number) =>
        update((n) => {
          n.knobs[id] = { ...n.knobs[id], [name]: v };
        }),
      onSwitch: (v: number) =>
        update((n) => {
          n.switches[id] = v;
        }),
      onSelect: () => selectAndPlay(id),
      onDropSample: (file: File) => {
        if (voice) void loadSampleFile(voice, file);
      },
    };
  };

  const display = <Display tempo={effectiveTempo} pattern={state.pattern} variation={state.variationMode} swing={state.swing} message={message} />;
  const run = <RunButtons playing={playing} onStartStop={startStop} onTap={tapTempo} />;
  const tempo = (
    <TempoSection
      tempo={state.tempo}
      fine={fine}
      swing={state.swing}
      volume={state.volume}
      onTempo={(bpm) =>
        update((n) => {
          n.tempo = bpm;
        })
      }
      onFine={setFine}
      onSwing={(v) =>
        update((n) => {
          n.swing = v;
        })
      }
      onVolume={(v) => {
        engine.setVolume(v);
        update((n) => {
          n.volume = v;
        });
      }}
    />
  );
  const patterns = (
    <PatternSection
      pattern={state.pattern}
      variationMode={state.variationMode}
      copyArmed={copyArmed}
      onVariation={(mode: VariationMode) =>
        update((n) => {
          n.variationMode = mode;
        })
      }
      onPattern={selectPattern}
      onClear={() => {
        update((n) => {
          n.patterns[n.pattern][editVariation(n.variationMode)] = emptyVariation();
        });
        message_(`CLEAR ${pt(state.pattern)} ${editVariation(state.variationMode)}`);
      }}
      onCopy={() => {
        setCopyArmed(true);
        message_('COPY: PICK THE TARGET PATTERN');
      }}
    />
  );
  const steps = <StepButtons row={row} running={playing ? running : -1} onToggle={toggleStep} />;

  const brand = (
    <div className="brand__left">
      <span className="brand__maker">RAY</span>
      <span className="brand__model">
        Rhythm Composer <em>808</em>
      </span>
      <span className="brand__cc">Computer Controlled</span>
    </div>
  );

  const overlays = (
    <>
      <SamplePanel
        open={samplesOpen}
        custom={custom}
        onClose={() => setSamplesOpen(false)}
        onLoadFile={(v, f) => void loadSampleFile(v, f)}
        onReset={(v) => void resetSample(v)}
        onResetAll={async () => {
          for (const v of [...custom.keys()]) await resetSample(v);
          message_('FACTORY BANK RESTORED');
        }}
        onPreview={(voiceId) => {
          const strip = STRIPS.find((s) => s.voices?.includes(voiceId));
          triggerNow(voiceId, strip ? state.knobs[strip.id] : { level: 0.85 });
        }}
      />
      <ActionSheet open={sheetOpen} actions={ACTIONS} onAction={(id) => void onAction(id)} onClose={() => setSheetOpen(false)} />
      <ConfirmDialog
        text={confirmReset ? 'Erase every pattern and setting? (loaded samples are kept)' : null}
        onConfirm={() => void doReset()}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );

  if (phone) {
    return (
      <div className="machine machine--phone" ref={phoneRoot}>
        {/* The header never scrolls: on iOS the first touch on a view that is still
            coasting only stops it, so a START/STOP inside the scrolling page would swallow
            the tap. It floats over <main>, which is the only scrolling element; see
            useCompactOnScroll for how it compacts without moving the content. */}
        <div ref={phoneHeader} className={`phone-header${header.compact ? ' phone-header--compact' : ''}`}>
          <header className="brand">
            {brand}
            <button className="menu-btn" aria-label="Menu" onClick={() => setSheetOpen(true)}>
              ⋯
            </button>
          </header>
          <div className="topbar">
            {display}
            {run}
          </div>
        </div>
        <main className="phone-scroll" onScroll={header.onScroll}>
        <section className="card">
          <div className="section-label">
            STEPS · {selectedStrip.plate} · {pt(state.pattern)} {editVariation(state.variationMode)}
          </div>
          {steps}
        </section>
        <section className="card">
          <div className="section-label">INSTRUMENT</div>
          <div className="chips" role="tablist">
            {STRIPS.map((s) => {
              const voice = activeVoice(state, s.id);
              return (
                <div key={s.id} className={`chip${s.id === state.selected ? ' strip--selected' : ''}`} role="tab" aria-selected={s.id === state.selected}>
                  <Plate strip={s} custom={voice ? custom.has(voice) : false} onSelect={() => selectAndPlay(s.id)} />
                </div>
              );
            })}
          </div>
          <ChannelStrip key={state.selected} layout="focus" {...stripProps(state.selected)} />
        </section>
        <section className="card">
          <div className="section-label">TEMPO · SWING · MASTER</div>
          {tempo}
        </section>
        <section className="card">{patterns}</section>
        </main>
        {overlays}
      </div>
    );
  }

  return (
    <div className="machine">
      <header className="brand">
        {brand}
        <Toolbar actions={ACTIONS} onAction={(id) => void onAction(id)} />
      </header>
      <div className="panel">
        <div className="panel__left">
          {display}
          {tempo}
          {patterns}
          {run}
        </div>
        <div className="panel__strips">
          {STRIPS.map((s) => (
            <ChannelStrip key={s.id} {...stripProps(s.id)} />
          ))}
        </div>
      </div>
      <div className="panel__bottom">{steps}</div>
      {overlays}
    </div>
  );
}
