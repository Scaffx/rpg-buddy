export function RealmCreatureEye({ x, y, r = 2.7 }: { x: number; y: number; r?: number }) {
  return <g stroke="none"><ellipse cx={x} cy={y} rx={r} ry={r + .6} fill="#293244"/><circle cx={x + .7} cy={y - 1} r=".9" fill="#fff9ee"/></g>;
}
