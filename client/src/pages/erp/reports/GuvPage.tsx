import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Card, CardContent, Stack, Select, MenuItem, FormControl,
  InputLabel, CircularProgress, Alert, Divider, Grid, Button,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { reportsApi, type GuvLine } from '../../../api/reports';
import { fiscalYearsApi } from '../../../api/fiscalYears';

function fmt(n: number, locale: string) {
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function exportCsv(
  revenueLines: GuvLine[], expenseLines: GuvLine[],
  totalRevenue: number, totalExpenses: number, netResult: number
) {
  const sep  = ';';
  const rows = [
    ['Art', 'Kontonummer', 'Bezeichnung', 'Betrag'].join(sep),
    ...revenueLines.map(l => ['Ertrag', l.number, l.name, l.amount].join(sep)),
    ['', '', 'Gesamtertrag', totalRevenue].join(sep),
    ...expenseLines.map(l => ['Aufwand', l.number, l.name, l.amount].join(sep)),
    ['', '', 'Gesamtaufwand', totalExpenses].join(sep),
    ['', '', 'Jahresergebnis', netResult].join(sep),
  ];
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `GuV_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function LineRow({ line, locale }: { line: GuvLine; locale: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ py: 0.5, pl: 1 }}>
      <Box>
        <Typography variant="caption" fontFamily="monospace" color="text.disabled" sx={{ mr: 1 }}>
          {line.number}
        </Typography>
        <Typography variant="body2" component="span">{line.name}</Typography>
      </Box>
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', ml: 2, flexShrink: 0 }}>
        {fmt(line.amount, locale)}
      </Typography>
    </Stack>
  );
}

export default function GuvPage() {
  const { i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [fyId, setFyId] = useState('');

  const { data: fyData } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn:  () => fiscalYearsApi.list(),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-guv', fyId],
    queryFn:  () => reportsApi.guv(fyId ? { fyId } : undefined),
  });

  const fys          = fyData?.data?.fiscalYears ?? [];
  const revenueLines = data?.data?.revenueLines  ?? [];
  const expenseLines = data?.data?.expenseLines  ?? [];
  const totalRevenue  = data?.data?.totalRevenue  ?? 0;
  const totalExpenses = data?.data?.totalExpenses ?? 0;
  const netResult     = data?.data?.netResult     ?? 0;

  const hasData = revenueLines.length > 0 || expenseLines.length > 0;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Gewinn- und Verlustrechnung' : 'Income Statement (P&L)'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Erträge und Aufwendungen aus gebuchten Buchungssätzen' : 'Revenue and expenses from posted journal entries'}
          </Typography>
        </Box>

        <Stack direction="row" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{de ? 'Geschäftsjahr' : 'Fiscal year'}</InputLabel>
            <Select
              value={fyId}
              label={de ? 'Geschäftsjahr' : 'Fiscal year'}
              onChange={e => setFyId(e.target.value)}
            >
              <MenuItem value="">{de ? 'Alle Zeiträume' : 'All periods'}</MenuItem>
              {fys.map(fy => (
                <MenuItem key={fy._id} value={fy._id}>{fy.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {hasData && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => exportCsv(revenueLines, expenseLines, totalRevenue, totalExpenses, netResult)}
            >
              CSV
            </Button>
          )}
        </Stack>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden der Daten.' : 'Failed to load report.'}</Alert>}

      {!isLoading && !isError && !hasData && (
        <Alert severity="info">
          {de
            ? 'Keine gebuchten Buchungssätze vorhanden. Genehmigen Sie Eingangsrechnungen oder versenden Sie Ausgangsrechnungen, um Buchungen zu erzeugen.'
            : 'No posted journal entries found. Approve vendor invoices or send sales invoices to generate entries.'}
        </Alert>
      )}

      {!isLoading && !isError && hasData && (
        <Grid container spacing={3}>
          {/* Revenue side */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="overline" color="success.main" fontWeight={700} letterSpacing={1.2}>
                  {de ? 'Erträge' : 'Revenue'}
                </Typography>

                {revenueLines.length === 0 ? (
                  <Typography variant="body2" color="text.disabled" sx={{ mt: 1, pl: 1 }}>
                    {de ? 'Keine Erträge' : 'No revenue'}
                  </Typography>
                ) : revenueLines.map(line => (
                  <LineRow key={line.number} line={line} locale={locale} />
                ))}

                <Divider sx={{ my: 1.5 }} />
                <Stack direction="row" justifyContent="space-between" sx={{ pl: 1 }}>
                  <Typography variant="body2" fontWeight={700}>{de ? 'Gesamtertrag' : 'Total revenue'}</Typography>
                  <Typography variant="body2" fontWeight={700} color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(totalRevenue, locale)}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Expense side */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="overline" color="error.main" fontWeight={700} letterSpacing={1.2}>
                  {de ? 'Aufwendungen' : 'Expenses'}
                </Typography>

                {expenseLines.length === 0 ? (
                  <Typography variant="body2" color="text.disabled" sx={{ mt: 1, pl: 1 }}>
                    {de ? 'Keine Aufwendungen' : 'No expenses'}
                  </Typography>
                ) : expenseLines.map(line => (
                  <LineRow key={line.number} line={line} locale={locale} />
                ))}

                <Divider sx={{ my: 1.5 }} />
                <Stack direction="row" justifyContent="space-between" sx={{ pl: 1 }}>
                  <Typography variant="body2" fontWeight={700}>{de ? 'Gesamtaufwand' : 'Total expenses'}</Typography>
                  <Typography variant="body2" fontWeight={700} color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(totalExpenses, locale)}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Net result */}
          <Grid item xs={12}>
            <Card sx={{
              bgcolor: netResult >= 0 ? 'success.light' : 'error.light',
              color:   netResult >= 0 ? 'success.contrastText' : 'error.contrastText',
            }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight={800}>
                    {de
                      ? (netResult >= 0 ? 'Jahresüberschuss' : 'Jahresfehlbetrag')
                      : (netResult >= 0 ? 'Net profit' : 'Net loss')}
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(Math.abs(netResult), locale)}
                  </Typography>
                </Stack>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {de ? `Gesamtertrag ${fmt(totalRevenue, locale)} − Gesamtaufwand ${fmt(totalExpenses, locale)}`
                      : `Total revenue ${fmt(totalRevenue, locale)} − Total expenses ${fmt(totalExpenses, locale)}`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
