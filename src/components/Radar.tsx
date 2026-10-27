import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

/* Gráfico hexagonal (radar). Necesita: npx expo install react-native-svg */
export default function Radar({
  labels,
  values,
  size = 290,
}: {
  labels: string[];
  values: number[];
  size?: number;
}) {
  const c = size / 2;
  const r = size / 2 - 46;
  const n = labels.length;
  const max = Math.max(1, ...values);
  const pt = (i: number, f: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: c + Math.cos(a) * r * f, y: c + Math.sin(a) * r * f };
  };
  const poly = (f: number) =>
    labels.map((_, i) => `${pt(i, f).x},${pt(i, f).y}`).join(' ');
  const data = values.map((v, i) => pt(i, v / max));

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <Polygon key={f} points={poly(f)} fill="none" stroke="#2a2f3a" strokeWidth={1} />
        ))}
        {labels.map((_, i) => (
          <Line key={i} x1={c} y1={c} x2={pt(i, 1).x} y2={pt(i, 1).y} stroke="#2a2f3a" strokeWidth={1} />
        ))}
        <Polygon
          points={data.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="rgba(90,176,255,0.35)"
          stroke="#5AB0FF"
          strokeWidth={2}
        />
        {data.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={4} fill="#5AB0FF" />
        ))}
        {labels.map((l, i) => {
          const p = pt(i, 1.2);
          return (
            <SvgText
              key={l}
              x={p.x}
              y={p.y + 4}
              fill="#cfd8e6"
              fontSize={12}
              fontWeight="700"
              textAnchor="middle"
            >
              {l}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center' } });
