import React, { memo } from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * Original icon set.
 *
 * Drawn from scratch on a 24×24 grid with a consistent 1.6 stroke weight and
 * round caps. No third-party or manufacturer icon assets are used anywhere in
 * this app.
 */
export type IconName =
  | 'lock'
  | 'unlock'
  | 'climate'
  | 'charge'
  | 'trunk'
  | 'flash'
  | 'horn'
  | 'car'
  | 'location'
  | 'user'
  | 'bell'
  | 'key'
  | 'shield'
  | 'chevron'
  | 'chevron-down'
  | 'chevron-up'
  | 'back'
  | 'arrow-right'
  | 'grid'
  | 'minus'
  | 'frunk'
  | 'map'
  | 'check'
  | 'close'
  | 'alert'
  | 'info'
  | 'settings'
  | 'battery'
  | 'signal'
  | 'moon'
  | 'wrench'
  | 'download'
  | 'clock'
  | 'plus'
  | 'trash'
  | 'pause'
  | 'play'
  | 'globe'
  | 'device'
  | 'bluetooth'
  | 'nfc'
  | 'uwb'
  | 'trace'
  | 'temperature'
  | 'fan'
  | 'seat'
  | 'defrost'
  | 'steering'
  | 'navigate'
  | 'refresh';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const IconComponent = ({ name, size = 22, color, strokeWidth = 1.6 }: Props) => {
  const theme = useTheme();
  const stroke = color ?? theme.colors.textPrimary;
  const common: StrokeProps = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderPaths(name, common, stroke)}
    </Svg>
  );
};

/** Shared stroke styling applied to every glyph, so weights stay consistent. */
type StrokeProps = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
};

