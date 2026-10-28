import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { fmtNum } from '@/lib/measures';
import { MONTHS_SHORT } from '@/lib/stats';

export type Point = { t: number; v: number };

const H = 230;
const L = 44; // espacio para los números del eje Y
const R = 16;
const T = 12;
const B = 30; // espacio para las fechas del eje X
const BLUE = '#1E90FF';

// Marcas "redondas" del eje Y (p. ej. 70, 72, 74, 76…) que cubren todos los datos
function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { ticks, step };
}

const fmtX = (t: number, withYear: boolean) => {
  const d = new Date(t);
  return withYear
    ? `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};
const fmtFull = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

/* Gráfico temporal (fechas en X, valores en Y). Toca el gráfico para ver el valor de un punto. */
export default function MeasureChart({
  points,
  unit,
  from,
  to,
}: {
  points: Point[]; // de antiguo a nuevo
  unit: string;
  from: number;
  to: number;
}) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);

  if (points.length === 0) {
    return <Text style={styles.empty}>No hay datos de esta medida en este periodo.</Text>;
  }

  const vals = points.map((p) => p.v);
  const { ticks, step } = niceTicks(Math.min(...vals), Math.max(...vals));
  const min = ticks[0];
  const max = ticks[ticks.length - 1];
  const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;

  const span = Math.max(1, to - from);
  const plotW = Math.max(1, w - L - R);
  const plotH = H - T - B;
  const x = (t: number) => L + Math.min(1, Math.max(0, (t - from) / span)) * plotW;
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * plotH;

  const withYear = span > 330 * 86400000;
  const xFracs = [0, 1 / 3, 2 / 3, 1];

  const idx = sel !== null && sel < points.length ? sel : points.length - 1;
  const cur = points[idx];

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t)},${y(p.v)}`).join(' ');
  const area =
    points.length > 1
      ? `${line} L${x(points[points.length - 1].t)},${T + plotH} L${x(points[0].t)},${T + plotH} Z`
      : '';

  const pick = (px: number) => {
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.t) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setSel(best);
  };

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.value}>
          {fmtNum(cur.v)} {unit}
        </Text>
        <Text style={styles.date}>{fmtFull(cur.t)}</Text>
      </View>

      <Pressable
        style={{ height: H }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onPress={(e) => pick(e.nativeEvent.locationX)}
      >
        {w > 0 && (
          <Svg width={w} height={H} pointerEvents="none">
            <Defs>
              <LinearGradient id="mArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={BLUE} stopOpacity={0.35} />
                <Stop offset="1" stopColor={BLUE} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Rejilla y números del eje Y */}
            {ticks.map((v) => (
              <G key={v}>
                <Line
                  x1={L}
                  x2={w - R}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="#2a2f3a"
                  strokeWidth={1}
                  strokeDasharray={v === min ? undefined : '3,4'}
                />
                <SvgText x={L - 8} y={y(v) + 4} fill="#8a94a6" fontSize={11} textAnchor="end">
                  {fmtNum(v, dec)}
                </SvgText>
              </G>
            ))}

            {/* Fechas del eje X */}
            {xFracs.map((f, i) => (
              <SvgText
                key={i}
                x={x(from + span * f)}
                y={H - 8}
                fill="#8a94a6"
                fontSize={11}
                textAnchor={i === 0 ? 'start' : i === xFracs.length - 1 ? 'end' : 'middle'}
              >
                {fmtX(from + span * f, withYear)}
              </SvgText>
            ))}

            {/* Área y línea */}
            {!!area && <Path d={area} fill="url(#mArea)" />}
            {points.length > 1 && (
              <Path d={line} fill="none" stroke={BLUE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Guía vertical del punto seleccionado */}
            <Line
              x1={x(cur.t)}
              x2={x(cur.t)}
              y1={T}
              y2={T + plotH}
              stroke="#5AB0FF"
              strokeWidth={1}
              strokeDasharray="3,4"
              opacity={0.6}
            />

            {/* Puntos (si hay muchos, solo el seleccionado) */}
            {points.map((p, i) =>
              points.length <= 40 || i === idx ? (
                <Circle
                  key={i}
                  cx={x(p.t)}
                  cy={y(p.v)}
                  r={i === idx ? 6 : 3.5}
                  fill={i === idx ? '#fff' : BLUE}
                  stroke={BLUE}
                  strokeWidth={i === idx ? 3 : 0}
                />
              ) : null
            )}
          </Svg>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: '#888', textAlign: 'center', paddingVertical: 40, fontSize: 14 },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 },
  value: { color: '#fff', fontSize: 22, fontWeight: '800' },
  date: { color: '#8a94a6', fontSize: 13 },
});
