import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import ImageViewer from '@/components/ImageViewer';
import MeasureChart from '@/components/MeasureChart';
import type { Point } from '@/components/MeasureChart';
import {
  METRICS,
  METRIC_BY_KEY,
  dateKey,
  deleteRecord,
  fetchRecords,
  fmtDate,
  fmtNum,
  keyToDate,
  newId,
  saveRecord,
  sortRecords,
} from '@/lib/measures';
import type { BodyRecord, Measures, MetricKey } from '@/lib/measures';
import { errText } from '@/lib/social';
import type { PostMedia } from '@/lib/social';
import { MONTHS } from '@/lib/stats';

const MAX_PHOTOS = 6;
const MAX_VIDEOS = 1;
const MAX_VIDEO_SECONDS = 60;

const PERIODS = [
  { k: '3m', label: '3 meses', months: 3 },
  { k: '6m', label: '6 meses', months: 6 },
  { k: '1y', label: '1 año', months: 12 },
  { k: 'all', label: 'Desde siempre', months: 0 },
] as const;
type PeriodKey = (typeof PERIODS)[number]['k'];

type Screen = { k: 'home' } | { k: 'all' } | { k: 'detail'; id: string } | { k: 'form'; id?: string };

const isImg = (m: PostMedia) => m.type === 'image';

// Tamaño de las fotos: ≈3,5 visibles y alto = 1/6 de la pantalla
function usePhotoSize() {
  const { width, height } = useWindowDimensions();
  const gap = 8;
  const pad = 12;
  return { w: (width - pad - gap * 3) / 3.5, h: height / 6, gap, pad };
}

/* ---------- Piezas pequeñas ---------- */
function Header({ title, left, right }: { title: string; left: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={[styles.headSide, { alignItems: 'flex-start' }]}>{left}</View>
      <Text style={styles.headTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.headSide, styles.headRight]}>{right}</View>
    </View>
  );
}

const BackBtn = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={12}>
    <Ionicons name="arrow-back" size={26} color="#fff" />
  </Pressable>
);

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>{children}</View>
      </View>
    </Modal>
  );
}

/* ---------- Selector de fecha (sin dependencias nuevas) ---------- */
function DateSheet({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onPick: (key: string) => void;
}) {
  const [y, setY] = useState(2000);
  const [m, setM] = useState(0);
  const [d, setD] = useState(1);

  useEffect(() => {
    if (!visible) return;
    const x = keyToDate(value);
    setY(x.getFullYear());
    setM(x.getMonth());
    setD(x.getDate());
  }, [visible, value]);

  const apply = (yy: number, mm: number, dd: number) => {
    const dim = new Date(yy, mm + 1, 0).getDate();
    const t = new Date(yy, mm, Math.min(Math.max(1, dd), dim), 12);
    const today = new Date();
    const out = dateKey(t) > dateKey(today) ? today : t;
    setY(out.getFullYear());
    setM(out.getMonth());
    setD(out.getDate());
  };
  const dim = new Date(y, m + 1, 0).getDate();
  const stepDay = (n: number) => apply(y, m, d + n > dim ? 1 : d + n < 1 ? dim : d + n);
  const stepMonth = (n: number) => apply(y, (m + n + 12) % 12, d);
  const stepYear = (n: number) => apply(Math.max(2000, y + n), m, d);

  const Col = ({ label, onUp, onDown }: { label: string; onUp: () => void; onDown: () => void }) => (
    <View style={styles.dateCol}>
      <Pressable hitSlop={10} onPress={onUp}>
        <Ionicons name="chevron-up" size={26} color="#5AB0FF" />
      </Pressable>
      <Text style={styles.dateVal}>{label}</Text>
      <Pressable hitSlop={10} onPress={onDown}>
        <Ionicons name="chevron-down" size={26} color="#5AB0FF" />
      </Pressable>
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>Fecha del registro</Text>
      <View style={styles.dateRow}>
        <Col label={String(d)} onUp={() => stepDay(1)} onDown={() => stepDay(-1)} />
        <Col label={MONTHS[m]} onUp={() => stepMonth(1)} onDown={() => stepMonth(-1)} />
        <Col label={String(y)} onUp={() => stepYear(1)} onDown={() => stepYear(-1)} />
      </View>
      <Pressable
        style={styles.primaryBtn}
        onPress={() => {
          onPick(dateKey(new Date(y, m, d, 12)));
          onClose();
        }}
      >
        <Text style={styles.primaryBtnText}>Listo</Text>
      </Pressable>
    </Sheet>
  );
}

