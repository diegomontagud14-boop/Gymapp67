// Enganches / agarres de polea. Las imágenes son PNG con fondo transparente en
// src/assets/attachments/<id>.png (sustituye los de ejemplo por los tuyos, con el mismo nombre).

export type Attachment = { id: string; name: string; image: number };

const A = {
  neutro: { id: 'neutro', name: 'Agarre neutro', image: require('../assets/attachments/neutro.png') },
  v: { id: 'v', name: 'Agarre en V', image: require('../assets/attachments/v.png') },
  jalon_barra_recta: {
    id: 'jalon_barra_recta',
    name: 'Barra recta de jalón al pecho',
    image: require('../assets/attachments/jalon_barra_recta.png'),
  },
  neutro_abierto: {
    id: 'neutro_abierto',
    name: 'Agarre neutro abierto',
    image: require('../assets/attachments/neutro_abierto.png'),
  },
  abierto_medio: {
    id: 'abierto_medio',
    name: 'Agarre abierto medio',
    image: require('../assets/attachments/abierto_medio.png'),
  },
  neutro_cerrado: {
    id: 'neutro_cerrado',
    name: 'Agarre neutro cerrado',
    image: require('../assets/attachments/neutro_cerrado.png'),
  },
  unilateral: { id: 'unilateral', name: 'Unilateral', image: require('../assets/attachments/unilateral.png') },
  cuerda: { id: 'cuerda', name: 'Cuerda', image: require('../assets/attachments/cuerda.png') },
  triangulo: { id: 'triangulo', name: 'Triángulo', image: require('../assets/attachments/triangulo.png') },
  barra_recta: { id: 'barra_recta', name: 'Barra recta', image: require('../assets/attachments/barra_recta.png') },
  barra_ez: { id: 'barra_ez', name: 'Barra EZ', image: require('../assets/attachments/barra_ez.png') },
  triangulo_largo: {
    id: 'triangulo_largo',
    name: 'Triángulo largo',
    image: require('../assets/attachments/triangulo_largo.png'),
  },
  munequera: { id: 'munequera', name: 'Muñequera', image: require('../assets/attachments/munequera.png') },
  triangulo_barra_recta: {
    id: 'triangulo_barra_recta',
    name: 'Triángulo con barra recta',
    image: require('../assets/attachments/triangulo_barra_recta.png'),
  },
} satisfies Record<string, Attachment>;

export const ATTACH_BACK: Attachment[] = [
  A.neutro,
  A.v,
  A.jalon_barra_recta,
  A.neutro_abierto,
  A.abierto_medio,
  A.neutro_cerrado,
  A.unilateral,
];
export const ATTACH_CABLE: Attachment[] = [
  A.unilateral,
  A.cuerda,
  A.triangulo,
  A.barra_recta,
  A.barra_ez,
  A.triangulo_largo,
  A.munequera,
  A.triangulo_barra_recta,
];

export const ATTACH_BY_ID: Record<string, Attachment> = A;

// Lista ordenada: primero las de espalda si el ejercicio es de espalda, si no primero las de polea
export const attachmentsFor = (group?: string): Attachment[] => {
  const first = group === 'Espalda' ? ATTACH_BACK : ATTACH_CABLE;
  const second = group === 'Espalda' ? ATTACH_CABLE : ATTACH_BACK;
  const seen = new Set<string>();
  return [...first, ...second].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
};
