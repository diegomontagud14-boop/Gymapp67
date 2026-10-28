import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { MONTHS_SHORT } from '@/lib/stats';

export type Pt = { t: number; v: number };
const H = 190;
const PAD = { l: 40, r: 14, t: 12, b: 28 };
const p2 = (n: number) => String(n).padStart(2, '0');

/* Gráfico de línea: toca un punto o mantén pulsado y arrastra para recorrerlos.
   Una línea blanca semitransparente marca el punto seleccionado. */
export default function ProgressChart({
  points,
  from,
  to,
  selected,
  onSelect,
}: {
  points: Pt[];
  from: number;
  to: number;
  selected: number | null;
  onSelect: (i: number | null) => void;
}) {
  const [w, setW] = useState(0);
  const innerW = Math.max(1, w - PAD.l - PAD.r);
  const innerH = H - PAD.t - PAD.b;
  const max = Math.max(1, ...points.map((p) => p.v)) * 1.1;
  const span = Math.max(1, to - from);
  const X = (t: number) => (points.length === 1 ? PAD.l + innerW / 2 : PAD.l + ((t - from) / span) * innerW);
  const Y = (v: number) => PAD.t + innerH - (v / max) * innerH;

  const long = span > 190 * 86400000;
  const fmt = (t: number) => {
    const d = new Date(t);
    return long ? `${MONTHS_SHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` : `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
  };

  const pick = (x: number) => {
    if (!points.length) return;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(X(p.t) - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    onSelect(best);
  };

  const yTicks = [0, max / 2, max].map((v) => Math.round(v * 10) / 10);
  const xTicks = points.length > 1 ? [0, 1, 2, 3].map((i) => from + (span * i) / 3) : [];

  return (
    <View
      style={styles.box}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
      onResponderMove={(e) => pick(e.nativeEvent.locationX)}
    >
      {w > 0 && (
        <Svg width={w} height={H} pointerEvents="none">
          {yTicks.map((v) => (
            <Line key={'g' + v} x1={PAD.l} x2={w - PAD.r} y1={Y(v)} y2={Y(v)} stroke="#1f2430" strokeWidth={1} />
          ))}
          {yTicks.map((v) => (
            <SvgText key={'l' + v} x={PAD.l - 6} y={Y(v) + 4} fill="#7b8494" fontSize={10} textAnchor="end">
              {v}
            </SvgText>
          ))}
          {xTicks.map((t, i) => (
            <SvgText
              key={'x' + i}
              x={Math.min(w - PAD.r - 14, Math.max(PAD.l + 14, X(t)))}
              y={H - 8}
              fill="#7b8494"
              fontSize={10}
              textAnchor="middle"
            >
              {fmt(t)}
            </SvgText>
          ))}
          {points.length > 1 && (
            <Polyline
              points={points.map((p) => `${X(p.t)},${Y(p.v)}`).join(' ')}
              fill="none"
              stroke="#3B82F6"
              strokeWidth={2.5}
            />
          )}
          {selected !== null && points[selected] && (
            <Line
              x1={X(points[selected].t)}
              x2={X(points[selected].t)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={2}
            />
          )}
          {points.map((p, i) => (
            <Circle
              key={i}
              cx={X(p.t)}
              cy={Y(p.v)}
              r={i === selected ? 6 : 3.5}
              fill={i === selected ? '#fff' : '#3B82F6'}
              stroke="#3B82F6"
              strokeWidth={2}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ box: { height: H, width: '100%' } });
