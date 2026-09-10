import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import type { TransientEvent, VehicleState } from '@/domain/entities';
import { useTheme } from '@/theme';
import { Text } from '@/components/design-system';
import { logger } from '@/utils/logger';
import {
  CAMERA_PRESETS,
  HINGES,
  type CameraPreset,
  type LightGroup,
  type VehiclePart,
  type VehiclePose,
  lightsFromState,
  poseFromState,
} from './articulation';
import { createVehicleModel, type VehicleModel } from './model-loader';

/**
 * The vehicle scene.
 *
 * Contract, and the reason this file is structured the way it is:
 *
 *   The renderer CONSUMES state. It never decides that a command succeeded.
 *   `poseFromState` is the only source of a panel's target position, and an
 *   animation reaching its target says nothing about the vehicle — it is a
 *   visual interpolation toward a position the vehicle has already reported.
 *
 * All per-frame work happens inside `useFrame`, mutating three.js objects
 * directly. Nothing here triggers a React render per frame.
 */

/** How fast a panel travels toward its reported position, in units per second. */
const PANEL_SPEED = 1.55;
/** Indicator blink period while hazards are reported on. */
const INDICATOR_PERIOD_MS = 820;

export type VehicleSceneProps = {
  state: VehicleState | null;
  preset: CameraPreset;
  /** Body colour, from the vehicle record. */
  paintHex?: string;
  style?: StyleProp<ViewStyle>;
  /** Pause the render loop when the surface is not being looked at. */
  active?: boolean;
  /**
   * Transient events already shown. The scene reports back through
   * `onEventPresented` so a flash is never replayed on remount.
   */
  presentedEventIds: ReadonlySet<string>;
  onEventPresented?: (event: TransientEvent) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  /** Rendered while the model loads, so controls stay usable meanwhile. */
  accessibilityLabel: string;
};

type SceneContentProps = {
  model: VehicleModel;
  poseRef: React.MutableRefObject<VehiclePose>;
  lightsRef: React.MutableRefObject<Record<LightGroup, boolean>>;
  flashRef: React.MutableRefObject<{ until: number } | null>;
  preset: CameraPreset;
  paintHex?: string;
  reducedMotion: boolean;
};

