import type { Shoe, ShoeType } from './types';

export const shoeTypes: { code: ShoeType; label: string }[] = [
  { code: 'daily', label: '日常训练鞋' },
  { code: 'speed', label: '速度训练鞋' },
  { code: 'race', label: '竞速鞋' },
  { code: 'trail', label: '越野鞋' },
  { code: 'other', label: '其他' },
];
export const shoeLabel = (shoe: Shoe) =>
  `${shoe.brand} ${shoe.model} · ${shoe.nickname}`;
export const shoeTypeLabel = (type: ShoeType | null) =>
  shoeTypes.find((option) => option.code === type)?.label ?? '';
export const normalizeShoeText = (text: string) => text.trim().toLowerCase();
export function sameShoeModel(
  a: Pick<Shoe, 'brand' | 'model'>,
  b: Pick<Shoe, 'brand' | 'model'>,
) {
  return (
    normalizeShoeText(a.brand) === normalizeShoeText(b.brand) &&
    normalizeShoeText(a.model) === normalizeShoeText(b.model)
  );
}
export function suggestedNickname(
  shoes: readonly Shoe[],
  brand: string,
  model: string,
) {
  const siblings = shoes.filter((shoe) =>
    sameShoeModel(shoe, { brand, model }),
  );
  let number = siblings.length + 1;
  while (
    siblings.some((shoe) => normalizeShoeText(shoe.nickname) === `${number}号`)
  )
    number++;
  return `${number}号`;
}