const renderPaths = (name: IconName, c: StrokeProps, stroke: string) => {
  switch (name) {
    case 'lock':
      return (
        <>
          <Rect x={4.5} y={10.5} width={15} height={9.5} rx={2.6} {...c} />
          <Path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" {...c} />
          <Circle cx={12} cy={15.2} r={1.3} fill={stroke} stroke="none" />
        </>
      );
    case 'unlock':
      return (
        <>
          <Rect x={4.5} y={10.5} width={15} height={9.5} rx={2.6} {...c} />
          <Path d="M8 10.5V7.6a4 4 0 0 1 7.6-1.7" {...c} />
          <Circle cx={12} cy={15.2} r={1.3} fill={stroke} stroke="none" />
        </>
      );
    case 'climate':
      return (
        <>
          <Path d="M12 3.5v17" {...c} />
          <Path d="M4.6 7.8 19.4 16.2" {...c} />
          <Path d="M4.6 16.2 19.4 7.8" {...c} />
          <Circle cx={12} cy={12} r={2.4} {...c} />
        </>
      );
    case 'charge':
      return (
        <>
          <Path d="M13.4 3 6.8 13.2h4.3L10.6 21l6.6-10.2h-4.3z" {...c} />
        </>
      );
    case 'trunk':
      return (
        <>
          <Path d="M3.5 16.5v-2.2a8.5 8.5 0 0 1 17 0v2.2" {...c} />
          <Path d="M3.5 16.5h17" {...c} />
          <Path d="M12 5.8v8.5" {...c} />
        </>
      );
    case 'flash':
      return (
        <>
          <Path d="M7.5 8.5h4.2a5 5 0 0 1 0 7H7.5z" {...c} />
          <Path d="M17 9.6h3M17 12h3.6M17 14.4h3" {...c} />
          <Path d="M7.5 8.5H4.4M7.5 15.5H4.4" {...c} />
        </>
      );
    case 'horn':
      return (
        <>
          <Path d="M4 10v4l4.5 1.6 6 3.2V5.2l-6 3.2z" {...c} />
          <Path d="M17.6 9.2a4.4 4.4 0 0 1 0 5.6" {...c} />
          <Path d="M20 6.8a8 8 0 0 1 0 10.4" {...c} />
        </>
      );
    case 'car':
      return (
        <>
          <Path
            d="M3 14.5h18v3.2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-.9H7v.9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
            {...c}
          />
          <Path d="M4.4 14.5 6 8.6A2.2 2.2 0 0 1 8.1 7h7.8A2.2 2.2 0 0 1 18 8.6l1.6 5.9" {...c} />
          <Circle cx={7.2} cy={14.4} r={0.9} fill={stroke} stroke="none" />
          <Circle cx={16.8} cy={14.4} r={0.9} fill={stroke} stroke="none" />
        </>
      );
    case 'location':
      return (
        <>
          <Path d="M12 21c4-4.4 6-7.6 6-10a6 6 0 1 0-12 0c0 2.4 2 5.6 6 10z" {...c} />
          <Circle cx={12} cy={11} r={2.3} {...c} />
        </>
      );
    case 'navigate':
      return <Path d="M20.5 3.5 3.5 10.8l7 2.7 2.7 7z" {...c} />;
    case 'user':
      return (
        <>
          <Circle cx={12} cy={8.4} r={3.7} {...c} />
          <Path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" {...c} />
        </>
      );
    case 'bell':
      return (
        <>
          <Path d="M6.4 10.4a5.6 5.6 0 1 1 11.2 0c0 4 1.4 5.6 1.4 5.6H5s1.4-1.6 1.4-5.6z" {...c} />
          <Path d="M10.2 19a2 2 0 0 0 3.6 0" {...c} />
        </>
      );
    case 'key':
      return (
        <>
          <Circle cx={8} cy={12} r={3.6} {...c} />
          <Path d="M11.6 12H21" {...c} />
          <Path d="M17.6 12v3.2M20.2 12v2.2" {...c} />
        </>
      );
    case 'shield':
      return (
        <>
          <Path d="M12 3.2 5 6v5.6c0 4.2 2.9 7.4 7 9.2 4.1-1.8 7-5 7-9.2V6z" {...c} />
          <Path d="m9.2 12 2 2.1 3.6-4" {...c} />
        </>
      );
    case 'chevron':
      return <Path d="m9.5 5.5 6.4 6.5-6.4 6.5" {...c} />;
    case 'chevron-down':
      return <Path d="m5.5 9.5 6.5 6.4 6.5-6.4" {...c} />;
    case 'chevron-up':
      return <Path d="m5.5 14.5 6.5-6.4 6.5 6.4" {...c} />;
    case 'back':
      return <Path d="m14.5 5.5-6.4 6.5 6.4 6.5" {...c} />;
    case 'arrow-right':
      return (
        <>
          <Path d="M4.5 12h15" {...c} />
          <Path d="m13.5 6 6 6-6 6" {...c} />
        </>
      );
    case 'grid':
      return (
        <>
          <Rect x={4} y={4} width={7} height={7} rx={2} {...c} />
          <Rect x={13} y={4} width={7} height={7} rx={2} {...c} />
          <Rect x={4} y={13} width={7} height={7} rx={2} {...c} />
          <Rect x={13} y={13} width={7} height={7} rx={2} {...c} />
        </>
      );
    case 'minus':
      return <Path d="M5 12h14" {...c} />;
    case 'frunk':
      return (
        <>
          <Path d="M3.5 8.5v2.2a8.5 8.5 0 0 0 17 0V8.5" {...c} />
          <Path d="M3.5 8.5h17" {...c} />
          <Path d="M12 19.2v-8.5" {...c} />
        </>
      );
    case 'map':
      return (
        <>
          <Path d="m3.5 6.6 5.6-2.1 5.8 2.1 5.6-2.1v12.9l-5.6 2.1-5.8-2.1-5.6 2.1z" {...c} />
          <Path d="M9.1 4.5v14.9M14.9 6.6v14.9" {...c} />
        </>
      );
    case 'check':
      return <Path d="m5 12.6 4.6 4.6L19 6.8" {...c} />;
    case 'close':
      return (
        <>
          <Line x1={6} y1={6} x2={18} y2={18} {...c} />
          <Line x1={18} y1={6} x2={6} y2={18} {...c} />
        </>
      );
    case 'alert':
      return (
        <>
          <Path d="M12 4.2 21 19.4H3z" {...c} />
          <Path d="M12 10v3.6" {...c} />
          <Circle cx={12} cy={16.4} r={0.95} fill={stroke} stroke="none" />
        </>
      );
    case 'info':
      return (
        <>
          <Circle cx={12} cy={12} r={8.4} {...c} />
          <Path d="M12 11v5.4" {...c} />
          <Circle cx={12} cy={7.9} r={0.95} fill={stroke} stroke="none" />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle cx={12} cy={12} r={2.9} {...c} />
          <Path
            d="M12 3.4v2M12 18.6v2M20.6 12h-2M5.4 12h-2M18.1 5.9l-1.4 1.4M7.3 16.7l-1.4 1.4M18.1 18.1l-1.4-1.4M7.3 7.3 5.9 5.9"
            {...c}
          />
        </>
      );
    case 'battery':
      return (
        <>
          <Rect x={2.6} y={7.4} width={16.4} height={9.2} rx={2.4} {...c} />
          <Path d="M21.4 10.6v2.8" {...c} />
          <Rect x={5} y={9.8} width={7.4} height={4.4} rx={1.2} fill={stroke} stroke="none" />
        </>
      );
    case 'signal':
      return (
        <>
          <Path d="M4.4 15.2a10.6 10.6 0 0 1 15.2 0" {...c} />
          <Path d="M7.6 18a6.2 6.2 0 0 1 8.8 0" {...c} />
          <Circle cx={12} cy={20.4} r={1.1} fill={stroke} stroke="none" />
        </>
      );
    case 'moon':
      return <Path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4z" {...c} />;
    case 'wrench':
      return (
        <Path
          d="M20 5.4 16.9 8.5l-1.4-1.4L18.6 4a5.2 5.2 0 0 0-6.8 6.4L4.6 17.6a1.9 1.9 0 0 0 2.7 2.7l7.2-7.2A5.2 5.2 0 0 0 20 5.4z"
          {...c}
        />
      );
    case 'download':
      return (
        <>
          <Path d="M12 3.6v11.2" {...c} />
          <Path d="m7.6 10.6 4.4 4.4 4.4-4.4" {...c} />
          <Path d="M4.6 19.4h14.8" {...c} />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx={12} cy={12} r={8.4} {...c} />
          <Path d="M12 7.4V12l3.2 2" {...c} />
        </>
      );
    case 'plus':
      return (
        <>
          <Path d="M12 5.4v13.2M5.4 12h13.2" {...c} />
        </>
      );
    case 'trash':
      return (
        <>
          <Path d="M4.8 6.8h14.4" {...c} />
          <Path d="M9.4 6.8V5.2a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.6" {...c} />
          <Path d="M6.6 6.8 7.4 19a1.6 1.6 0 0 0 1.6 1.4h6a1.6 1.6 0 0 0 1.6-1.4l.8-12.2" {...c} />
        </>
      );
    case 'pause':
      return (
        <>
          <Rect x={7.4} y={5.6} width={3} height={12.8} rx={1.2} {...c} />
          <Rect x={13.6} y={5.6} width={3} height={12.8} rx={1.2} {...c} />
        </>
      );
    case 'play':
      return <Path d="M7.6 5.4 18.4 12 7.6 18.6z" {...c} />;
    case 'globe':
      return (
        <>
          <Circle cx={12} cy={12} r={8.4} {...c} />
          <Path d="M3.6 12h16.8" {...c} />
          <Path d="M12 3.6a13 13 0 0 1 0 16.8 13 13 0 0 1 0-16.8z" {...c} />
        </>
      );
    case 'device':
      return (
        <>
          <Rect x={6.6} y={2.8} width={10.8} height={18.4} rx={2.6} {...c} />
          <Path d="M10.6 18.4h2.8" {...c} />
        </>
      );
    case 'bluetooth':
      return <Path d="m7.6 7.4 8.8 9.2L12 21V3l4.4 4.4L7.6 16.6" {...c} />;
    case 'nfc':
      return (
        <>
          <Path d="M6.6 4.6a10.4 10.4 0 0 0 0 14.8" {...c} />
          <Path d="M9.8 7.8a5.9 5.9 0 0 0 0 8.4" {...c} />
          <Path d="M17.4 19.4a10.4 10.4 0 0 0 0-14.8" {...c} />
          <Path d="M14.2 16.2a5.9 5.9 0 0 0 0-8.4" {...c} />
        </>
      );
    case 'uwb':
      return (
        <>
          <Circle cx={12} cy={12} r={2.2} fill={stroke} stroke="none" />
          <Path d="M7.8 7.8a6 6 0 0 0 0 8.4" {...c} />
          <Path d="M16.2 16.2a6 6 0 0 0 0-8.4" {...c} />
          <Path d="M4.8 4.8a10.2 10.2 0 0 0 0 14.4" {...c} />
          <Path d="M19.2 19.2a10.2 10.2 0 0 0 0-14.4" {...c} />
        </>
      );
    case 'trace':
      return (
        <>
          <Circle cx={5.4} cy={6.4} r={2.1} {...c} />
          <Circle cx={12} cy={12} r={2.1} {...c} />
          <Circle cx={18.6} cy={17.6} r={2.1} {...c} />
          <Path d="M7.1 7.7 10.3 10.4M13.7 13.3l3.2 2.7" {...c} />
        </>
      );
    case 'temperature':
      return (
        <>
          <Path d="M10.4 13.8V5.6a1.6 1.6 0 0 1 3.2 0v8.2a3.8 3.8 0 1 1-3.2 0z" {...c} />
          <Circle cx={12} cy={17.2} r={1.5} fill={stroke} stroke="none" />
        </>
      );
    case 'fan':
      return (
        <>
          <Circle cx={12} cy={12} r={1.8} {...c} />
          <Path d="M12 10.2c0-3 .8-5.6 3-5.6s2.4 3.4-3 5.6z" {...c} />
          <Path d="M13.8 12c3 0 5.6.8 5.6 3s-3.4 2.4-5.6-3z" {...c} />
          <Path d="M12 13.8c0 3-.8 5.6-3 5.6s-2.4-3.4 3-5.6z" {...c} />
          <Path d="M10.2 12c-3 0-5.6-.8-5.6-3s3.4-2.4 5.6 3z" {...c} />
        </>
      );
    case 'seat':
      return (
        <>
          <Path d="M7.6 4.6h4.6a2 2 0 0 1 2 1.8l.7 6.8H8.4z" {...c} />
          <Path d="M8.4 13.2h8.2a2 2 0 0 1 2 2v4.2" {...c} />
        </>
      );
    case 'defrost':
      return (
        <>
          <Path d="M4.4 15.4a7.6 7.6 0 0 1 15.2 0" {...c} />
          <Path d="M8.4 18.2v2.4M12 18.6v2.6M15.6 18.2v2.4" {...c} />
          <Path d="M12 3v5M9.6 5.2 12 3l2.4 2.2" {...c} />
        </>
      );
    case 'steering':
      return (
        <>
          <Circle cx={12} cy={12} r={8.4} {...c} />
          <Circle cx={12} cy={12} r={2.6} {...c} />
          <Path d="M12 9.4V4.2M9.6 13.4 5 16.4M14.4 13.4 19 16.4" {...c} />
        </>
      );
    case 'refresh':
      return (
        <>
          <Path d="M19.6 12a7.6 7.6 0 1 1-2.3-5.4" {...c} />
          <Path d="M19.8 4.4v4.2h-4.2" {...c} />
        </>
      );
  }
};

export const Icon = memo(IconComponent);
