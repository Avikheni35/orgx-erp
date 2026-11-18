import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Card, CardContent, Stack, Select, MenuItem, FormControl,
  InputLabel, CircularProgress, Alert, Divider, Grid, Chip, Table,
  TableHead, TableBody, TableRow, TableCell, Button,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { useTranslation } from 'react-i18next';
import { reportsApi, type UstResult } from '../../../api/reports';

// ── Period presets ─────────────────────────────────────────────────────────────
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function buildPresets(de: boolean) {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth(); // 0-indexed

  const startOfMonth = (year: number, mo: number) => new Date(year, mo, 1);
  const endOfMonth   = (year: number, mo: number) => new Date(year, mo + 1, 0);

  const monthName = (mo: number) =>
    new Date(y, mo, 1).toLocaleString(de ? 'de-DE' : 'en-GB', { month: 'long' });

  const quarters: { key: string; label: string; from: string; to: string }[] = [
    { key: `q1_${y}`, label: `Q1 ${y}`, from: isoDate(new Date(y, 0, 1)), to: isoDate(new Date(y, 2, 31)) },
    { key: `q2_${y}`, label: `Q2 ${y}`, from: isoDate(new Date(y, 3, 1)), to: isoDate(new Date(y, 5, 30)) },
    { key: `q3_${y}`, label: `Q3 ${y}`, from: isoDate(new Date(y, 6, 1)), to: isoDate(new Date(y, 8, 30)) },
    { key: `q4_${y}`, label: `Q4 ${y}`, from: isoDate(new Date(y, 9, 1)), to: isoDate(new Date(y, 11, 31)) },
  ];

  const presets: { key: string; label: string; from: string; to: string }[] = [
    {
      key: 'cur_month',
      label: de ? `Aktueller Monat (${monthName(m)})` : `Current month (${monthName(m)})`,
      from: isoDate(startOfMonth(y, m)),
      to:   isoDate(endOfMonth(y, m)),
    },
    {
      key: 'prev_month',
      label: de ? `Letzter Monat (${monthName(m - 1 < 0 ? 11 : m - 1)})` : `Last month (${monthName(m - 1 < 0 ? 11 : m - 1)})`,
      from: isoDate(startOfMonth(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1)),
      to:   isoDate(endOfMonth(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1)),
    },
    ...quarters,
    {
      key: `year_${y}`,
      label: de ? `Gesamtjahr ${y}` : `Full year ${y}`,
      from: isoDate(new Date(y, 0, 1)),
      to:   isoDate(new Date(y, 11, 31)),
    },
    {
      key: `year_${y - 1}`,
      label: de ? `Gesamtjahr ${y - 1}` : `Full year ${y - 1}`,
      from: isoDate(new Date(y - 1, 0, 1)),
      to:   isoDate(new Date(y - 1, 11, 31)),
    },
    { key: 'all', label: de ? 'Alle Zeiträume' : 'All periods', from: '', to: '' },
  ];

  return presets;
}

