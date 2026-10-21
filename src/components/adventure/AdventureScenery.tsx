import type { AdventureBiome } from '@/lib/adventureVisuals';

export function AdventureScenery({ biome }: { biome: AdventureBiome }) {
  return <div className={`adventure-scenery scenery-${biome}`} aria-hidden="true">
    <div className="adventure-scene-sky" aria-hidden="true"><span className="adventure-sun" /><span className="adventure-cloud cloud-one" /><span className="adventure-cloud cloud-two" /></div>
    <div className="adventure-scene-far" aria-hidden="true" /><div className="adventure-scene-middle" aria-hidden="true" />
    <div className="adventure-scene-ground" aria-hidden="true"><span className="adventure-path" /><span className="adventure-ground-detail detail-one" /><span className="adventure-ground-detail detail-two" /><span className="adventure-ground-detail detail-three" /></div>
  </div>;
}
