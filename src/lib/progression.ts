// XP acumulado necessário para alcançar cada nível (índice = nível - 1)
// Fórmula: incremento(N) = 300·N + 20·N²  →  XP cumulativo = 150·L·(L-1) + (10/3)·L·(L-1)·(2L-1)
// Design de progressão (XP necessário por nível, ~6-18 kills do boss equivalente):
//   Lv 1-5  : 320 → 2 000 XP por nível
//   Lv 6-10 : 2 520 → 4 320 XP por nível
//   Lv 11-15: 5 000 → 8 120 XP por nível  (Salamandra lv12: ~6 kills)
//   Lv 16-20: 9 920 → 12 920 XP por nível
//   Lv 21-30: 14 000 → 25 720 XP por nível
//   Lv 31-40: 27 000 → 42 120 XP por nível
//   Lv 41-50: 44 000 → 62 720 XP por nível
//   Lv 51-60: 65 000 → 87 320 XP por nível (Entidade Vazio lv60: ~18 kills)
export const XP_TABLE = [
//    Lv1      Lv2      Lv3      Lv4      Lv5      Lv6      Lv7      Lv8      Lv9     Lv10
        0,     320,    1000,    2080,    3600,    5600,    8120,   11200,   14880,   19200,
//   Lv11     Lv12     Lv13     Lv14     Lv15     Lv16     Lv17     Lv18     Lv19     Lv20
    24200,   29920,   36400,   43680,   51800,   60800,   70720,   81600,   93480,  106400,
//   Lv21     Lv22     Lv23     Lv24     Lv25     Lv26     Lv27     Lv28     Lv29     Lv30
   120400,  135520,  151800,  169280,  188000,  208000,  229320,  252000,  276080,  301600,
//   Lv31     Lv32     Lv33     Lv34     Lv35     Lv36     Lv37     Lv38     Lv39     Lv40
   328600,  357120,  387200,  418880,  452200,  487200,  523920,  562400,  602680,  644800,
//   Lv41     Lv42     Lv43     Lv44     Lv45     Lv46     Lv47     Lv48     Lv49     Lv50
   688800,  734720,  782600,  832480,  884400,  938400,  994520, 1052800, 1113280, 1176000,
//   Lv51     Lv52     Lv53     Lv54     Lv55     Lv56     Lv57     Lv58     Lv59     Lv60
  1241000, 1308320, 1378000, 1450080, 1524600, 1601600, 1681120, 1763200, 1847880, 1935200,
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
