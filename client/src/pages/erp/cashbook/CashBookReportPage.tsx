import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, Table,
  TableHead, TableBody, TableRow, TableCell, CircularProgress, Alert,
  Select, MenuItem, FormControl, InputLabel, TextField, Divider,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { cashbookApi, type CashBookEntry } from '../../../api/cashbook';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

type Preset = { key: string; label: { de: string; en: string }; from: string; to: string };

function buildPresets(): Preset[] {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth(); // 0-based
  const presets: Preset[] = [
    {
      key: 'cur_month',
      label: { de: 'Aktueller Monat', en: 'Current month' },
      from: isoDate(new Date(y, m, 1)),
      to:   isoDate(new Date(y, m + 1, 0)),
    },
    {
      key: 'last_month',
      label: { de: 'Letzter Monat', en: 'Last month' },
      from: isoDate(new Date(y, m - 1, 1)),
      to:   isoDate(new Date(y, m, 0)),
    },
    { key: 'q1', label: { de: 'Q1', en: 'Q1' }, from: `${y}-01-01`, to: `${y}-03-31` },
    { key: 'q2', label: { de: 'Q2', en: 'Q2' }, from: `${y}-04-01`, to: `${y}-06-30` },
    { key: 'q3', label: { de: 'Q3', en: 'Q3' }, from: `${y}-07-01`, to: `${y}-09-30` },
    { key: 'q4', label: { de: 'Q4', en: 'Q4' }, from: `${y}-10-01`, to: `${y}-12-31` },
    { key: 'year', label: { de: 'Gesamtes Jahr', en: 'Full year' }, from: `${y}-01-01`, to: `${y}-12-31` },
    { key: 'custom', label: { de: 'Benutzerdefiniert', en: 'Custom' }, from: '', to: '' },
  ];
  return presets;
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────
interface ChartBucket { label: string; receiptCents: number; paymentCents: number }

function BarChart({ buckets, locale }: { buckets: ChartBucket[]; locale: string }) {
  if (buckets.length === 0) return null;
  const W = 580; const H = 200; const PAD = { top: 10, right: 10, bottom: 40, left: 70 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...buckets.flatMap(b => [b.receiptCents, b.paymentCents]), 1);
  const groupW = innerW / buckets.length;
  const barW   = Math.max(4, Math.min(20, groupW * 0.35));
  const gap    = 2;

  function scaleY(cents: number) { return innerH - (cents / maxVal) * innerH; }

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((maxVal / tickCount) * i)
  );

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ fontFamily: 'inherit', fontSize: 11 }}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Y axis ticks */}
          {ticks.map(t => {
            const y = scaleY(t);
            const label = t >= 100 ? `${Math.round(t / 100)} €` : `0 €`;
            return (
              <g key={t}>
                <line x1={0} y1={y} x2={innerW} y2={y} stroke="currentColor" strokeOpacity={0.1} />
                <text x={-6} y={y + 4} textAnchor="end" fill="currentColor" fillOpacity={0.5} fontSize={10}>
                  {(t / 100).toLocaleString(locale, { maximumFractionDigits: 0 })}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {buckets.map((b, i) => {
            const cx     = i * groupW + groupW / 2;
            const rH     = Math.max(0, innerH - scaleY(b.receiptCents));
            const pH     = Math.max(0, innerH - scaleY(b.paymentCents));
            const rX     = cx - barW - gap / 2;
            const pX     = cx + gap / 2;
            return (
              <g key={i}>
                {rH > 0 && (
                  <rect x={rX} y={scaleY(b.receiptCents)} width={barW} height={rH}
                    fill="#4caf50" fillOpacity={0.8} rx={2} />
                )}
                {pH > 0 && (
                  <rect x={pX} y={scaleY(b.paymentCents)} width={barW} height={pH}
                    fill="#f44336" fillOpacity={0.8} rx={2} />
                )}
                <text x={cx} y={innerH + 14} textAnchor="middle" fill="currentColor" fillOpacity={0.7} fontSize={10}>
                  {b.label}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line x1={0} y1={0} x2={0} y2={innerH} stroke="currentColor" strokeOpacity={0.3} />
          <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="currentColor" strokeOpacity={0.3} />
        </g>

        {/* Legend */}
        <g transform={`translate(${PAD.left + 10},${H - 10})`}>
          <rect x={0} y={-8} width={10} height={10} fill="#4caf50" fillOpacity={0.8} rx={2} />
          <text x={14} y={0} fill="currentColor" fillOpacity={0.7} fontSize={10}>
            {locale === 'de-DE' ? 'Einnahmen' : 'Receipts'}
          </text>
          <rect x={80} y={-8} width={10} height={10} fill="#f44336" fillOpacity={0.8} rx={2} />
          <text x={94} y={0} fill="currentColor" fillOpacity={0.7} fontSize={10}>
            {locale === 'de-DE' ? 'Ausgaben' : 'Payments'}
          </text>
        </g>
      </svg>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CashBookReportPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const presets = useMemo(buildPresets, []);
  const [preset,    setPreset]    = useState('cur_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  const selectedPreset = presets.find(p => p.key === preset)!;
  const from = preset === 'custom' ? customFrom : selectedPreset.from;
  const to   = preset === 'custom' ? customTo   : selectedPreset.to;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cashbook-report', from, to],
    queryFn:  () => cashbookApi.list({ from: from || undefined, to: to || undefined, limit: 500 }),
    enabled:  !!(from && to),
  });

  const entries: (CashBookEntry & { runningBalance?: number })[] = data?.data?.entries ?? [];

  const totalReceipts = entries.filter(e => e.type === 'receipt').reduce((s, e) => s + e.amountCents, 0);
  const totalPayments = entries.filter(e => e.type === 'payment').reduce((s, e) => s + e.amountCents, 0);
  const netBalance    = totalReceipts - totalPayments;

  // Build chart buckets
  const buckets = useMemo((): ChartBucket[] => {
    if (entries.length === 0) return [];
    const daySpan = from && to
      ? (new Date(to).getTime() - new Date(from).getTime()) / 86400000
      : 0;
    const useDaily = daySpan <= 31;

    if (useDaily) {
      const map = new Map<string, ChartBucket>();
      entries.forEach(e => {
        const d   = e.date.slice(0, 10);
        const day = new Date(d).getDate().toString();
        if (!map.has(d)) map.set(d, { label: day, receiptCents: 0, paymentCents: 0 });
        const b = map.get(d)!;
        if (e.type === 'receipt') b.receiptCents += e.amountCents;
        else                      b.paymentCents += e.amountCents;
      });
      return Array.from(map.values());
    } else {
      const map = new Map<string, ChartBucket>();
      entries.forEach(e => {
        const d    = e.date.slice(0, 7); // YYYY-MM
        const [y, m] = d.split('-');
        const label = `${m}/${y.slice(2)}`;
        if (!map.has(d)) map.set(d, { label, receiptCents: 0, paymentCents: 0 });
        const b = map.get(d)!;
        if (e.type === 'receipt') b.receiptCents += e.amountCents;
        else                      b.paymentCents += e.amountCents;
      });
      return Array.from(map.values());
    }
  }, [entries, from, to]);

  // CSV export
  function downloadCsv() {
    const header = [
      de ? 'Datum' : 'Date',
      de ? 'Nr.' : 'No.',
      de ? 'Art' : 'Type',
      de ? 'Beschreibung' : 'Description',
      de ? 'Kassenkonto' : 'Cash account',
      de ? 'Gegenkonto' : 'Contra account',
      de ? 'MwSt. %' : 'VAT %',
      de ? 'Betrag (€)' : 'Amount (€)',
      de ? 'Saldo (€)' : 'Balance (€)',
    ].join(';');

    const rows = entries.map(e => [
      e.date.slice(0, 10),
      e.entryNumber,
      e.type === 'receipt' ? (de ? 'Einnahme' : 'Receipt') : (de ? 'Ausgabe' : 'Payment'),
      `"${e.description.replace(/"/g, '""')}"`,
      e.cashAccount,
      e.contraAccount,
      e.vatRate,
      ((e.type === 'receipt' ? e.amountCents : -e.amountCents) / 100).toFixed(2).replace('.', ','),
      ((e.runningBalance ?? 0) / 100).toFixed(2).replace('.', ','),
    ].join(';'));

    const csv  = [header, ...rows].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `kassenbuch_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Kassenbuch-Bericht' : 'Cash Book Report'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Periodenauswertung mit Saldo-Entwicklung' : 'Period analysis with running balance'}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={downloadCsv} disabled={entries.length === 0}>
          {de ? 'CSV herunterladen' : 'Download CSV'}
        </Button>
      </Stack>

      {/* Period selector */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" gap={2} flexWrap="wrap" alignItems="flex-end">
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>{de ? 'Zeitraum' : 'Period'}</InputLabel>
              <Select value={preset} label={de ? 'Zeitraum' : 'Period'} onChange={e => setPreset(e.target.value)}>
                {presets.map(p => (
                  <MenuItem key={p.key} value={p.key}>{de ? p.label.de : p.label.en}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {preset === 'custom' && (
              <>
                <TextField label={de ? 'Von' : 'From'} type="date" size="small"
                  value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
                <TextField label={de ? 'Bis' : 'To'} type="date" size="small"
                  value={customTo} onChange={e => setCustomTo(e.target.value)}
                  InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {entries.length > 0 && (
        <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
          <Card sx={{ flex: 1, minWidth: 160 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">{de ? 'Einnahmen' : 'Receipts'}</Typography>
              <Typography variant="h6" fontWeight={700} color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                + {fmtCents(totalReceipts, locale)}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 160 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">{de ? 'Ausgaben' : 'Payments'}</Typography>
              <Typography variant="h6" fontWeight={700} color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                − {fmtCents(totalPayments, locale)}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 160, outline: '2px solid', outlineColor: netBalance >= 0 ? 'success.main' : 'error.main' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">{de ? 'Saldo' : 'Net balance'}</Typography>
              <Typography variant="h6" fontWeight={700} color={netBalance >= 0 ? 'success.main' : 'error.main'} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {netBalance >= 0 ? '+' : '−'} {fmtCents(Math.abs(netBalance), locale)}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 160 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">{de ? 'Buchungssätze' : 'Entries'}</Typography>
              <Typography variant="h6" fontWeight={700}>{entries.length}</Typography>
            </CardContent>
          </Card>
        </Stack>
      )}

      {/* Chart */}
      {buckets.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>
              {de ? 'Einnahmen / Ausgaben' : 'Receipts / Payments'}
            </Typography>
            <BarChart buckets={buckets} locale={locale} />
          </CardContent>
        </Card>
      )}

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!from || !to ? (
        <Alert severity="info">{de ? 'Zeitraum auswählen.' : 'Select a period to load entries.'}</Alert>
      ) : !isLoading && !isError && entries.length === 0 ? (
        <Alert severity="info">{de ? 'Keine Buchungen im gewählten Zeitraum.' : 'No entries in the selected period.'}</Alert>
      ) : !isLoading && entries.length > 0 ? (
        <Card>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                    <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                    <TableCell>{de ? 'Art' : 'Type'}</TableCell>
                    <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                    <TableCell>{de ? 'Kassenkonto' : 'Cash acct'}</TableCell>
                    <TableCell>{de ? 'Gegenkonto' : 'Contra acct'}</TableCell>
                    <TableCell align="right">{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
                    <TableCell align="right">{de ? 'Saldo' : 'Balance'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map(e => (
                    <TableRow key={e._id}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleDateString(locale)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{e.entryNumber}</TableCell>
                      <TableCell>
                        <Chip size="small"
                          label={e.type === 'receipt' ? (de ? 'Einnahme' : 'Receipt') : (de ? 'Ausgabe' : 'Payment')}
                          color={e.type === 'receipt' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.description}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{e.cashAccount}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{e.contraAccount}</TableCell>
                      <TableCell align="right">{e.vatRate > 0 ? `${e.vatRate}%` : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                        color: e.type === 'receipt' ? 'success.main' : 'error.main' }}>
                        {e.type === 'receipt' ? '+' : '−'} {fmtCents(e.amountCents, locale)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums',
                        color: (e.runningBalance ?? 0) >= 0 ? 'text.primary' : 'error.main' }}>
                        {fmtCents(e.runningBalance ?? 0, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            {(data?.data?.total ?? 0) > 500 && (
              <Box p={2}>
                <Alert severity="warning">
                  {de
                    ? `Es werden nur die ersten 500 von ${data?.data?.total} Einträgen angezeigt. Verwenden Sie einen kürzeren Zeitraum.`
                    : `Showing first 500 of ${data?.data?.total} entries. Use a shorter period.`}
                </Alert>
              </Box>
            )}
          </CardContent>
        </Card>
      ) : null}
    </Box>
  );
}
