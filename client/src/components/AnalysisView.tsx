import { useEffect, useState } from 'react';
import { fetchAnalysis } from '../api';
import type { TopicAnalysis } from '../api';

export default function AnalysisView() {
  const [data, setData] = useState<TopicAnalysis | null>(null);

  useEffect(() => {
    fetchAnalysis().then(setData);
  }, []);

  if (!data) {
    return <div className="analysis-view pixel-panel analysis-loading">Loading analysis…</div>;
  }

  const maxCount = Math.max(1, ...data.importantTopics.map((t) => t.count));
  const unsolvedCount = data.importantTopics.filter((t) => t.count === 0).length;

  return (
    <div className="analysis-view pixel-panel">
      <div className="analysis-header">
        <h2>TOPIC ANALYSIS</h2>
        <span className="analysis-summary">
          {data.totalSolved} solved &middot; {unsolvedCount} core topics untouched
        </span>
      </div>

      <div className="analysis-bars">
        {data.importantTopics.map((t) => (
          <div key={t.slug} className={`analysis-row ${t.count === 0 ? 'unsolved' : ''}`}>
            <span className="analysis-label">{t.name}</span>
            <div className="analysis-bar-track">
              <div
                className="analysis-bar-fill"
                style={{ width: `${Math.max(3, (t.count / maxCount) * 100)}%` }}
              />
            </div>
            <span className="analysis-count">{t.count}</span>
          </div>
        ))}
      </div>

      {data.allTags.length > 0 && (
        <>
          <h3 className="analysis-subheading">Everything you've touched</h3>
          <div className="tag-row analysis-all-tags">
            {data.allTags.map((t) => (
              <span key={t.name} className="tag-chip">
                {t.name} ({t.count})
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