const SceneContent = ({
  model,
  poseRef,
  lightsRef,
  flashRef,
  preset,
  paintHex,
  reducedMotion,
}: SceneContentProps) => {
  const { camera, scene } = useThree();
  // Current interpolated pose, held outside React so frames are allocation-free.
  const current = useRef<VehiclePose>({ ...poseRef.current });
  const cameraTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    scene.add(model.scene);
    return () => {
      scene.remove(model.scene);
    };
  }, [model, scene]);

  useEffect(() => {
    if (!paintHex) return;
    const colour = new THREE.Color(paintHex);
    model.paintMaterials.forEach((material) => material.color.copy(colour));
  }, [model, paintHex]);

  const { width: viewWidth, height: viewHeight } = useThree((s) => s.size);

  /**
   * Camera presets are set imperatively; the car never free-orbits on its own.
   *
   * The preset's field of view is VERTICAL, so on a tall phone-shaped surface
   * the horizontal view shrinks and a 4.75 m car overflows the frame. Each
   * preset therefore states the width it needs to see, and the camera is pushed
   * back until that width fits the actual aspect ratio.
   */
  useEffect(() => {
    const spec = CAMERA_PRESETS[preset];
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = viewHeight > 0 ? viewWidth / viewHeight : 1;

    perspective.fov = spec.fov;
    cameraTarget.current.set(...spec.target);

    const eye = new THREE.Vector3(...spec.position);
    const offset = eye.clone().sub(cameraTarget.current);
    const baseDistance = offset.length();

    if (spec.framedWidth && aspect > 0) {
      const vFov = THREE.MathUtils.degToRad(spec.fov);
      // Distance at which `framedWidth` exactly spans the viewport's width.
      const needed = spec.framedWidth / (2 * Math.tan(vFov / 2) * aspect);
      // Only ever pull back, never push in past the preset's chosen framing.
      const distance = Math.max(baseDistance, needed);
      offset.setLength(distance);
    }

    perspective.position.copy(cameraTarget.current).add(offset);
    perspective.lookAt(cameraTarget.current);
    perspective.updateProjectionMatrix();
  }, [camera, preset, viewWidth, viewHeight]);

  useFrame((_, delta) => {
    const target = poseRef.current;
    const step = reducedMotion ? 1 : Math.min(1, PANEL_SPEED * delta);

    (Object.keys(HINGES) as VehiclePart[]).forEach((part) => {
      const node = model.hinges[part];
      if (!node) return;
      const want = target[part];
      const have = current.current[part];
      const next = have + (want - have) * step;
      // Snap once the remaining travel is imperceptible, so a panel settles
      // exactly at its reported position instead of asymptotically near it.
      current.current[part] = Math.abs(want - next) < 0.0015 ? want : next;
      const spec = HINGES[part];
      const radians = THREE.MathUtils.degToRad(spec.openDegrees) * current.current[part];
      // Written straight onto the single hinge axis. Each panel rotates about
      // exactly one axis, so there is no ordering ambiguity to resolve.
      node.rotation[spec.axis] = radians;
    });

    // --- lighting -------------------------------------------------------
    const now = Date.now();
    const flash = flashRef.current;
    const flashing = flash !== null && now < flash.until;
    if (flash && !flashing) flashRef.current = null;

    const reported = lightsRef.current;
    const blink = reducedMotion ? 1 : Math.sin((now / INDICATOR_PERIOD_MS) * Math.PI * 2) > 0 ? 1 : 0;
    // A flash is bounded and additive: it lights the real head and tail
    // surfaces for its duration and then stops, leaving reported state intact.
    const flashPulse = flashing ? (Math.sin((now / 300) * Math.PI * 2) > 0 ? 1 : 0.12) : 0;

    const intensity: Record<LightGroup, number> = {
      headlights: Math.max(reported.headlights ? 2.4 : 0, flashPulse * 3.1),
      daytimeRunning: Math.max(reported.daytimeRunning ? 1.5 : 0, flashPulse * 2.2),
      taillights: Math.max(reported.taillights ? 1.15 : 0, flashPulse * 2.0),
      indicators: reported.indicators ? blink * 2.6 : 0,
    };

    (Object.keys(intensity) as LightGroup[]).forEach((group) => {
      const value = intensity[group];
      model.lightMaterials[group].forEach((material) => {
        if (material.emissiveIntensity === value) return;
        material.emissiveIntensity = value;
        if (value > 0 && material.emissive.getHex() === 0x000000) {
          material.emissive.setHex(LIGHT_EMISSIVE[group]);
        }
      });
    });
  });

  return (
    <>
      {/* A restrained studio rig: one key, one fill, one rim. No post-processing
          — it costs a full-screen pass per frame and buys very little here. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[4.5, 7.5, 5]} intensity={1.85} />
      <directionalLight position={[-5.5, 3.5, -4]} intensity={0.7} color={0x9fb4d8} />
      <hemisphereLight args={[0xdfe7f5, 0x0b0d10, 0.65]} />
    </>
  );
};

const LIGHT_EMISSIVE: Record<LightGroup, number> = {
  headlights: 0xdfe9ff,
  daytimeRunning: 0xcfe0ff,
  taillights: 0xff2d24,
  indicators: 0xff9a1f,
};

const VehicleSceneComponent = ({
  state,
  preset,
  paintHex,
  style,
  active = true,
  presentedEventIds,
  onEventPresented,
  onReady,
  onError,
  accessibilityLabel,
}: VehicleSceneProps) => {
  const theme = useTheme();
  const [model, setModel] = useState<VehicleModel | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const poseRef = useRef<VehiclePose>(poseFromState(state));
  const lightsRef = useRef<Record<LightGroup, boolean>>(lightsFromState(state));
  const flashRef = useRef<{ until: number } | null>(null);

  // Targets are refs, not props passed down, so a telemetry tick updates the
  // scene without re-rendering the React tree that owns the GL surface.
  poseRef.current = useMemo(() => poseFromState(state), [state]);
  lightsRef.current = useMemo(() => lightsFromState(state), [state]);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReducedMotion(value);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let created: VehicleModel | null = null;
    createVehicleModel()
      .then((next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        created = next;
        setModel(next);
        onReady?.();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Vehicle model failed to load';
        logger.warn('Vehicle scene unavailable', { message });
        setFailure(message);
        onError?.(message);
      });
    return () => {
      cancelled = true;
      created?.dispose();
    };
    // Loading is intentionally once-per-mount; callbacks are not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Present a flash exactly once.
   *
   * Keyed on the event id the vehicle reported, so navigating away and back
   * cannot replay it and a duplicate telemetry frame cannot double-trigger it.
   */
  useEffect(() => {
    const events = state?.transientEvents ?? [];
    const flash = events.find((e) => e.kind === 'flash' && !presentedEventIds.has(e.id));
    if (!flash) return;
    flashRef.current = { until: Date.now() + flash.durationMs };
    onEventPresented?.(flash);
  }, [state?.transientEvents, presentedEventIds, onEventPresented]);

  const onContextLost = useCallback(() => {
    logger.warn('GL context lost; vehicle scene will show its fallback');
    setFailure('The 3D view lost its rendering context.');
    onError?.('gl_context_lost');
  }, [onError]);

  if (failure) {
    return (
      <View
        accessible
        accessibilityLabel={`${accessibilityLabel}. ${failure}`}
        style={[
          {
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.charcoal,
          },
          style,
        ]}
      >
        <Text variant="caption" color={theme.colors.textInverseSecondary} align="center">
          {/* Honest, and not a substitute for the real thing: the controls below
              remain fully usable while the visualisation is unavailable. */}
          3D view unavailable. Vehicle controls still work.
        </Text>
      </View>
    );
  }

  return (
    <View style={style} accessible accessibilityLabel={accessibilityLabel}>
      {model && (
        <Canvas
          // Pausing when the surface is not on screen is the single largest
          // battery win available here.
          frameloop={active ? 'always' : 'never'}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          camera={{ position: [...CAMERA_PRESETS[preset].position], fov: CAMERA_PRESETS[preset].fov }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            const canvas = gl.domElement as unknown as {
              addEventListener?: (type: string, handler: () => void) => void;
            };
            canvas.addEventListener?.('webglcontextlost', onContextLost);
          }}
        >
          <SceneContent
            model={model}
            poseRef={poseRef}
            lightsRef={lightsRef}
            flashRef={flashRef}
            preset={preset}
            paintHex={paintHex}
            reducedMotion={reducedMotion}
          />
        </Canvas>
      )}
    </View>
  );
};

export const VehicleScene = memo(VehicleSceneComponent);
