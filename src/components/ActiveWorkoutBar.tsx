import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/lib/format';

export type ActiveInfo = {
  name: string;
  start: number;
  exercise: string | null;
};

// Círculo verde que palpita
function PulseDot() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: '#22C55E',
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }],
        }}
      />
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E' }} />
    </View>
  );
}

function Elapsed({ start }: { start: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Text style={styles.time}>{formatDuration(Math.max(0, Math.floor((now - start) / 1000)))}</Text>
  );
}

/* Barra del entreno en curso: se ve en todas las pestañas mientras no estés dentro del entreno */
export default function ActiveWorkoutBar({
  info,
  onOpen,
  onDelete,
}: {
  info: ActiveInfo;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Pressable style={styles.main} onPress={onOpen}>
          <Ionicons name="chevron-up" size={24} color="#fff" />
          <PulseDot />
          <Text style={styles.name} numberOfLines={1}>
            {info.name || 'Entrenamiento'}
          </Text>
          <Elapsed start={info.start} />
        </Pressable>
        <Pressable hitSlop={12} onPress={onDelete}>
          <Ionicons name="trash-outline" size={22} color="#ff5b4d" />
        </Pressable>
      </View>
      {!!info.exercise && (
        <Pressable onPress={onOpen}>
          <Text style={styles.exercise} numberOfLines={1}>
            {info.exercise}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogRoot}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMsg}>{message}</Text>
          <View style={styles.dialogBtns}>
            <Pressable style={styles.dialogBtn} onPress={onCancel}>
              <Text style={styles.dialogCancel}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.dialogBtn} onPress={onConfirm}>
              <Text style={styles.dialogDanger}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#111',
    borderTopColor: '#222',
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  time: { color: '#5AB0FF', fontSize: 15, fontWeight: '700' },
  exercise: { color: '#9aa4b5', fontSize: 14, marginTop: 8, marginLeft: 2 },

  dialogRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  dialog: {
    width: '100%',
    backgroundColor: '#121212',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
  },
  dialogTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  dialogMsg: { color: '#aab3c2', fontSize: 15, textAlign: 'center', marginTop: 12, lineHeight: 21 },
  dialogBtns: { flexDirection: 'row', marginTop: 22, gap: 10 },
  dialogBtn: {
    flex: 1,
    backgroundColor: '#1b1b1b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dialogCancel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dialogDanger: { color: '#ff5b4d', fontSize: 15, fontWeight: '700' },
});
