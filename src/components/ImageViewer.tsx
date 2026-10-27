import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Pressable, StatusBar, StyleSheet, View } from 'react-native';

/* Foto a pantalla completa (como en Instagram). Toca en cualquier sitio para cerrar. */
export default function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <StatusBar backgroundColor="#000" />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {!!uri && <Image source={{ uri }} style={styles.img} resizeMode="contain" />}
        <Pressable style={styles.close} hitSlop={12} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: '85%' },
  close: { position: 'absolute', top: 44, right: 18, padding: 6 },
});
