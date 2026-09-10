import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * View scale: one viewBox unit is three metres.
 *
 * At city speed the vehicle covers roughly 29 m between reports, so a tick pans
 * the map by about ten units — enough to read as movement, small enough that
 * the whole grid does not fly past.
 */
const METRES_PER_UNIT = 3;

/** Re-anchor once the pan has gone far enough to run out of drawn map. */
const REANCHOR_UNITS = 150;

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Local flat-earth offset in metres from `from` to `to`.
 *
 * Over the few hundred metres between two reports the curvature error is far
 * below a pixel, and this avoids a trigonometric projection on every update.
 */
const offsetMetres = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) => ({
  east: toRad(to.longitude - from.longitude) * EARTH_RADIUS_M * Math.cos(toRad(from.latitude)),
  north: toRad(to.latitude - from.latitude) * EARTH_RADIUS_M,
});

/** Shortest way round the circle, so 350° → 10° turns right by 20°, not left by 340°. */
const shortestTurn = (from: number, to: number): number => {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return from + delta;
};

type Props = {
  latitude: number;
  longitude: number;
  headingDegrees: number;
  isLive: boolean;
  width: number;
  height: number;
  animate?: boolean;
  /** Full-bleed maps square their corners; inset ones round them. */
  rounded?: boolean;
};

/**
 * Simulated dark map.
 *
 * No map SDK and no API key: a procedurally-generated street grid, derived
 * deterministically from the vehicle's coordinates so the same location always
 * draws the same map. This keeps the screen complete and offline-safe.
 *
 * REPLACEABILITY: swapping in react-native-maps or MapLibre means replacing this
 * component only — the props are already the ones a real map view needs.
 */
