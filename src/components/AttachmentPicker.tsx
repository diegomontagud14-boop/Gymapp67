import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Attachment } from '@/data/attachments';

/* "Elige el agarre": imágenes deslizables a izquierda/derecha, con puntos abajo para saltar a una */
export default function AttachmentPicker({
  options,
  index,
  onChange,
}: {
  options: Attachment[];
  index: number;
  onChange: (i: number) => void;
}) {
  const [w, setW] = useState(0);
  const ref = useRef<FlatList<Attachment>>(null);
  const cur = useRef(index);
  cur.current = index;

  useEffect(() => {
    if (w > 0) ref.current?.scrollToIndex({ index, animated: false });
  }, [w]);

  const goTo = (i: number) => {
    onChange(i);
    ref.current?.scrollToOffset({ offset: i * w, animated: true });
  };

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <FlatList
          ref={ref}
          data={options}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(a) => a.id}
          getItemLayout={(_, i) => ({ length: w, offset: w * i, index: i })}
          initialScrollIndex={index}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / w);
            if (i !== cur.current) onChange(i);
          }}
          renderItem={({ item }) => (
            <View style={{ width: w, alignItems: 'center' }}>
              <View style={styles.imgBox}>
                <Image source={item.image} style={styles.img} resizeMode="contain" />
              </View>
              <Text style={styles.name}>{item.name}</Text>
            </View>
          )}
        />
      )}
      <View style={styles.dots}>
        {options.map((a, i) => (
          <Pressable key={a.id} hitSlop={8} onPress={() => goTo(i)}>
            <View style={[styles.dot, i === index && styles.dotOn]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  imgBox: {
    width: 220,
    height: 190,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  img: { width: 190, height: 160 },
  name: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 9, marginTop: 16 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#3a3f48' },
  dotOn: { backgroundColor: '#5AB0FF', width: 22 },
});
