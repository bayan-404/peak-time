import { DAYS, formatHour } from "@/lib/analyze";

type Props = {
  heatmap: (number | null)[][];
  counts: number[][];
  blockHours: 1 | 3;
};

// A heatmap is just a grid of colored cells, so no chart library needed.
export default function Heatmap({ heatmap, counts, blockHours }: Props) {
  const max = Math.max(...heatmap.flat().map((v) => v ?? 0), 0);
  const hours = Array.from({ length: 24 / blockHours }, (_, i) => i * blockHours);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-1 min-w-[560px]"
        style={{ gridTemplateColumns: `3rem repeat(${hours.length}, minmax(0, 1fr))` }}
      >
        <div />
        {hours.map((h) => (
          <div key={h} className="text-[10px] text-center opacity-60">
            {h % (blockHours === 1 ? 3 : 1) === 0 ? formatHour(h) : ""}
          </div>
        ))}

        {DAYS.map((day, d) => (
          <Row key={day} label={day}>
            {hours.map((h) => {
              const v = heatmap[d][h];
              const intensity = v === null || max === 0 ? 0 : v / max;
              return (
                <div
                  key={h}
                  title={
                    v === null
                      ? `${day} ${formatHour(h)}: no posts`
                      : `${day} ${formatHour(h)}: ${counts[d][h]} post(s)`
                  }
                  className="aspect-square rounded-sm border border-black/5 dark:border-white/10"
                  style={{
                    background:
                      v === null
                        ? "transparent"
                        : `color-mix(in oklab, var(--accent) ${Math.round(15 + intensity * 85)}%, transparent)`,
                  }}
                />
              );
            })}
          </Row>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-xs self-center opacity-70">{label}</div>
      {children}
    </>
  );
}
