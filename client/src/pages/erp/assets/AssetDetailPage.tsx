import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, LinearProgress, Table, TableHead, TableBody, TableRow,
  TableCell, Dialog, DialogTitle, DialogContent, DialogActions,
  DialogContentText, TextField,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import { useTranslation } from 'react-i18next';
import { assetsApi } from '../../../api/assets';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

interface DepEntry {
  _id:         string;
  entryNumber: string;
  date:        string;
  description: string;
  totalDebit:  number;
}

export default function AssetDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [disposeDialog, setDisposeDialog] = useState(false);
  const [disposeDate,   setDisposeDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [proceedsStr,   setProceedsStr]   = useState('0');
  const [disposeError,  setDisposeError]  = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['asset', id],
    queryFn:  () => assetsApi.get(id!),
    enabled:  !!id,
  });

  const disposeMutation = useMutation({
    mutationFn: () => assetsApi.dispose(id!, {
      disposalDate:   disposeDate,
      proceedsCents:  Math.round(parseFloat(proceedsStr.replace(',', '.') || '0') * 100),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset', id] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      setDisposeDialog(false);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setDisposeError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  const asset     = data?.data?.asset;
  const depEntries = (data?.data?.depEntries ?? []) as DepEntry[];

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !asset) return <Alert severity="error">{de ? 'Anlage nicht gefunden.' : 'Asset not found.'}</Alert>;

  const bookValue = asset.acquisitionCostCents - asset.accumulatedDepreciationCents;
  const depBase   = asset.acquisitionCostCents - asset.residualValueCents;
  const pct       = depBase > 0 ? Math.round((asset.accumulatedDepreciationCents / depBase) * 100) : 100;

  // Projected depreciation schedule (remaining months)
  const remainingDep   = depBase - asset.accumulatedDepreciationCents;
  const monthsLeft     = asset.monthlyDepreciationCents > 0 ? Math.ceil(remainingDep / asset.monthlyDepreciationCents) : 0;
  const scheduleMonths = Math.min(monthsLeft, 24);
  const schedule: { label: string; amount: number }[] = [];
  if (asset.status === 'active' && asset.monthlyDepreciationCents > 0) {
    const startDate = asset.lastDepreciationDate ? new Date(asset.lastDepreciationDate) : new Date(asset.acquisitionDate);
    let rem = remainingDep;
    for (let i = 0; i < scheduleMonths && rem > 0; i++) {
      const d   = new Date(startDate.getFullYear(), startDate.getMonth() + i + 1, 1);
      const dep = Math.min(asset.monthlyDepreciationCents, rem);
      schedule.push({ label: `${String(d.getMonth() + 1).padStart(2,'0')}/${d.getFullYear()}`, amount: dep });
      rem -= dep;
    }
  }

  return (
    <Box maxWidth={860}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/anlagen')}>
          {de ? 'Anlagen' : 'Assets'}
        </Button>
      </Stack>

      <Stack gap={3}>
        {/* Header card */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="overline" color="text.secondary">{asset.category || (de ? 'Anlage' : 'Asset')}</Typography>
                <Typography variant="h5" fontWeight={700}>{asset.name}</Typography>
                <Typography variant="body2" color="text.secondary" fontFamily="monospace">{asset.assetNumber}</Typography>
                {asset.description && <Typography variant="body2" color="text.secondary" mt={0.5}>{asset.description}</Typography>}
              </Box>
              <Stack alignItems="flex-end" gap={1}>
                <Chip
                  label={asset.status === 'active' ? (de ? 'Aktiv' : 'Active') : asset.status === 'fully_depreciated' ? (de ? 'Abgeschrieben' : 'Depreciated') : (de ? 'Abgegangen' : 'Disposed')}
                  color={asset.status === 'active' ? 'success' : asset.status === 'disposed' ? 'error' : 'default'}
                />
                {asset.status === 'active' && (
                  <Button size="small" color="error" startIcon={<RemoveCircleIcon />} onClick={() => setDisposeDialog(true)}>
                    {de ? 'Abgang erfassen' : 'Dispose'}
                  </Button>
                )}
              </Stack>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction={{ xs: 'column', sm: 'row' }} gap={3} flexWrap="wrap">
              {[
                { label: de ? 'Anschaffungsdatum' : 'Acquisition date', value: new Date(asset.acquisitionDate).toLocaleDateString(locale) },
                { label: de ? 'Anschaffungskosten (AHK)' : 'Acquisition cost', value: fmtCents(asset.acquisitionCostCents, locale) },
                { label: de ? 'Restwert' : 'Residual value', value: fmtCents(asset.residualValueCents, locale) },
                { label: de ? 'Nutzungsdauer' : 'Useful life', value: `${asset.usefulLifeMonths} ${de ? 'Monate' : 'months'}` },
                { label: de ? 'Monatliche AfA' : 'Monthly dep.', value: fmtCents(asset.monthlyDepreciationCents, locale) },
                { label: de ? 'Letzte AfA' : 'Last dep.', value: asset.lastDepreciationDate ? new Date(asset.lastDepreciationDate).toLocaleDateString(locale) : '—' },
              ].map(item => (
                <Box key={item.label}>
                  <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  <Typography variant="body2" fontWeight={500}>{item.value}</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>

        {/* Book value card */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>{de ? 'Buchwertentwicklung' : 'Book value'}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={4} mb={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Kumulierte AfA' : 'Accumulated dep.'}</Typography>
                <Typography variant="h6" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(asset.accumulatedDepreciationCents, locale)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Aktueller Buchwert' : 'Current book value'}</Typography>
                <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(bookValue, locale)}</Typography>
              </Box>
            </Stack>
            <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary">{pct}% {de ? 'abgeschrieben' : 'depreciated'}</Typography>
          </CardContent>
        </Card>

        {/* Accounts */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>{de ? 'Kontenverknüpfung' : 'Accounts'}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={3}>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Anlagenkonto' : 'Asset account'}</Typography>
                <Typography variant="body2" fontFamily="monospace">{asset.assetAccount}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'AfA-Aufwand' : 'Dep. expense'}</Typography>
                <Typography variant="body2" fontFamily="monospace">{asset.depreciationExpenseAccount}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Kum. AfA-Konto' : 'Acc. dep. account'}</Typography>
                <Typography variant="body2" fontFamily="monospace">{asset.accumulatedDepAccount}</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Depreciation history */}
        {depEntries.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5}>{de ? 'AfA-Buchungen' : 'Depreciation postings'}</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Buchungssatz' : 'Entry'}</TableCell>
                      <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                      <TableCell>{de ? 'Text' : 'Description'}</TableCell>
                      <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {depEntries.map(e => (
                      <TableRow key={e._id}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{e.entryNumber}</TableCell>
                        <TableCell>{new Date(e.date).toLocaleDateString(locale)}</TableCell>
                        <TableCell>{e.description}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{(e.totalDebit).toLocaleString(locale, { minimumFractionDigits: 2 })} €</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Projected schedule */}
        {schedule.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                {de ? `Abschreibungsplan (nächste ${scheduleMonths} Monate)` : `Depreciation schedule (next ${scheduleMonths} months)`}
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Zeitraum' : 'Period'}</TableCell>
                      <TableCell align="right">{de ? 'AfA-Betrag' : 'Dep. amount'}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {schedule.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{s.label}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(s.amount, locale)}</TableCell>
                      </TableRow>
                    ))}
                    {monthsLeft > 24 && (
                      <TableRow>
                        <TableCell colSpan={2} sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                          … {de ? `${monthsLeft - 24} weitere Monate` : `${monthsLeft - 24} more months`}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        )}
      </Stack>

      {/* Dispose dialog */}
      <Dialog open={disposeDialog} onClose={() => setDisposeDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{de ? 'Anlage abgang erfassen' : 'Record disposal'}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <DialogContentText variant="body2">
              {de
                ? `Buchwert zum Abgangsdatum: ${fmtCents(bookValue, locale)}. Ein Buchungs­satz für den Abgang wird automatisch erstellt.`
                : `Book value at disposal: ${fmtCents(bookValue, locale)}. A journal entry will be automatically posted.`}
            </DialogContentText>
            <TextField label={de ? 'Abgangsdatum' : 'Disposal date'} type="date" size="small"
              value={disposeDate} onChange={e => setDisposeDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label={de ? 'Verkaufserlös (€, 0 = verschrottet)' : 'Proceeds (€, 0 = scrapped)'}
              size="small" value={proceedsStr} onChange={e => setProceedsStr(e.target.value)} placeholder="0,00" />
            {disposeError && <Alert severity="error">{disposeError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisposeDialog(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button color="error" variant="contained" disabled={disposeMutation.isPending} onClick={() => disposeMutation.mutate()}>
            {disposeMutation.isPending ? <CircularProgress size={20} /> : (de ? 'Abgang buchen' : 'Post disposal')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
