import { Box, Card, CardContent, Typography, Stack } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';

// ── Shared helpers ────────────────────────────────────────────────────────────
const W = 600;
const PAD = { top: 12, right: 16, bottom: 44, left: 72 };
const innerW = W - PAD.left - PAD.right;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / exp) * exp;
}

function yTicks(maxVal: number, count = 4) {
  return Array.from({ length: count + 1 }, (_, i) => (maxVal / count) * i);
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────
interface KPITileProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'success' | 'error' | 'info' | 'warning' | 'default';
}

export function KPITile({ label, value, subValue, trend, color = 'default' }: KPITileProps) {
  const colorMap = {
    success: 'success.main',
    error:   'error.main',
    info:    'info.main',
    warning: 'warning.main',
    default: 'text.primary',
  };
  const TrendIcon = trend === 'up' ? TrendingUpIcon : trend === 'down' ? TrendingDownIcon : TrendingFlatIcon;
  return (
    <Card sx={{ flex: 1, minWidth: 140 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
        <Typography variant="h6" fontWeight={700} color={colorMap[color]}
          sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.3, mt: 0.25 }}>
          {value}
        </Typography>
        {(subValue || trend) && (
          <Stack direction="row" alignItems="center" gap={0.25} mt={0.25}>
            {trend && <TrendIcon sx={{ fontSize: 14, color: trend === 'up' ? 'success.main' : trend === 'down' ? 'error.main' : 'text.disabled' }} />}
            {subValue && <Typography variant="caption" color="text.secondary">{subValue}</Typography>}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────
interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  formatValue?: (v: number) => string;
  title?: string;
}

export function BarChart({ data, height = 200, formatValue, title }: BarChartProps) {
  if (data.length === 0) return null;
  const H = height;
  const innerH = H - PAD.top - PAD.bottom;
  const maxVal = niceMax(Math.max(...data.map(d => d.value), 1));
  const ticks  = yTicks(maxVal);
  const barW   = Math.max(4, Math.min(36, (innerW / data.length) * 0.6));
  const fmt    = formatValue ?? ((v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 0 }));

  function scaleY(v: number) { return innerH - (v / maxVal) * innerH; }

  return (
    <Box>
      {title && <Typography variant="caption" color="text.secondary" mb={1} display="block">{title}</Typography>}
      <Box sx={{ overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ fontFamily: 'inherit', fontSize: 11, display: 'block' }}>
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {ticks.map(t => {
              const y = scaleY(t);
              return (
                <g key={t}>
                  <line x1={0} y1={y} x2={innerW} y2={y} stroke="currentColor" strokeOpacity={0.08} />
                  <text x={-8} y={y + 4} textAnchor="end" fill="currentColor" fillOpacity={0.5} fontSize={10}>
                    {fmt(t)}
                  </text>
                </g>
              );
            })}
            {data.map((d, i) => {
              const cx = i * (innerW / data.length) + (innerW / data.length) / 2;
              const bH = Math.max(0, innerH - scaleY(d.value));
              return (
                <g key={i}>
                  {bH > 0 && (
                    <rect x={cx - barW / 2} y={scaleY(d.value)} width={barW} height={bH}
                      fill={d.color ?? '#546e7a'} fillOpacity={0.85} rx={3}>
                      <title>{d.label}: {fmt(d.value)}</title>
                    </rect>
                  )}
                  <text x={cx} y={innerH + 16} textAnchor="middle" fill="currentColor" fillOpacity={0.6} fontSize={10}>
                    {d.label}
                  </text>
                </g>
              );
            })}
            <line x1={0} y1={0} x2={0} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />
            <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />
          </g>
        </svg>
      </Box>
    </Box>
  );
}

// ── Grouped Bar Chart ─────────────────────────────────────────────────────────
interface GroupedBarChartProps {
  data: { label: string; values: { key: string; value: number; color: string }[] }[];
  height?: number;
  formatValue?: (v: number) => string;
  legend?: { key: string; label: string; color: string }[];
}

export function GroupedBarChart({ data, height = 220, formatValue, legend }: GroupedBarChartProps) {
  if (data.length === 0) return null;
  const H = height;
  const innerH = H - PAD.top - PAD.bottom;
  const maxVal = niceMax(Math.max(...data.flatMap(d => d.values.map(v => v.value)), 1));
  const ticks  = yTicks(maxVal);
  const groupW = innerW / data.length;
  const seriesCount = data[0]?.values?.length ?? 1;
  const barW   = Math.max(3, Math.min(24, (groupW / (seriesCount + 0.5)) * 0.8));
  const gap    = 2;
  const fmt    = formatValue ?? ((v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 0 }));

  function scaleY(v: number) { return innerH - (v / maxVal) * innerH; }

  return (
    <Box>
      <Box sx={{ overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ fontFamily: 'inherit', fontSize: 11, display: 'block' }}>
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {ticks.map(t => {
              const y = scaleY(t);
              return (
                <g key={t}>
                  <line x1={0} y1={y} x2={innerW} y2={y} stroke="currentColor" strokeOpacity={0.08} />
                  <text x={-8} y={y + 4} textAnchor="end" fill="currentColor" fillOpacity={0.5} fontSize={10}>
                    {fmt(t)}
                  </text>
                </g>
              );
            })}
            {data.map((group, gi) => {
              const cx = gi * groupW + groupW / 2;
              const totalBarW = seriesCount * barW + (seriesCount - 1) * gap;
              return (
                <g key={gi}>
                  {group.values.map((v, vi) => {
                    const bH = Math.max(0, innerH - scaleY(v.value));
                    const bX = cx - totalBarW / 2 + vi * (barW + gap);
                    return (
                      <g key={vi}>
                        {bH > 0 && (
                          <rect x={bX} y={scaleY(v.value)} width={barW} height={bH}
                            fill={v.color} fillOpacity={0.85} rx={2}>
                            <title>{group.label} — {fmt(v.value)}</title>
                          </rect>
                        )}
                      </g>
                    );
                  })}
                  <text x={cx} y={innerH + 16} textAnchor="middle" fill="currentColor" fillOpacity={0.6} fontSize={10}>
                    {group.label}
                  </text>
                </g>
              );
            })}
            <line x1={0} y1={0} x2={0} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />
            <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />
          </g>
        </svg>
      </Box>
      {legend && legend.length > 0 && (
        <Stack direction="row" gap={2} mt={1} flexWrap="wrap" justifyContent="center">
          {legend.map(l => (
            <Stack key={l.key} direction="row" alignItems="center" gap={0.5}>
              <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: l.color, opacity: 0.85 }} />
              <Typography variant="caption" color="text.secondary">{l.label}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

// ── Line Chart ────────────────────────────────────────────────────────────────
interface LineSeries {
  label: string;
  data: { label: string; value: number }[];
  color: string;
}

interface LineChartProps {
  series: LineSeries[];
  height?: number;
  formatValue?: (v: number) => string;
  formatYAxis?: (v: number) => string;
}

export function LineChart({ series, height = 200, formatValue, formatYAxis }: LineChartProps) {
  if (series.length === 0 || series[0].data.length === 0) return null;
  const H = height;
  const innerH = H - PAD.top - PAD.bottom;
  const allVals = series.flatMap(s => s.data.map(d => d.value));
  const minVal = Math.min(...allVals);
  const maxVal = niceMax(Math.max(...allVals, 1));
  const effectiveMin = minVal < 0 ? -niceMax(Math.abs(minVal)) : 0;
  const range = maxVal - effectiveMin;
  const labels = series[0].data.map(d => d.label);
  const ticks  = yTicks(maxVal - effectiveMin).map(t => t + effectiveMin);
  const fmt    = formatValue ?? ((v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 0 }));
  const fmtY   = formatYAxis ?? fmt;

  function scaleY(v: number) { return innerH - ((v - effectiveMin) / range) * innerH; }
  function scaleX(i: number) { return i * (innerW / (labels.length - 1 || 1)); }

  const zeroY = scaleY(0);

  return (
    <Box>
      <Box sx={{ overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ fontFamily: 'inherit', fontSize: 11, display: 'block' }}>
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {ticks.map(t => {
              const y = scaleY(t);
              return (
                <g key={t}>
                  <line x1={0} y1={y} x2={innerW} y2={y} stroke="currentColor"
                    strokeOpacity={t === 0 ? 0.3 : 0.08} strokeDasharray={t === 0 ? 'none' : '3,3'} />
                  <text x={-8} y={y + 4} textAnchor="end" fill="currentColor" fillOpacity={0.5} fontSize={10}>
                    {fmtY(t)}
                  </text>
                </g>
              );
            })}
            {effectiveMin < 0 && (
              <line x1={0} y1={zeroY} x2={innerW} y2={zeroY} stroke="currentColor" strokeOpacity={0.4} />
            )}
            {series.map((s, si) => {
              const points = s.data.map((d, i) => `${scaleX(i)},${scaleY(d.value)}`).join(' ');
              return (
                <g key={si}>
                  <polyline points={points} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {s.data.map((d, i) => (
                    <circle key={i} cx={scaleX(i)} cy={scaleY(d.value)} r={3} fill={s.color}>
                      <title>{d.label}: {fmt(d.value)}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
            {labels.map((l, i) => (
              <text key={i} x={scaleX(i)} y={innerH + 16} textAnchor="middle" fill="currentColor" fillOpacity={0.6} fontSize={10}>
                {l}
              </text>
            ))}
            <line x1={0} y1={0} x2={0} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />
            <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="currentColor" strokeOpacity={0.2} />
          </g>
        </svg>
      </Box>
      {series.length > 1 && (
        <Stack direction="row" gap={2} mt={1} flexWrap="wrap" justifyContent="center">
          {series.map(s => (
            <Stack key={s.label} direction="row" alignItems="center" gap={0.5}>
              <Box sx={{ width: 16, height: 2, bgcolor: s.color, borderRadius: 1 }} />
              <Typography variant="caption" color="text.secondary">{s.label}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  centerLabel?: string;
}

export function DonutChart({ segments, size = 140, centerLabel }: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: size }}>
      <Typography variant="caption" color="text.disabled">—</Typography>
    </Stack>
  );

  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.38;
  const ri = size * 0.24;

  function polarToCartesian(angle: number, radius: number) {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(startAngle: number, endAngle: number) {
    const outerStart = polarToCartesian(startAngle, r);
    const outerEnd   = polarToCartesian(endAngle,   r);
    const innerStart = polarToCartesian(startAngle, ri);
    const innerEnd   = polarToCartesian(endAngle,   ri);
    const large = (endAngle - startAngle) > 180 ? 1 : 0;
    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${r} ${r} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A ${ri} ${ri} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
      'Z',
    ].join(' ');
  }

  let currentAngle = 0;
  const arcs = segments.filter(s => s.value > 0).map(seg => {
    const sweep = (seg.value / total) * 360;
    const start = currentAngle;
    currentAngle += sweep;
    return { ...seg, path: arcPath(start, currentAngle - 0.5) };
  });

  return (
    <Stack direction="row" alignItems="center" gap={2}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {arcs.map((arc, i) => (
          <path key={i} d={arc.path} fill={arc.color} fillOpacity={0.87}>
            <title>{arc.label}: {arc.value}</title>
          </path>
        ))}
        {centerLabel && (
          <text x={cx} y={cy + 4} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>
            {centerLabel}
          </text>
        )}
      </svg>
      <Stack gap={0.5}>
        {segments.filter(s => s.value > 0).map(seg => (
          <Stack key={seg.label} direction="row" alignItems="center" gap={0.75}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: seg.color, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" noWrap>{seg.label}: <strong>{seg.value}</strong></Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
