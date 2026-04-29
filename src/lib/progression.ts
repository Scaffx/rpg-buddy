// XP acumulado necessário para alcançar cada nível (índice = nível - 1)
// Design de progressão:
//   Lv 1-5  : 80-140 XP por nível (fase inicial, antes da primeira classe)
//   Lv 5-10 : 160-205 XP por nível (pré-escala, primeiras classes)
//   Lv 10+  : escala progressiva — 240 → 400 → 700 → 1200 → 2000+ XP por nível
//   Nunca fica fixo em 200 XP; quanto mais alto o nível, maior o esforço.
export const XP_TABLE = [
//  Lv1   Lv2   Lv3   Lv4   Lv5   Lv6   Lv7   Lv8   Lv9  Lv10
      0,   80,  180,  300,  440,  600,  775,  960, 1155, 1360,
//  Lv11  Lv12  Lv13  Lv14  Lv15  Lv16  Lv17  Lv18  Lv19  Lv20
   1600, 1870, 2175, 2520, 2910, 3350, 3845, 4400, 5020, 5710,
//  Lv21  Lv22  Lv23  Lv24  Lv25  Lv26  Lv27  Lv28  Lv29  Lv30
   6480, 7340, 8300, 9380,10590,11950,13470,15180,17100,19260,
//  Lv31  Lv32  Lv33  Lv34  Lv35  Lv36  Lv37  Lv38  Lv39  Lv40
  21700,24450,27550,31050,35000,39450,44450,50050,56350,63450,
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
