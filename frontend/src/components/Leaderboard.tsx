import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { getStats, type SummaryEntry } from '../lib/api';

interface LeaderboardProps {
  refreshSignal: number;
}

export default function Leaderboard({ refreshSignal }: LeaderboardProps) {
  const [entries, setEntries] = useState<SummaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    getStats()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  if (loading && entries.length === 0) return null;
  if (entries.length === 0) return null;

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center gap-2 text-gray-200">
        <Trophy className="size-5 text-amber-400" />
        <h2 className="text-sm font-semibold">Top contributors</h2>
      </div>
      <ul className="space-y-2">
        {entries.slice(0, 8).map((entry, i) => (
          <li key={entry.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-gray-300">
              <span className="w-5 text-right text-xs text-gray-500">{i + 1}</span>
              {entry.name}
            </span>
            <span className="font-medium text-purple-300">{entry.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
