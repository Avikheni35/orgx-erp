import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Card, CardContent, Stack, Select, MenuItem, FormControl,
  InputLabel, CircularProgress, Alert, Divider, Grid, Chip, Button,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { reportsApi, type BsGroup, type BilanzResult } from '../../../api/reports';
import { fiscalYearsApi } from '../../../api/fiscalYears';

function fmt(n: number, locale: string) {
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function exportCsv(result: BilanzResult, locale: string) {
  const sep = ';';
  const rows: string[] = ['Seite;Gruppe;Konto;Bezeichnung;Betrag (€)'];
  for (const g of result.aktivaGroups) {
    for (const l of g.lines) rows.push(['Aktiva', g.label, l.number, l.name, (l.amount / 1).toFixed(2).replace('.', ',')].join(sep));
    rows.push(['Aktiva', g.label, '', `Summe ${g.label}`, (g.total / 1).toFixed(2).replace('.', ',')].join(sep));
  }
  for (const g of result.passivaGroups) {
    for (const l of g.lines) rows.push(['Passiva', g.label, l.number, l.name, (l.amount / 1).toFixed(2).replace('.', ',')].join(sep));
    rows.push(['Passiva', g.label, '', `Summe ${g.label}`, (g.total / 1).toFixed(2).replace('.', ',')].join(sep));
  }
  if (result.guv !== 0) rows.push(['Passiva', 'Jahresergebnis', '', result.guv >= 0 ? 'Jahresüberschuss' : 'Jahresfehlbetrag', (result.guv / 1).toFixed(2).replace('.', ',')].join(sep));
  rows.push(['', '', '', 'Summe Aktiva',  (result.totalAktiva  / 1).toFixed(2).replace('.', ',')].join(sep));
  rows.push(['', '', '', 'Summe Passiva', (result.totalPassiva / 1).toFixed(2).replace('.', ',')].join(sep));
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `Bilanz_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function BsColumn({ title, groups, extra, total, locale, de }: {
  title: string; groups: BsGroup[]; extra?: { label: string; amount: number } | null;
  total: number; locale: string; de: boolean;
}) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="overline" fontWeight={700} letterSpacing={1.2} color="text.secondary">
          {title}
        </Typography>

        {groups.length === 0 && !extra ? (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1, pl: 1 }}>
            {de ? 'Keine Einträge' : 'No entries'}
          </Typography>
        ) : groups.map(group => (
          <Box key={group.key} mb={1.5}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ pl: 1, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {group.label}
            </Typography>
            {group.lines.map(line => (
              <Stack key={line.number} direction="row" justifyContent="space-between" alignItems="baseline" sx={{ py: 0.4, pl: 2 }}>
                <Box>
                  <Typography variant="caption" fontFamily="monospace" color="text.disabled" sx={{ mr: 0.5 }}>{line.number}</Typography>
                  <Typography variant="body2" component="span">{line.name}</Typography>
                </Box>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', ml: 2, flexShrink: 0 }}>
                  {fmt(line.amount, locale)}
                </Typography>
              </Stack>
            ))}
            <Stack direction="row" justifyContent="space-between" sx={{ pl: 2, mt: 0.25 }}>
              <Typography variant="caption" color="text.secondary">{de ? 'Summe' : 'Subtotal'}</Typography>
              <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(group.total, locale)}</Typography>
            </Stack>
            <Divider sx={{ mt: 0.5 }} />
          </Box>
        ))}

        {extra && (
          <Box mb={1.5}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ pl: 1, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {de ? 'Jahresergebnis' : 'Net result'}
            </Typography>
            <Stack direction="row" justifyContent="space-between" sx={{ py: 0.4, pl: 2 }}>
              <Typography variant="body2" color={extra.amount >= 0 ? 'success.main' : 'error.main'}>{extra.label}</Typography>
              <Typography variant="body2" fontWeight={600} color={extra.amount >= 0 ? 'success.main' : 'error.main'} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(Math.abs(extra.amount), locale)}
              </Typography>
            </Stack>
            <Divider sx={{ mt: 0.5 }} />
          </Box>
        )}

        {/* Column total */}
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 1.5, pt: 1, borderTop: 2, borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={800}>{de ? `Summe ${title}` : `Total ${title}`}</Typography>
          <Typography variant="subtitle2" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(total, locale)}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function BilanzPage() {
  const { i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [fyId, setFyId] = useState('');

  const { data: fyData } = useQuery({ queryKey: ['fiscal-years'], queryFn: () => fiscalYearsApi.list() });
  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-bilanz', fyId],
    queryFn:  () => reportsApi.bilanz(fyId ? { fyId } : undefined),
  });

  const fys    = fyData?.data?.fiscalYears ?? [];
  const result = data?.data;

  const balanced = result ? Math.abs(result.totalAktiva - result.totalPassiva) < 0.01 : false;
  const hasData  = result && (result.aktivaGroups.length > 0 || result.passivaGroups.length > 0);

  const guvExtra = result?.guv !== 0 && result?.guv !== undefined
    ? { label: result.guv >= 0 ? (de ? 'Jahresüberschuss' : 'Net profit') : (de ? 'Jahresfehlbetrag' : 'Net loss'), amount: result.guv }
    : null;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Bilanz' : 'Balance Sheet'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Gegenüberstellung von Aktiva und Passiva aus gebuchten Buchungssätzen'
                : 'Assets vs. liabilities and equity from posted journal entries'}
          </Typography>
        </Box>

        <Stack direction="row" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{de ? 'Geschäftsjahr' : 'Fiscal year'}</InputLabel>
            <Select value={fyId} label={de ? 'Geschäftsjahr' : 'Fiscal year'} onChange={e => setFyId(e.target.value)}>
              <MenuItem value="">{de ? 'Alle Zeiträume' : 'All periods'}</MenuItem>
              {fys.map(fy => <MenuItem key={fy._id} value={fy._id}>{fy.name}</MenuItem>)}
            </Select>
          </FormControl>
          {hasData && (
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => exportCsv(result!, locale)}>
              CSV
            </Button>
          )}
        </Stack>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && !hasData && (
        <Alert severity="info">
          {de ? 'Keine gebuchten Buchungssätze vorhanden.' : 'No posted journal entries found.'}
        </Alert>
      )}

      {!isLoading && !isError && hasData && result && (
        <>
          {/* Balance status */}
          <Box mb={2}>
            {balanced ? (
              <Chip icon={<CheckCircleIcon />} color="success" label={de ? 'Bilanz ausgeglichen' : 'Balance sheet balanced'} />
            ) : (
              <Chip icon={<WarningIcon />} color="warning"
                label={de
                  ? `Differenz: ${fmt(Math.abs(result.totalAktiva - result.totalPassiva), locale)}`
                  : `Difference: ${fmt(Math.abs(result.totalAktiva - result.totalPassiva), locale)}`}
              />
            )}
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <BsColumn
                title={de ? 'Aktiva' : 'Assets'}
                groups={result.aktivaGroups}
                extra={null}
                total={result.totalAktiva}
                locale={locale}
                de={de}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <BsColumn
                title={de ? 'Passiva' : 'Liabilities & Equity'}
                groups={result.passivaGroups}
                extra={guvExtra}
                total={result.totalPassiva}
                locale={locale}
                de={de}
              />
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
