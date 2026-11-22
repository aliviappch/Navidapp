import { randomInt } from 'node:crypto';

// Mezcla Fisher-Yates y asigna cada persona a la siguiente del círculo:
// nadie se saca a sí mismo y todos regalan y reciben exactamente una vez.
export function draw(ids) {
  if (ids.length < 3) throw new Error('Se necesitan al menos 3 participantes');
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.map((giver, i) => [giver, a[(i + 1) % a.length]]);
}
