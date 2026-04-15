export const XP_TABLE = [
  0, 200, 350, 500, 700, 950, 1250, 1600, 2000, 2450, 2950, 3500, 4100, 4750,
  5450, 6200, 7000, 7850, 8750, 9700, 10700, 11750, 12850, 14000, 15200, 16450,
  17750, 19100, 20500, 21950, 23450, 25000,
] as const;

export function getLevelFromXp(totalXp: number): number {
  const safeXp = Math.max(0, Math.floor(totalXp));

  for (let i = XP_TABLE.length - 1; i > 0; i--) {
    if (safeXp >= XP_TABLE[i]) {
      return i + 1;
    }
  }

  return 1;
}
