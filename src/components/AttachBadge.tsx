import { Image, StyleSheet, View } from 'react-native';

import { ATTACH_BY_ID } from '@/data/attachments';

/* Circulito azul con la imagen del enganche elegido (fondo blanco) */
export default function AttachBadge({ id, size = 38 }: { id?: string; size?: number }) {
  const a = id ? ATTACH_BY_ID[id] : undefined;
  if (!a) return null;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.inner, { borderRadius: size / 2 }]}>
        <Image source={a.image} style={{ width: size * 0.7, height: size * 0.7 }} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, borderColor: '#2F6BFF', padding: 1, backgroundColor: '#2F6BFF' },
  inner: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