const MapCanvasComponent = ({
  latitude,
  longitude,
  headingDegrees,
  isLive,
  width,
  height,
  animate = true,
  rounded = true,
}: Props) => {
  const theme = useTheme();
  const pulse = useSharedValue(0);
  const shouldAnimate = animate && isLive && !theme.reduceMotion;

  /**
   * Smooth motion between confirmed positions.
   *
   * The vehicle reports roughly every two seconds. Snapping the marker on each
   * report would look like a stutter, so the map pans between the last two
   * CONFIRMED positions over the interval. Nothing here invents a position:
   * the animation only fills the gap between two reported ones, it never
   * extrapolates past the newest.
   *
   * The interpolation runs on shared values, so it does not re-render this
   * component — let alone the screen — on every frame, and it never writes
   * anything back to the store or the database.
   */
  const [anchor, setAnchor] = useState({ latitude, longitude });
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const heading = useSharedValue(headingDegrees);
  const previous = useRef({ latitude, longitude });

  useEffect(() => {
    const moved = offsetMetres(anchor, { latitude, longitude });
    const targetX = moved.east / METRES_PER_UNIT;
    // Screen y grows downward while north grows upward.
    const targetY = -moved.north / METRES_PER_UNIT;

    // Once the pan has carried the drawn grid too far, re-anchor: the map is
    // regenerated around the new position and the offsets reset to zero. This
    // is why a long journey does not run off the end of the generated streets.
    if (Math.abs(targetX) > REANCHOR_UNITS || Math.abs(targetY) > REANCHOR_UNITS) {
      panX.value = 0;
      panY.value = 0;
      setAnchor({ latitude, longitude });
      previous.current = { latitude, longitude };
      return;
    }

    const jump = theme.reduceMotion || !isLive;
    const duration = 2000;
    panX.value = jump ? targetX : withTiming(targetX, { duration, easing: Easing.linear });
    panY.value = jump ? targetY : withTiming(targetY, { duration, easing: Easing.linear });
    previous.current = { latitude, longitude };
  }, [latitude, longitude, anchor, isLive, theme.reduceMotion, panX, panY]);

  useEffect(() => {
    const target = shortestTurn(heading.value, headingDegrees);
    heading.value = theme.reduceMotion
      ? target
      : withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [headingDegrees, heading, theme.reduceMotion]);

  const panProps = useAnimatedProps(() => ({
    transform: `translate(${-panX.value} ${-panY.value})`,
  }));

  const markerProps = useAnimatedProps(() => ({
    transform: `rotate(${heading.value} 160 160)`,
  }));

  useEffect(() => {
    if (shouldAnimate) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
    return () => cancelAnimation(pulse);
  }, [shouldAnimate, pulse]);

  const pulseProps = useAnimatedProps(() => ({
    r: 18 + pulse.value * 54,
    opacity: (1 - pulse.value) * 0.45,
  }));

  // Deterministic pseudo-random street layout seeded from the coordinates, so
  // the "map" is stable across renders rather than shimmering.
  const streets = useMemo(() => {
    const seed = Math.abs(Math.round((anchor.latitude * 1000 + anchor.longitude * 1000) * 7919));
    const rand = mulberry32(seed);
    // The grid is drawn well beyond the 320-unit viewport because the whole
    // layer pans: at the re-anchor threshold the viewport has travelled 150
    // units, and empty ground at the edge would give the illusion away.
    const verticals = Array.from({ length: 21 }, (_, i) => ({
      x: -300 + i * 46 + rand() * 16,
      major: rand() > 0.66,
    }));
    const horizontals = Array.from({ length: 20 }, (_, i) => ({
      y: -300 + i * 48 + rand() * 16,
      major: rand() > 0.7,
    }));
    const blocks = Array.from({ length: 120 }, () => ({
      x: -300 + rand() * 900,
      y: -300 + rand() * 900,
      w: 16 + rand() * 34,
      h: 14 + rand() * 30,
      o: 0.35 + rand() * 0.4,
    }));
    return { verticals, horizontals, blocks };
  }, [anchor.latitude, anchor.longitude]);

  const markerColor = isLive ? theme.colors.blue : theme.colors.amber;

  return (
    <View
      accessible
      accessibilityLabel={`Map showing the vehicle's ${isLive ? 'live' : 'last known'} location`}
      style={{ width, height, borderRadius: rounded ? theme.radius.lg : 0, overflow: 'hidden' }}
    >
      <Svg width={width} height={height} viewBox="0 0 320 320">
        <Rect x={0} y={0} width={320} height={320} fill="#14161A" />

        {/* The panning layer: blocks and streets move, the marker stays put. */}
        <AnimatedG animatedProps={panProps}>
        <G>
          {streets.blocks.map((b, i) => (
            <Rect
              key={i}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={2}
              fill="#1D2126"
              opacity={b.o}
            />
          ))}
        </G>

        {/* Street grid */}
        {streets.verticals.map((v, i) => (
          <Path
            key={`v${i}`}
            d={`M${v.x} -340 L${v.x} 660`}
            stroke={v.major ? '#333A42' : '#252B31'}
            strokeWidth={v.major ? 6 : 3}
          />
        ))}
        {streets.horizontals.map((h, i) => (
          <Path
            key={`h${i}`}
            d={`M-340 ${h.y} L660 ${h.y}`}
            stroke={h.major ? '#333A42' : '#252B31'}
            strokeWidth={h.major ? 6 : 3}
          />
        ))}
        </AnimatedG>

        {/* Accuracy pulse — only for a live fix. A stale fix must not look alive. */}
        {isLive && (
          <AnimatedCircle
            cx={160}
            cy={160}
            fill={theme.colors.blue}
            animatedProps={pulseProps}
          />
        )}
        <Circle cx={160} cy={160} r={30} fill={markerColor} opacity={0.2} />
        <Circle
          cx={160}
          cy={160}
          r={30}
          fill="none"
          stroke={markerColor}
          strokeWidth={1.5}
          opacity={0.5}
        />

        {/* Vehicle marker. Heading eases to the newly reported bearing. */}
        <AnimatedG animatedProps={markerProps}>
          <Path
            d="M160 144 L171 174 L160 167 L149 174 Z"
            fill={markerColor}
            stroke="#14161A"
            strokeWidth={2.5}
          />
        </AnimatedG>

      </Svg>
    </View>
  );
};

/** Small deterministic PRNG so the generated map is stable for a given position. */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const MapCanvas = memo(MapCanvasComponent);
