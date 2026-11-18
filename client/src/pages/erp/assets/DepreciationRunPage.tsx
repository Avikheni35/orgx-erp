import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Alert, Table, TableHead,
  TableBody, TableRow, TableCell, Chip, Divider,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTranslation } from 'react-i18next';
import { assetsApi, type FixedAsset, type DepRunResult } from '../../../api/assets';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function DepreciationRunPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const qc       = useQueryClient();

  const now = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [result,  setResult]  = useState<DepRunResult | null>(null);

  // Load all active assets to show preview
  const { data: assetData, isLoading: assetsLoading } = useQuery({
    queryKey: ['assets', 'active'],
    queryFn:  () => assetsApi.list({ status: 'active' }),
  });
  const assets: FixedAsset[] = assetData?.data?.assets ?? [];

  // Filter: eligible for this month
  const targetMonthEnd = new Date(year, month, 0); // last day of selected month
  const eligible = assets.filter(a => {
    if (a.depreciationMethod !== 'linear') return false;
    if (a.monthlyDepreciationCents === 0)  return false;
    if (new Date(a.acquisitionDate) > targetMonthEnd) return false;
    if (a.lastDepreciationDate) {
      const ld = new Date(a.lastDepreciationDate);
      if (ld.getFullYear() === year && ld.getMonth() + 1 === month) return false;
    }
    return true;
  });

  const totalDepCents = eligible.reduce((s, a) => {
    const remaining = a.acquisitionCostCents - a.residualValueCents - a.accumulatedDepreciationCents;
    return s + Math.min(a.monthlyDepreciationCents, remaining);
  }, 0);

  const mutation = useMutation({
    mutationFn: () => assetsApi.depreciationRun(year, month),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      setResult(res.data);
    },
  });

  const periodLabel = `${String(month).padStart(2, '0')}/${year}`;

  return (
    <Box maxWidth={800}>
      <Stack mb={3}>
        <Typography variant="h5" fontWeight={700}>{de ? 'AfA-Lauf (Abschreibungslauf)' : 'Depreciation Run'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {de
            ? 'Berechnet und bucht die monatliche lineare Abschreibung für alle aktiven Anlagen.'
            : 'Calculates and posts monthly straight-line depreciation for all active assets.'}
        </Typography>
      </Stack>

      <Stack gap={3}>
        {/* Period selector */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>
              {de ? 'Abrechnungszeitraum' : 'Billing period'}
            </Typography>
            <Stack direction="row" gap={2}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>{de ? 'Jahr' : 'Year'}</InputLabel>
                <Select value={year} label={de ? 'Jahr' : 'Year'}
                  onChange={e => { setYear(Number(e.target.value)); setResult(null); }}>
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                    <MenuItem key={y} value={y}>{y}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>{de ? 'Monat' : 'Month'}</InputLabel>
                <Select value={month} label={de ? 'Monat' : 'Month'}
                  onChange={e => { setMonth(Number(e.target.value)); setResult(null); }}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <MenuItem key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString(locale, { month: 'long' })}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle2" fontWeight={700}>
                {de ? `Vorschau für ${periodLabel}` : `Preview for ${periodLabel}`}
              </Typography>
              {assetsLoading && <CircularProgress size={18} />}
            </Stack>

            <Stack direction="row" gap={4} mb={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Abzuschreibende Anlagen' : 'Assets to depreciate'}</Typography>
                <Typography variant="h5" fontWeight={700}>{eligible.length}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Gesamt-AfA-Betrag' : 'Total dep. amount'}</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtCents(totalDepCents, locale)}
                </Typography>
              </Box>
            </Stack>

            {eligible.length > 0 ? (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                      <TableCell>{de ? 'Bezeichnung' : 'Name'}</TableCell>
                      <TableCell>{de ? 'Kategorie' : 'Category'}</TableCell>
                      <TableCell align="right">{de ? 'Buchwert (vor AfA)' : 'Book value (pre)'}</TableCell>
                      <TableCell align="right">{de ? 'AfA-Betrag' : 'Dep. amount'}</TableCell>
                      <TableCell align="right">{de ? 'Buchwert (nach AfA)' : 'Book value (post)'}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {eligible.map(a => {
                      const remaining = a.acquisitionCostCents - a.residualValueCents - a.accumulatedDepreciationCents;
                      const depCents  = Math.min(a.monthlyDepreciationCents, remaining);
                      const bookPre   = a.acquisitionCostCents - a.accumulatedDepreciationCents;
                      const bookPost  = bookPre - depCents;
                      return (
                        <TableRow key={a._id}>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{a.assetNumber}</TableCell>
                          <TableCell>{a.name}</TableCell>
                          <TableCell>{a.category || '—'}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(bookPre, locale)}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'error.main', fontWeight: 600 }}>
                            − {fmtCents(depCents, locale)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {fmtCents(bookPost, locale)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell colSpan={4} />
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                        − {fmtCents(totalDepCents, locale)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            ) : (
              <Alert severity="info">
                {de
                  ? `Keine abzuschreibenden Anlagen für ${periodLabel}. Entweder wurden alle bereits abgeschrieben oder es gibt keine aktiven Anlagen.`
                  : `No assets to depreciate for ${periodLabel}. Either all have been processed or there are no active assets.`}
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Result */}
        {result && (
          <Card sx={{ borderColor: 'success.main', borderWidth: 1, borderStyle: 'solid' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" gap={1} mb={1.5}>
                <CheckCircleIcon color="success" />
                <Typography variant="subtitle2" fontWeight={700} color="success.main">
                  {de ? 'AfA-Lauf abgeschlossen' : 'Depreciation run completed'}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" mb={1.5}>
                {result.posted > 0
                  ? (de ? `${result.posted} Buchungssatz/Buchungssätze für ${result.period} erstellt.` : `${result.posted} journal entry/entries posted for ${result.period}.`)
                  : (result.message ?? (de ? 'Keine Buchungen notwendig.' : 'No postings required.'))}
              </Typography>
              {result.results.length > 0 && (
                <>
                  <Divider sx={{ mb: 1.5 }} />
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{de ? 'Anlage' : 'Asset'}</TableCell>
                        <TableCell align="right">{de ? 'Gebuchter AfA-Betrag' : 'Posted amount'}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.results.map(r => (
                        <TableRow key={r.assetNumber}>
                          <TableCell>
                            <Typography variant="caption" fontFamily="monospace" color="text.secondary">{r.assetNumber}</Typography>
                            {' '}{r.name}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {fmtCents(r.amountCents, locale)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
              <Stack direction="row" justifyContent="flex-end" mt={2}>
                <Chip size="small" icon={<CheckCircleIcon />} color="success" label={de ? 'Buchungssätze im Journal sichtbar' : 'Entries visible in journal'} />
              </Stack>
            </CardContent>
          </Card>
        )}

        {mutation.isError && (
          <Alert severity="error">
            {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message
              ?? (de ? 'Fehler beim AfA-Lauf.' : 'Depreciation run failed.')}
          </Alert>
        )}

        {/* Run button */}
        {!result && (
          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="contained"
              size="large"
              startIcon={mutation.isPending ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
              disabled={mutation.isPending || eligible.length === 0}
              onClick={() => mutation.mutate()}
              sx={{ minWidth: 220 }}
            >
              {mutation.isPending
                ? (de ? 'Wird gebucht…' : 'Posting…')
                : (de ? `AfA-Lauf starten (${periodLabel})` : `Run depreciation (${periodLabel})`)}
            </Button>
          </Stack>
        )}

        {result && (
          <Stack direction="row" justifyContent="flex-end">
            <Button variant="outlined" onClick={() => { setResult(null); setMonth(m => m === 12 ? 1 : m + 1); if (month === 12) setYear(y => y + 1); }}>
              {de ? 'Nächsten Monat vorbereiten' : 'Prepare next month'}
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