function fmt(n: number, locale: string) {
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function exportCsv(result: UstResult, period: string) {
  const sep = ';';
  const rows = [
    ['Bereich', 'Steuersatz', 'Bemessungsgrundlage (€)', 'Steuerbetrag (€)', 'Kz'].join(sep),
    ...result.umsaetze.map(u => [
      'Umsatzsteuer',
      u.rate > 0 ? `${u.rate}%` : 'stfrei/0%',
      u.base.toFixed(2).replace('.', ','),
      u.ust.toFixed(2).replace('.', ','),
      u.kz,
    ].join(sep)),
    ...result.einkauf.map(e => [
      'Vorsteuer',
      e.rate > 0 ? `${e.rate}%` : '0%',
      e.base.toFixed(2).replace('.', ','),
      e.vst.toFixed(2).replace('.', ','),
      e.kz,
    ].join(sep)),
    ['', '', '', '', ''].join(sep),
    ['Umsatzsteuer gesamt', '', '', result.totalOutput.toFixed(2).replace('.', ','), ''].join(sep),
    ['Vorsteuer gesamt',    '', '', result.totalInput.toFixed(2).replace('.', ','),  ''].join(sep),
    [result.zahllast >= 0 ? 'Zahllast (Kz 83)' : 'Erstattungsbetrag (Kz 83)', '', '', Math.abs(result.zahllast).toFixed(2).replace('.', ','), 83].join(sep),
  ];
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `UStVA_${period}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── UStVA row ──────────────────────────────────────────────────────────────────
function VatRow({ kz, label, base, tax, locale, highlight }: {
  kz?: number; label: string; base?: number; tax: number; locale: string; highlight?: boolean;
}) {
  return (
    <TableRow sx={highlight ? { bgcolor: 'action.hover' } : {}}>
      <TableCell sx={{ width: 56 }}>
        {kz !== undefined && (
          <Chip size="small" label={kz} sx={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, minWidth: 36 }} />
        )}
      </TableCell>
      <TableCell><Typography variant="body2" fontWeight={highlight ? 700 : 400}>{label}</Typography></TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {base !== undefined && base !== 0
          ? <Typography variant="body2" color="text.secondary">{fmt(base, locale)}</Typography>
          : null}
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <Typography variant="body2" fontWeight={highlight ? 700 : 400}>{fmt(tax, locale)}</Typography>
      </TableCell>
    </TableRow>
  );
}

export default function UstPage() {
  const { i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const presets = useMemo(() => buildPresets(de), [de]);
  const [presetKey, setPresetKey] = useState('cur_month');

  const preset = presets.find(p => p.key === presetKey) ?? presets[0];
  const params = preset.from ? { from: preset.from, to: preset.to } : undefined;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-ust', presetKey],
    queryFn:  () => reportsApi.ust(params),
  });

  const result    = data?.data;
  const hasData   = result && (result.totalOutput !== 0 || result.totalInput !== 0);
  const zahllast  = result?.zahllast ?? 0;
  const isRefund  = zahllast < 0;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Stack direction="row" alignItems="center" gap={1}>
            <AccountBalanceIcon color="primary" />
            <Typography variant="h5" fontWeight={700}>
              {de ? 'Umsatzsteuer-Voranmeldung' : 'VAT Advance Return'}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {de
              ? 'Inoffizielle Vorschau basierend auf gebuchten Buchungssätzen — kein Ersatz für die ELSTER-Meldung'
              : 'Unofficial preview based on posted journal entries — not a substitute for official filing'}
          </Typography>
        </Box>

        <Stack direction="row" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 230 }}>
            <InputLabel>{de ? 'Zeitraum' : 'Period'}</InputLabel>
            <Select value={presetKey} label={de ? 'Zeitraum' : 'Period'} onChange={e => setPresetKey(e.target.value)}>
              {presets.map(p => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
            </Select>
          </FormControl>
          {hasData && (
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />}
              onClick={() => exportCsv(result!, preset.key)}>
              CSV
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Period badge */}
      {preset.from && (
        <Chip
          size="small" variant="outlined"
          label={`${new Date(preset.from).toLocaleDateString(locale)} – ${new Date(preset.to).toLocaleDateString(locale)}`}
          sx={{ mb: 2 }}
        />
      )}

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && !hasData && (
        <Alert severity="info">
          {de
            ? 'Keine USt-relevanten Buchungen im gewählten Zeitraum.'
            : 'No VAT-relevant postings in the selected period.'}
        </Alert>
      )}

      {!isLoading && !isError && hasData && result && (
        <Grid container spacing={3}>
          {/* Main UStVA table */}
          <Grid item xs={12} md={8}>
            <Card>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 56 }}>Kz</TableCell>
                      <TableCell>{de ? 'Position' : 'Line item'}</TableCell>
                      <TableCell align="right">{de ? 'Bemessungsgrundlage' : 'Tax base'}</TableCell>
                      <TableCell align="right">{de ? 'Steuerbetrag' : 'Tax amount'}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* Section 1: Steuerpflichtige Umsätze */}
                    <TableRow>
                      <TableCell colSpan={4} sx={{ bgcolor: 'primary.main', py: 0.75 }}>
                        <Typography variant="caption" fontWeight={700} color="primary.contrastText" letterSpacing={0.8} textTransform="uppercase">
                          {de ? 'I. Steuerpflichtige Umsätze (Lieferungen & Leistungen)' : 'I. Taxable sales (outputs)'}
                        </Typography>
                      </TableCell>
                    </TableRow>

                    {result.umsaetze.filter(u => u.rate > 0).map(u => (
                      <VatRow
                        key={u.rate}
                        kz={u.kz}
                        label={de
                          ? `Steuerpflichtige Umsätze ${u.rate}% (Kz ${u.kz})`
                          : `Taxable sales at ${u.rate}%`}
                        base={u.base}
                        tax={u.ust}
                        locale={locale}
                      />
                    ))}

                    {result.umsaetze.filter(u => u.rate === 0).map(u => (
                      <VatRow
                        key="exempt"
                        kz={u.kz}
                        label={de ? 'Steuerfreie Umsätze' : 'Exempt sales'}
                        base={u.base}
                        tax={0}
                        locale={locale}
                      />
                    ))}

                    <VatRow
                      label={de ? 'Summe Umsatzsteuer' : 'Total output VAT'}
                      tax={result.totalOutput}
                      locale={locale}
                      highlight
                    />

                    {/* Section 2: Abziehbare Vorsteuer */}
                    <TableRow>
                      <TableCell colSpan={4} sx={{ bgcolor: 'success.main', py: 0.75 }}>
                        <Typography variant="caption" fontWeight={700} color="success.contrastText" letterSpacing={0.8} textTransform="uppercase">
                          {de ? 'II. Abziehbare Vorsteuerbeträge' : 'II. Deductible input VAT'}
                        </Typography>
                      </TableCell>
                    </TableRow>

                    {result.einkauf.filter(e => e.vst > 0).map(e => (
                      <VatRow
                        key={e.rate}
                        kz={e.kz}
                        label={de
                          ? `Vorsteuer ${e.rate}% aus Eingangsrechnungen`
                          : `Input VAT ${e.rate}% from vendor invoices`}
                        base={e.base > 0 ? e.base : undefined}
                        tax={e.vst}
                        locale={locale}
                      />
                    ))}

                    {result.totalInput === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} sx={{ py: 1.5, pl: 2 }}>
                          <Typography variant="body2" color="text.disabled">
                            {de ? 'Keine abziehbaren Vorsteuerbeträge.' : 'No deductible input VAT.'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}

                    <VatRow
                      label={de ? 'Summe Vorsteuer' : 'Total input VAT'}
                      tax={result.totalInput}
                      locale={locale}
                      highlight
                    />

                    {/* Divider */}
                    <TableRow><TableCell colSpan={4} sx={{ p: 0 }}><Divider /></TableCell></TableRow>

                    {/* Section 3: Zahllast / Erstattung */}
                    <TableRow sx={{ bgcolor: isRefund ? 'success.light' : 'warning.light' }}>
                      <TableCell>
                        <Chip size="small" label={83} sx={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, minWidth: 36 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {isRefund
                            ? (de ? 'Erstattungsbetrag' : 'VAT refund')
                            : (de ? 'Verbleibende Umsatzsteuer / Zahllast' : 'VAT payable')}
                        </Typography>
                      </TableCell>
                      <TableCell />
                      <TableCell align="right">
                        <Typography variant="subtitle2" fontWeight={800}
                          color={isRefund ? 'success.dark' : 'warning.dark'}
                          sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(Math.abs(zahllast), locale)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            </Card>
          </Grid>

          {/* Summary card */}
          <Grid item xs={12} md={4}>
            <Stack gap={2}>
              {/* Result */}
              <Card sx={{ bgcolor: isRefund ? 'success.light' : 'warning.light' }}>
                <CardContent>
                  <Typography variant="overline" fontWeight={700} letterSpacing={1.2}
                    color={isRefund ? 'success.dark' : 'warning.dark'}>
                    {isRefund ? (de ? 'Erstattung' : 'Refund') : (de ? 'Zahllast' : 'VAT payable')}
                  </Typography>
                  <Typography variant="h4" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums', mt: 0.5 }}
                    color={isRefund ? 'success.dark' : 'warning.dark'}>
                    {fmt(Math.abs(zahllast), locale)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    {isRefund
                      ? (de ? 'Das Finanzamt erstattet diesen Betrag.' : 'Tax office owes you this amount.')
                      : (de ? 'An das Finanzamt abzuführen.' : 'Payable to tax authority.')}
                  </Typography>
                </CardContent>
              </Card>

              {/* Breakdown */}
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                    {de ? 'Zusammenfassung' : 'Summary'}
                  </Typography>
                  <Stack gap={0.75}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">{de ? 'Umsatzsteuer (Kz 81+86)' : 'Output VAT'}</Typography>
                      <Typography variant="body2" fontWeight={500} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(result.totalOutput, locale)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">{de ? '− Vorsteuer (Kz 66)' : '− Input VAT'}</Typography>
                      <Typography variant="body2" fontWeight={500} sx={{ fontVariantNumeric: 'tabular-nums' }} color="success.main">
                        − {fmt(result.totalInput, locale)}
                      </Typography>
                    </Stack>
                    <Divider />
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" fontWeight={700}>{de ? 'Zahllast / Erstattung (Kz 83)' : 'Net VAT (field 83)'}</Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}
                        color={isRefund ? 'success.main' : 'warning.main'}>
                        {isRefund ? '−' : ''}{fmt(Math.abs(zahllast), locale)}
                      </Typography>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              <Alert severity="info" sx={{ fontSize: 11 }}>
                {de
                  ? 'Diese Ansicht ist eine Vorschau und kein Ersatz für die amtliche ELSTER-Meldung. Prüfen Sie alle Werte vor der Abgabe.'
                  : 'This is a preview only and not a substitute for official ELSTER filing. Verify all values before submission.'}
              </Alert>
            </Stack>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
