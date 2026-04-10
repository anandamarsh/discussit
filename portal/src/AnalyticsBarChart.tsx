import { useState } from "react";

export type AnalyticsChartSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export type AnalyticsChartBar = {
  key: string;
  label: string;
  total: number;
  summary?: string;
  segments: AnalyticsChartSegment[];
};

function defaultValueFormatter(value: number) {
  return `${value}`;
}

export function AnalyticsBarChart({
  bars,
  emptyLabel,
  valueFormatter = defaultValueFormatter,
}: {
  bars: AnalyticsChartBar[];
  emptyLabel: string;
  valueFormatter?: (value: number) => string;
}) {
  const [activeBarKey, setActiveBarKey] = useState<string | null>(null);
  const maxValue = Math.max(...bars.map((item) => item.total), 0);
  const activeBar = bars.find((item) => item.key === activeBarKey) ?? null;

  if (bars.length === 0 || maxValue <= 0) {
    return <div className="empty-state analytics-empty">{emptyLabel}</div>;
  }

  return (
    <div className="analytics-chart-shell">
      <div className="analytics-chart-scroll">
        <div
          className="analytics-chart"
          style={{ width: `${Math.max(100, bars.length * 82)}px` }}
        >
          {bars.map((bar) => {
            const barHeight = Math.max((bar.total / maxValue) * 100, bar.total > 0 ? 6 : 0);
            const isActive = activeBar?.key === bar.key;

            return (
              <button
                key={bar.key}
                type="button"
                className={`analytics-chart-column ${isActive ? "is-active" : ""}`}
                onMouseEnter={() => setActiveBarKey(bar.key)}
                onMouseLeave={() => setActiveBarKey((current) => (current === bar.key ? null : current))}
                onFocus={() => setActiveBarKey(bar.key)}
                onBlur={() => setActiveBarKey((current) => (current === bar.key ? null : current))}
              >
                <span className="analytics-chart-value">{valueFormatter(bar.total)}</span>
                <span className="analytics-chart-track">
                  <span className="analytics-chart-fill" style={{ height: `${barHeight}%` }}>
                    {bar.segments.map((segment) => {
                      const segmentHeight = bar.total > 0 ? (segment.value / bar.total) * 100 : 0;
                      if (segmentHeight <= 0) {
                        return null;
                      }

                      return (
                        <span
                          key={segment.key}
                          className="analytics-chart-segment"
                          style={{
                            height: `${segmentHeight}%`,
                            background: segment.color,
                          }}
                        />
                      );
                    })}
                  </span>
                </span>
                <span className="analytics-chart-label">{bar.label}</span>
                {isActive ? (
                  <span className="analytics-chart-tooltip" role="status">
                    <strong>{bar.label}</strong>
                    <small>{valueFormatter(bar.total)}</small>
                    {bar.summary ? <small>{bar.summary}</small> : null}
                    {bar.segments.map((segment) => (
                      <span key={segment.key} className="analytics-chart-tooltip-row">
                        <span className="analytics-chart-tooltip-key">
                          <span
                            className="analytics-chart-tooltip-dot"
                            style={{ background: segment.color }}
                          />
                          {segment.label}
                        </span>
                        <span>{valueFormatter(segment.value)}</span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
