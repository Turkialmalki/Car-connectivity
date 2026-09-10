import { create } from 'zustand';

/**
 * Demo Mode: a guided five-minute presenter track.
 * Each step names the screen to visit and the technical point it proves.
 */
export type DemoStep = {
  id: string;
  title: string;
  route: string;
  action: string;
  presenterNote: string;
  proves: string;
};

export const DEMO_STEPS: DemoStep[] = [
  {
    id: 'dashboard',
    title: 'Vehicle dashboard',
    route: '/(tabs)/vehicle',
    action: 'Open the app and let the hero settle.',
    presenterNote:
      'Start here. Point out the connectivity pill and the "updated X ago" timestamp — every connected-car app lives or dies on whether the user can tell fresh data from stale data.',
    proves: 'Vehicle-first UX, live telemetry subscription, freshness signalling.',
  },
  {
    id: 'freshness',
    title: 'State freshness',
    route: '/(tabs)/vehicle',
    action: 'Tap the connectivity pill to expand the state detail.',
    presenterNote:
      'The battery and range values drift in real time from a telemetry simulator, not from a static fixture. The timestamp is authoritative, not cosmetic.',
    proves: 'Telemetry pipeline, cached-vs-live distinction.',
  },
  {
    id: 'unlock',
    title: 'Remote unlock',
    route: '/(tabs)/vehicle',
    action: 'Tap Unlock and complete the biometric prompt.',
    presenterNote:
      'Watch the sheet: securing, verifying permission, contacting vehicle, acknowledged, completed. The lock icon does NOT change until the vehicle confirms. That is the single most important behaviour in the whole app.',
    proves: 'Biometric step-up, async command engine, no optimistic success.',
  },
  {
    id: 'trace',
    title: 'End-to-end trace',
    route: '/developer/trace',
    action: 'Open the trace for the unlock you just ran.',
    presenterNote:
      'Every hop from mobile request to push delivery, with real elapsed timings and a correlation ID. This is what you would hand an SRE during an incident.',
    proves: 'Observability, correlation IDs, architecture literacy.',
  },
  {
    id: 'climate',
    title: 'Climate control',
    route: '/climate',
    action: 'Set the target to 20°C and start climate.',
    presenterNote:
      'The cabin visualisation only animates after the vehicle acknowledges. Cabin temperature then converges toward target on the telemetry tick, and you can see the battery cost.',
    proves: 'Async confirmation gating, physical simulation, energy awareness.',
  },
  {
    id: 'charging',
    title: 'Charging',
    route: '/energy',
    action: 'Try Start Charging while the car is unplugged.',
    presenterNote:
      'It refuses, and it says why. Then switch the scenario to Connected and start again. Preconditions are domain rules, not UI guesses.',
    proves: 'Domain-level preconditions, honest failure.',
  },
  {
    id: 'offline',
    title: 'Offline behaviour',
    route: '/developer/simulation',
    action: 'Switch connectivity to Offline, then attempt a lock.',
    presenterNote:
      'The app shows last-known state, refuses to claim success, and expires the high-risk command rather than leaving it queued forever.',
    proves: 'Failure-mode design, command expiry, safety-sensitive state handling.',
  },
  {
    id: 'restore',
    title: 'Restore connectivity',
    route: '/developer/simulation',
    action: 'Set connectivity back to Online, then retry the failed command.',
    presenterNote:
      'The retry reuses the original idempotency key with a fresh correlation ID — so the command service can tell a retry from a second intent.',
    proves: 'Idempotency, retry semantics.',
  },
  {
    id: 'digital-key',
    title: 'Digital Key',
    route: '/digital-key',
    action: 'Open Digital Key and walk the BLE / UWB / NFC explanation.',
    presenterNote:
      'Explain that this is a LOCAL capability, separate from cloud unlock, and that real key material lives in the Secure Element under a CCC Digital Key implementation — never in JavaScript.',
    proves: 'Phone-as-a-Key architecture, security boundaries, native ownership.',
  },
  {
    id: 'metrics',
    title: 'Fleet metrics',
    route: '/developer/trace',
    action: 'Scroll to the metrics summary.',
    presenterNote:
      'Success rate, P95 latency, timeout rate and vehicle availability, computed from the commands run during this demo. Close by describing what a real deployment would page on.',
    proves: 'Production thinking, SLO awareness.',
  },
];

type DemoState = {
  /**
   * Presenter mode is a DEVELOPER tool. It must be enabled explicitly in
   * Settings before it can run at all — it previously rode above every screen,
   * including sign-in, telling users the dashboard was open while they were
   * still looking at a login form.
   */
  enabled: boolean;
  active: boolean;
  stepIndex: number;
  notesVisible: boolean;
  setEnabled: (value: boolean) => void;
  start: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  toggleNotes: () => void;
};

export const useDemoStore = create<DemoState>((set, get) => ({
  enabled: false,
  active: false,
  stepIndex: 0,
  notesVisible: true,
  setEnabled: (value) => set({ enabled: value, active: value ? get().active : false }),
  // Starting is a no-op unless a developer has turned presenter mode on.
  start: () => set(get().enabled ? { active: true, stepIndex: 0 } : {}),
  stop: () => set({ active: false, stepIndex: 0 }),
  next: () => set({ stepIndex: Math.min(DEMO_STEPS.length - 1, get().stepIndex + 1) }),
  previous: () => set({ stepIndex: Math.max(0, get().stepIndex - 1) }),
  goTo: (index) => set({ stepIndex: index }),
  toggleNotes: () => set({ notesVisible: !get().notesVisible }),
}));
