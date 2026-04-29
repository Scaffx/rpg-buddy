// XP acumulado necessário para alcançar cada nível (índice = nível - 1)
// Incremento por nível:
//   Lv 1-10 : 80 → 205 XP  (progressão suave)
//   Lv 10→11: 215 | 11→12: 225 | 12→13: 240  (conforme design)
//   Acima do 13: aumenta ~15-50 XP a cada nível
export const XP_TABLE = [
     0,   80,  180,  300,  440,  600,  775,  960, 1155, 1360,  // Níveis 1-10
  1575, 1800, 2040, 2295, 2565, 2855, 3165, 3495, 3850, 4230,  // Níveis 11-20
  4640, 5080, 5555, 6065, 6615, 7205, 7840, 8520, 9250,10035,  // Níveis 21-30
 10875,11775,                                                   // Níveis 31-32
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

export function getLevelProgress(totalXp: number) {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const level = getLevelFromXp(safeXp);
  const levelIndex = Math.max(0, level - 1);
  const levelStartXp = XP_TABLE[levelIndex] ?? 0;
  const nextLevelXp = XP_TABLE[levelIndex + 1] ?? null;

  if (nextLevelXp === null) {
    const previousLevelXp = XP_TABLE[levelIndex - 1] ?? 0;
    const xpForNextLevel = Math.max(1, levelStartXp - previousLevelXp);

    return {
      level,
      currentLevelXp: xpForNextLevel,
      xpForNextLevel,
      progressPercent: 100,
      isMaxLevel: true,
    };
  }

  const xpForNextLevel = Math.max(1, nextLevelXp - levelStartXp);
  const currentLevelXp = Math.min(xpForNextLevel, Math.max(0, safeXp - levelStartXp));

  return {
    level,
    currentLevelXp,
    xpForNextLevel,
    progressPercent: Math.min(100, (currentLevelXp / xpForNextLevel) * 100),
    isMaxLevel: false,
  };
}
