import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  Platform,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { palette } from './tokens';

/**
 * The application surface.
 *
 * On a device the app owns the whole screen. In a desktop browser it must still
 * read as a mobile companion app, so the surface is constrained to phone
 * proportions and centred on a neutral backdrop that is explicitly NOT part of
 * the app.
 *
 * Screens must size themselves from `useViewport()` rather than
 * `useWindowDimensions()`: inside the desktop frame the window is 1440pt wide
 * while the app surface is 390pt, and anything measuring the window would blow
 * its layout out to desktop width — which is exactly the failure this fixes.
 */

export const PHONE_WIDTH = 390;
export const PHONE_MAX_WIDTH = 430;
export const PHONE_HEIGHT = 844;
/** Below this window width the browser is treated as a phone, not a desktop. */
const DESKTOP_BREAKPOINT = 520;

type Viewport = { width: number; height: number; framed: boolean };

const ViewportContext = createContext<Viewport | null>(null);

export const useViewport = (): Viewport => {
  const ctx = useContext(ViewportContext);
  const window = useWindowDimensions();
  // Outside a provider (tests, isolated renders) the window is the surface.
  return ctx ?? { width: window.width, height: window.height, framed: false };
};

export const DeviceFrame = ({ children }: { children: React.ReactNode }) => {
  const window = useWindowDimensions();
  const [box, setBox] = useState({ width: 0, height: 0 });

  const framed = Platform.OS === 'web' && window.width >= DESKTOP_BREAKPOINT;

  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  const value = useMemo<Viewport>(
    () => ({
      width: box.width || (framed ? PHONE_WIDTH : window.width),
      height: box.height || (framed ? PHONE_HEIGHT : window.height),
      framed,
    }),
    [box.width, box.height, framed, window.width, window.height],
  );

  if (!framed) {
    return (
      <ViewportContext.Provider value={value}>
        <View style={{ flex: 1, backgroundColor: palette.base }} onLayout={onLayout}>
          {children}
        </View>
      </ViewportContext.Provider>
    );
  }

  // Shorter windows shrink the surface rather than hiding navigation, and each
  // screen scrolls internally, so primary actions always stay reachable.
  const surfaceWidth = Math.min(PHONE_MAX_WIDTH, Math.max(320, Math.min(PHONE_WIDTH, window.width - 48)));
  const surfaceHeight = Math.min(PHONE_HEIGHT, Math.max(480, window.height - 48));

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.desktopBackdrop,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        onLayout={onLayout}
        style={{
          width: surfaceWidth,
          height: surfaceHeight,
          backgroundColor: palette.base,
          borderRadius: 28,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <ViewportContext.Provider value={value}>{children}</ViewportContext.Provider>
      </View>
    </View>
  );
};
