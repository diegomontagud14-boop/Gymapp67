import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/* Fila de chips de filtro (igual que en "Añadir ejercicio") */
export default function FilterChips<T extends string>({
  all,
  current,
  onSelect,
  label,
}: {
  all: T[];
  current: T;
  onSelect: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <View style={styles.bar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {all.map((g) => (
          <Pressable
            key={g}
            onPress={() => onSelect(g)}
            style={[styles.chip, current === g && styles.chipActive]}
          >
            <Text numberOfLines={1} style={[styles.text, current === g && { color: '#000' }]}>
              {label(g)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 58, marginTop: 4 },
  row: { paddingHorizontal: 18, gap: 10, alignItems: 'center', height: 58 },
  chip: {
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 20,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#EAF2FF', borderColor: '#EAF2FF' },
  text: { color: '#cfd8e6', fontWeight: '600', fontSize: 15 },
});