/* ---------- Pantalla principal ---------- */
function Home({
  records,
  refreshing,
  onRefresh,
  onOpen,
  onAll,
}: {
  records: BodyRecord[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (id: string) => void;
  onAll: () => void;
}) {
  const { w, h, gap, pad } = usePhotoSize();
  const [period, setPeriod] = useState<PeriodKey>('3m');
  const [metricKey, setMetricKey] = useState<MetricKey>('weight');
  const [metricSheet, setMetricSheet] = useState(false);

  const photos = useMemo(
    () =>
      records.flatMap((r) =>
        r.media.filter(isImg).map((m, i) => ({ key: `${r.id}-${i}`, id: r.id, uri: m.uri, date: r.recorded_at }))
      ),
    [records]
  );

  const available = useMemo(
    () => METRICS.filter((m) => m.key === 'weight' || records.some((r) => r.measures[m.key] != null)),
    [records]
  );
  const metric = available.find((m) => m.key === metricKey) ?? METRIC_BY_KEY.weight;

  const { points, from, to } = useMemo(() => {
    const now = Date.now();
    const per = PERIODS.find((p) => p.k === period)!;
    const cutoff = per.months ? new Date(now).setMonth(new Date(now).getMonth() - per.months) : 0;
    const pts: Point[] = records
      .filter((r) => r.measures[metric.key] != null)
      .map((r) => ({ t: keyToDate(r.recorded_at).getTime(), v: r.measures[metric.key] as number }))
      .filter((p) => p.t >= cutoff)
      .sort((a, b) => a.t - b.t);
    const f = per.months ? cutoff : pts.length ? pts[0].t : now - 86400000;
    const t = Math.max(now, pts.length ? pts[pts.length - 1].t : 0);
    return { points: pts, from: f, to: t };
  }, [records, period, metric]);

  const history = records.filter((r) => r.measures.weight != null);

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5AB0FF" />}
    >
      {/* Fotos de progreso */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Fotos de progreso</Text>
        {photos.length > 0 && (
          <Pressable onPress={onAll} hitSlop={10}>
            <Text style={styles.link}>Ver todas</Text>
          </Pressable>
        )}
      </View>
      {photos.length === 0 ? (
        <Text style={[styles.muted, { paddingHorizontal: 18 }]}>
          Aún no hay fotos. Añade un registro con el botón +.
        </Text>
      ) : (
        <FlatList
          data={photos}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(p) => p.key}
          contentContainerStyle={{ paddingHorizontal: pad }}
          ItemSeparatorComponent={() => <View style={{ width: gap }} />}
          renderItem={({ item }) => (
            <Pressable style={{ width: w }} onPress={() => onOpen(item.id)}>
              <Image source={{ uri: item.uri }} style={{ width: w, height: h, borderRadius: 10, backgroundColor: '#161616' }} />
              <Text style={styles.photoDate}>{fmtDate(item.date)}</Text>
            </Pressable>
          )}
        />
      )}

      {/* Gráfico */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Evolución corporal</Text>
        <Pressable style={styles.metricBtn} onPress={() => setMetricSheet(true)}>
          <Text style={styles.metricBtnText}>
            {metric.label} ({metric.unit})
          </Text>
          <Ionicons name="chevron-down" size={18} color="#fff" />
        </Pressable>
        <View style={styles.chips}>
          {PERIODS.map((p) => (
            <Pressable key={p.k} style={[styles.chip, period === p.k && styles.chipOn]} onPress={() => setPeriod(p.k)}>
              <Text style={[styles.chipText, period === p.k && { color: '#000' }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.card}>
          <MeasureChart points={points} unit={metric.unit} from={from} to={to} />
        </View>
      </View>

      {/* Historial de peso */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Historial de peso corporal</Text>
        {history.length === 0 ? (
          <Text style={styles.muted}>Todavía no hay registros de peso.</Text>
        ) : (
          history.map((r) => {
            const hasPhotos = r.media.some(isImg);
            return (
              <Pressable
                key={r.id}
                style={[styles.histRow, hasPhotos && styles.histRowPhoto]}
                onPress={() => onOpen(r.id)}
              >
                <View style={styles.histLeft}>
                  <Text style={styles.histWeight}>{fmtNum(r.measures.weight as number)} kg</Text>
                  {hasPhotos && <Ionicons name="camera" size={17} color="#5AB0FF" />}
                </View>
                <Text style={styles.histDate}>{fmtDate(r.recorded_at)}</Text>
              </Pressable>
            );
          })
        )}
      </View>

      <Sheet visible={metricSheet} onClose={() => setMetricSheet(false)}>
        <Text style={styles.sheetTitle}>Medida del gráfico</Text>
        <ScrollView style={{ maxHeight: 420 }}>
          {available.map((m) => (
            <Pressable
              key={m.key}
              style={styles.sheetRow}
              onPress={() => {
                setMetricKey(m.key);
                setMetricSheet(false);
              }}
            >
              <Text style={[styles.sheetRowText, m.key === metric.key && { color: '#5AB0FF' }]}>
                {m.label} ({m.unit})
              </Text>
              {m.key === metric.key && <Ionicons name="checkmark" size={18} color="#5AB0FF" />}
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </ScrollView>
  );
}

/* ---------- Ver todas las fotos ---------- */
function AllList({ records, onOpen }: { records: BodyRecord[]; onOpen: (id: string) => void }) {
  const { w, h } = usePhotoSize();
  const list = records.filter((r) => r.media.some(isImg));
  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60, gap: 10 }}>
      {list.length === 0 && <Text style={[styles.muted, { textAlign: 'center', marginTop: 30 }]}>No hay fotos.</Text>}
      {list.map((r) => {
        const imgs = r.media.filter(isImg);
        const filled = METRICS.filter((m) => r.measures[m.key] != null);
        return (
          <Pressable key={r.id} style={styles.allRow} onPress={() => onOpen(r.id)}>
            <View>
              <Image source={{ uri: imgs[0].uri }} style={{ width: w, height: h, borderRadius: 10, backgroundColor: '#161616' }} />
              {imgs.length > 1 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>+{imgs.length - 1}</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, minHeight: h }}>
              <Text style={styles.allDate}>{fmtDate(r.recorded_at)}</Text>
              {filled.map((m) => (
                <Text key={m.key} style={styles.allLine}>
                  {m.label}: <Text style={{ color: '#fff' }}>{fmtNum(r.measures[m.key] as number)} {m.unit}</Text>
                </Text>
              ))}
              {r.media.some((m) => m.type === 'video') && (
                <Text style={styles.allLine}>
                  <Ionicons name="videocam" size={12} color="#9cc9ff" /> Incluye vídeo
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ---------- Detalle de un registro ---------- */
function Detail({ record }: { record: BodyRecord }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const filled = METRICS.filter((m) => record.measures[m.key] != null);
  return (
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
      <Text style={styles.detailDate}>{fmtDate(record.recorded_at)}</Text>

      {record.media.length > 0 && (
        <View style={styles.mediaRow}>
          {record.media.map((m, i) =>
            m.type === 'image' ? (
              <Pressable key={i} onPress={() => setZoom(m.uri)}>
                <Image source={{ uri: m.uri }} style={styles.mediaBig} />
              </Pressable>
            ) : (
              <Pressable
                key={i}
                style={[styles.mediaBig, styles.mediaVideo]}
                onPress={() => Linking.openURL(m.uri).catch(() => Alert.alert('No se pudo abrir el vídeo'))}
              >
                <Ionicons name="play-circle" size={36} color="#9cc9ff" />
                <Text style={styles.mediaVideoText}>Vídeo</Text>
              </Pressable>
            )
          )}
        </View>
      )}

      <Text style={styles.grayTitle}>Medidas</Text>
      {filled.length === 0 ? (
        <Text style={styles.muted}>Este registro no tiene medidas.</Text>
      ) : (
        filled.map((m) => (
          <View key={m.key} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{m.label}</Text>
            <Text style={styles.fieldValue}>
              {fmtNum(record.measures[m.key] as number)} {m.unit}
            </Text>
          </View>
        ))
      )}
      <ImageViewer uri={zoom} onClose={() => setZoom(null)} />
    </ScrollView>
  );
}

/* ---------- Formulario (crear y editar) ---------- */
function RecordForm({
  me,
  initial,
  onSaved,
  onCancel,
}: {
  me: string;
  initial?: BodyRecord;
  onSaved: (r: BodyRecord) => void;
  onCancel: () => void;
}) {
  const idRef = useRef(initial?.id ?? newId()); // mismo id en reintentos: evita duplicados
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(initial?.recorded_at ?? dateKey(new Date()));
  const [dateSheet, setDateSheet] = useState(false);
  const [media, setMedia] = useState<PostMedia[]>(initial?.media ?? []);
  const [mediaSheet, setMediaSheet] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const m of METRICS) if (initial?.measures[m.key] != null) o[m.key] = String(initial.measures[m.key]);
    return o;
  });

  const photoCount = media.filter(isImg).length;
  const videoCount = media.length - photoCount;

  const setVal = (k: string, t: string) => {
    const s = t.replace(',', '.');
    if (/^\d{0,4}(\.\d{0,2})?$/.test(s)) setVals((p) => ({ ...p, [k]: s }));
  };

  const addAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    let photos = photoCount;
    let videos = videoCount;
    const added: PostMedia[] = [];
    let skipped = false;
    for (const a of assets) {
      if (a.type === 'video') {
        if (videos >= MAX_VIDEOS || (a.duration ?? 0) > MAX_VIDEO_SECONDS * 1000) {
          skipped = true;
          continue;
        }
        videos++;
        added.push({ uri: a.uri, type: 'video' });
      } else {
        if (photos >= MAX_PHOTOS) {
          skipped = true;
          continue;
        }
        photos++;
        added.push({ uri: a.uri, type: 'image' });
      }
    }
    if (added.length) setMedia((p) => [...p, ...added]);
    if (skipped) {
      Alert.alert(
        'Algunos archivos no se añadieron',
        `Máximo ${MAX_PHOTOS} fotos y ${MAX_VIDEOS} vídeo por registro, y el vídeo no puede durar más de ${MAX_VIDEO_SECONDS} segundos.`
      );
    }
  };

  const capture = async (kind: 'photo' | 'video') => {
    setMediaSheet(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Sin permiso', 'Necesito permiso de cámara para hacer fotos o vídeos.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: kind === 'photo' ? ['images'] : ['videos'],
      quality: 0.7,
      videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    if (!res.canceled) addAssets(res.assets);
  };

  const gallery = async () => {
    setMediaSheet(false);
    const remaining = MAX_PHOTOS - photoCount + (MAX_VIDEOS - videoCount);
    if (remaining <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.7,
      videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    if (!res.canceled) addAssets(res.assets);
  };

  const save = async () => {
    if (busy.current) return;
    const measures: Measures = {};
    for (const m of METRICS) {
      const raw = vals[m.key];
      if (raw === undefined || raw === '') continue;
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n < m.min || n > m.max) {
        Alert.alert('Valor no válido', `${m.label}: introduce un valor entre ${m.min} y ${m.max} ${m.unit}.`);
        return;
      }
      measures[m.key] = Math.round(n * 100) / 100;
    }
    if (Object.keys(measures).length === 0 && media.length === 0) {
      Alert.alert('Registro vacío', 'Rellena al menos una medida o añade una foto o un vídeo.');
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const rec = await saveRecord(me, { id: idRef.current, recorded_at: date, measures, media }, initial);
      onSaved(rec);
    } catch (e) {
      Alert.alert('No se pudo guardar', errText(e));
    }
    busy.current = false;
    setSaving(false);
  };

  return (
    <>
      <Header
        title={initial ? 'Editar registro' : 'Añadir registro'}
        left={
          <Pressable onPress={onCancel} hitSlop={10}>
            <Text style={styles.headLink}>Cancelar</Text>
          </Pressable>
        }
        right={
          <Pressable onPress={save} disabled={saving} hitSlop={10}>
            <Text style={[styles.headLink, saving && { color: '#3a4a5e' }]}>{saving ? 'Guardando…' : 'Guardar'}</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <Pressable style={[styles.fieldRow, styles.formPad]} onPress={() => setDateSheet(true)}>
          <Text style={styles.fieldLabel}>Fecha</Text>
          <Text style={[styles.fieldValue, { color: '#5AB0FF' }]}>{fmtDate(date)}</Text>
        </Pressable>

        <View style={styles.formPad}>
          <Pressable
            style={[styles.mediaBtn, photoCount >= MAX_PHOTOS && videoCount >= MAX_VIDEOS && { opacity: 0.4 }]}
            disabled={photoCount >= MAX_PHOTOS && videoCount >= MAX_VIDEOS}
            onPress={() => setMediaSheet(true)}
          >
            <Ionicons name="camera-outline" size={24} color="#cfd8e6" />
            <Text style={styles.mediaBtnText}>Añadir foto / vídeo</Text>
            <Text style={styles.muted}>
              {photoCount}/{MAX_PHOTOS} · {videoCount}/{MAX_VIDEOS}
            </Text>
          </Pressable>
          {media.length > 0 && (
            <View style={styles.mediaRow}>
              {media.map((m, i) => (
                <View key={m.uri + i} style={styles.mediaThumb}>
                  {m.type === 'image' ? (
                    <Image source={{ uri: m.uri }} style={styles.mediaImg} />
                  ) : (
                    <View style={[styles.mediaImg, styles.mediaVideo]}>
                      <Ionicons name="videocam" size={26} color="#9cc9ff" />
                      <Text style={styles.mediaVideoText}>Vídeo</Text>
                    </View>
                  )}
                  <Pressable style={styles.mediaRemove} hitSlop={8} onPress={() => setMedia((p) => p.filter((_, j) => j !== i))}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={[styles.grayTitle, styles.formPad, { marginTop: 22 }]}>Medidas</Text>
        {METRICS.map((m) => (
          <View key={m.key} style={[styles.fieldRow, styles.formPad]}>
            <Text style={styles.fieldLabel}>{m.label}</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.numInput}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor="#555"
                value={vals[m.key] ?? ''}
                onChangeText={(t) => setVal(m.key, t)}
                maxLength={7}
              />
              <Text style={styles.unit}>{m.unit}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <DateSheet visible={dateSheet} value={date} onClose={() => setDateSheet(false)} onPick={setDate} />

      <Sheet visible={mediaSheet} onClose={() => setMediaSheet(false)}>
        <Text style={styles.sheetTitle}>Añadir foto / vídeo</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 8 }]}>
          Máximo {MAX_PHOTOS} fotos y {MAX_VIDEOS} vídeo (hasta {MAX_VIDEO_SECONDS} s).
        </Text>
        {photoCount < MAX_PHOTOS && (
          <Pressable style={styles.sheetRow} onPress={() => capture('photo')}>
            <Text style={styles.sheetRowText}>Hacer foto</Text>
          </Pressable>
        )}
        {videoCount < MAX_VIDEOS && (
          <Pressable style={styles.sheetRow} onPress={() => capture('video')}>
            <Text style={styles.sheetRowText}>Grabar vídeo</Text>
          </Pressable>
        )}
        <Pressable style={styles.sheetRow} onPress={gallery}>
          <Text style={styles.sheetRowText}>Elegir de la galería</Text>
        </Pressable>
      </Sheet>
    </>
  );
}

/* ---------- Contenedor: navegación interna + datos compartidos ---------- */
export default function MeasuresScreen({ me, onExit }: { me: string; onExit: () => void }) {
  const [records, setRecords] = useState<BodyRecord[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [stack, setStack] = useState<Screen[]>([{ k: 'home' }]);
  const cur = stack[stack.length - 1];

  const push = (s: Screen) => setStack((p) => [...p, s]);
  const pop = () => setStack((p) => (p.length > 1 ? p.slice(0, -1) : p));
  const back = () => (stack.length > 1 ? pop() : onExit());

  const load = useCallback(async () => {
    try {
      setRecords(sortRecords(await fetchRecords(me)));
      setError('');
    } catch (e) {
      setError(errText(e));
    }
    setRefreshing(false);
  }, [me]);

  useEffect(() => {
    load();
  }, [load]);

  const upsert = (r: BodyRecord) =>
    setRecords((p) => sortRecords([...(p ?? []).filter((x) => x.id !== r.id), r]));

  const record = cur.k === 'detail' || (cur.k === 'form' && cur.id) ? records?.find((r) => r.id === (cur as any).id) : undefined;

  const confirmDelete = (r: BodyRecord) =>
    Alert.alert('Eliminar registro', 'Se borrará este registro y sus archivos. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRecord(me, r);
            setRecords((p) => (p ?? []).filter((x) => x.id !== r.id));
            pop();
          } catch (e) {
            Alert.alert('No se pudo eliminar', errText(e));
          }
        },
      },
    ]);

  const plus = (
    <Pressable hitSlop={12} onPress={() => push({ k: 'form' })}>
      <Ionicons name="add" size={30} color="#fff" />
    </Pressable>
  );

  /* ----- Cabecera y contenido según la pantalla ----- */
  if (cur.k === 'form') {
    return (
      <View style={styles.root}>
        <RecordForm
          key={cur.id ?? 'new'}
          me={me}
          initial={record}
          onCancel={pop}
          onSaved={(r) => {
            upsert(r);
            pop();
          }}
        />
      </View>
    );
  }

  if (cur.k === 'detail') {
    return (
      <View style={styles.root}>
        <Header
          title="Registro"
          left={<BackBtn onPress={pop} />}
          right={
            record ? (
              <>
                <Pressable hitSlop={10} onPress={() => push({ k: 'form', id: record.id })}>
                  <Ionicons name="pencil" size={22} color="#fff" />
                </Pressable>
                <Pressable hitSlop={10} onPress={() => confirmDelete(record)}>
                  <Ionicons name="trash-outline" size={22} color="#ff5b4d" />
                </Pressable>
              </>
            ) : undefined
          }
        />
        {record ? <Detail record={record} /> : <Text style={[styles.muted, { textAlign: 'center', marginTop: 40 }]}>Registro no encontrado.</Text>}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Header title="Medidas" left={<BackBtn onPress={back} />} right={plus} />
      {records === null ? (
        error ? (
          <View style={{ alignItems: 'center', marginTop: 40, gap: 12, paddingHorizontal: 24 }}>
            <Text style={[styles.muted, { color: '#ff8a80', textAlign: 'center' }]}>
              No se pudieron cargar las medidas: {error}
            </Text>
            <Pressable onPress={load}>
              <Text style={styles.link}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator color="#5AB0FF" style={{ marginTop: 40 }} />
        )
      ) : cur.k === 'all' ? (
        <AllList records={records} onOpen={(id) => push({ k: 'detail', id })} />
      ) : (
        <Home
          records={records}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          onOpen={(id) => push({ k: 'detail', id })}
          onAll={() => push({ k: 'all' })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#161616',
  },
  headSide: { width: 96 },
  headRight: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18 },
  headTitle: { flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  headLink: { color: '#5AB0FF', fontSize: 15, fontWeight: '600' },

  muted: { color: '#888', fontSize: 13 },
  link: { color: '#5AB0FF', fontSize: 15, fontWeight: '600' },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginTop: 18,
    marginBottom: 10,
  },
  section: { paddingHorizontal: 18, marginTop: 26 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  photoDate: { color: '#aab3c2', fontSize: 11, marginTop: 4, textAlign: 'center' },

  metricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#161616',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
  },
  metricBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  chip: {
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#EAF2FF', borderColor: '#EAF2FF' },
  chipText: { color: '#cfd8e6', fontWeight: '600', fontSize: 13 },
  card: { backgroundColor: '#111', borderColor: '#222', borderWidth: 1, borderRadius: 18, padding: 14 },

  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  histRowPhoto: { backgroundColor: 'rgba(90,176,255,0.10)' },
  histLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histWeight: { color: '#fff', fontSize: 17, fontWeight: '700' },
  histDate: { color: '#8a94a6', fontSize: 14 },

  allRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
  },
  allDate: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  allLine: { color: '#8a94a6', fontSize: 12, marginTop: 2 },
  countBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  detailDate: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 12 },
  grayTitle: { color: '#8a94a6', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomColor: '#1a1a1a',
    borderBottomWidth: 1,
  },
  formPad: { paddingHorizontal: 18 },
  fieldLabel: { color: '#fff', fontSize: 16 },
  fieldValue: { color: '#cfd8e6', fontSize: 16, fontWeight: '600' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numInput: { color: '#fff', fontSize: 16, minWidth: 80, textAlign: 'right', paddingVertical: 0 },
  unit: { color: '#8a94a6', fontSize: 14, width: 26 },

  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#161616',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  mediaBtnText: { flex: 1, color: '#e6ecf5', fontSize: 15, fontWeight: '600' },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  mediaThumb: { width: 82, height: 82 },
  mediaImg: { width: 82, height: 82, borderRadius: 12, backgroundColor: '#161616' },
  mediaBig: { width: 104, height: 104, borderRadius: 12, backgroundColor: '#161616' },
  mediaVideo: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  mediaVideoText: { color: '#9cc9ff', fontSize: 11, fontWeight: '600' },
  mediaRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#0d0d0d',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: '#222',
    borderWidth: 1,
    padding: 20,
    paddingBottom: 36,
  },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopColor: '#1c1c1c',
    borderTopWidth: 1,
  },
  sheetRowText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  primaryBtn: { backgroundColor: '#2F6BFF', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dateRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
  dateCol: { alignItems: 'center', gap: 8, minWidth: 90 },
  dateVal: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
