import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Card, CardContent, Table, TableHead, TableBody,
  TableRow, TableCell, CircularProgress, Alert, Chip, Select, MenuItem, FormControl,
  InputLabel, Grid, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { elsterApi, type FilingStatus, type FilingType, type UvaComputed } from '../../../api/elster';

const STATUS_COLOR: Record<FilingStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  draft:     'default',
  ready:     'warning',
  submitted: 'info',
  confirmed: 'success',
  rejected:  'error',
};

const MONTHS_DE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function ElsterPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [statusFilter, setStatus]  = useState('');
  const [yearFilter,   setYear]    = useState('');
  const [createOpen,   setCreate]  = useState(false);

  // Create dialog state
  const [type,       setType]       = useState('uva');
  const [year,       setYearVal]    = useState(new Date().getFullYear());
  const [period,     setPeriod]     = useState(new Date().getMonth() + 1);
  const [periodType, setPeriodType] = useState('monthly');
  const [notes,      setNotes]      = useState('');
  const [preview,    setPreview]    = useState<UvaComputed | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [createError,    setCreateError]    = useState('');

  const STATUS_LABEL: Record<FilingStatus, string> = {
    draft:     de ? 'Entwurf'     : 'Draft',
    ready:     de ? 'Freigegeben' : 'Ready',
    submitted: de ? 'Eingereicht' : 'Submitted',
    confirmed: de ? 'Bestätigt'   : 'Confirmed',
    rejected:  de ? 'Abgelehnt'   : 'Rejected',
  };

  const TYPE_LABEL: Record<FilingType, string> = {
    uva: 'UStVA',
    zm:  'ZM',
    lsz: 'LSt-Anm.',
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['elster-filings', statusFilter, yearFilter],
    queryFn:  () => elsterApi.list({
      status: statusFilter || undefined,
      year:   yearFilter ? parseInt(yearFilter, 10) : undefined,
    }),
  });
  const filings = data?.data?.filings ?? [];

  const createMut = useMutation({
    mutationFn: () => elsterApi.create({ type, year, period, periodType, notes }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['elster-filings'] });
      setCreate(false);
      navigate(`/erp/steuer/elster/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setCreateError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  async function loadPreview() {
    setPreviewLoading(true);
    try {
      const res = await elsterApi.compute(year, period, periodType);
      setPreview(res.data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function periodLabel(p: number, pt: string, yr: number) {
    const months = de ? MONTHS_DE : MONTHS_EN;
    if (pt === 'quarterly') return `Q${p} ${yr}`;
    return `${months[p - 1]} ${yr}`;
  }

  const fmt = (n: number) => n.toLocaleString(de ? 'de-DE' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>ELSTER</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Steueranmeldungen — UStVA, ZM, Lohnsteueranmeldung' : 'Tax filings — VAT return, EC sales list, payroll tax'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setPreview(null); setCreateError(''); setCreate(true); }}>
          {de ? 'Neue Meldung' : 'New filing'}
        </Button>
      </Stack>

      <Stack direction="row" gap={2} mb={2} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatus(e.target.value)}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            {(Object.keys(STATUS_LABEL) as FilingStatus[]).map(s => (
              <MenuItem key={s} value={s}>{STATUS_LABEL[s]}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField label={de ? 'Jahr' : 'Year'} size="small" sx={{ width: 100 }}
          type="number" value={yearFilter} onChange={e => setYear(e.target.value)} />
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                <TableCell>{de ? 'Art' : 'Type'}</TableCell>
                <TableCell>{de ? 'Zeitraum' : 'Period'}</TableCell>
                <TableCell align="right">{de ? 'Umsätze (19%)' : 'Revenue (19%)'}</TableCell>
                <TableCell align="right">{de ? 'USt.' : 'Output tax'}</TableCell>
                <TableCell align="right">{de ? 'Vorsteuer' : 'Input tax'}</TableCell>
                <TableCell align="right">{de ? 'Zahllast' : 'Net payable'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Keine Meldungen gefunden.' : 'No filings found.'}
                  </TableCell>
                </TableRow>
              )}
              {filings.map(f => (
                <TableRow key={f._id} hover sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/erp/steuer/elster/${f._id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{f.filingNumber}</TableCell>
                  <TableCell><Chip size="small" label={TYPE_LABEL[f.type]} variant="outlined" /></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{periodLabel(f.period, f.periodType, f.year)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(f.taxableRevenue19)} €</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(f.outputTax19 + f.outputTax7)} €</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(f.inputTax)} €</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                    color: f.netTaxPayable >= 0 ? 'error.main' : 'success.main' }}>
                    {fmt(Math.abs(f.netTaxPayable))} €{f.netTaxPayable < 0 ? ' ✓' : ''}
                  </TableCell>
                  <TableCell><Chip size="small" label={STATUS_LABEL[f.status]} color={STATUS_COLOR[f.status]} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreate(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{de ? 'Neue Steueranmeldung' : 'New tax filing'}</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={4}>
              <FormControl size="small" fullWidth>
                <InputLabel>{de ? 'Art' : 'Type'}</InputLabel>
                <Select value={type} label={de ? 'Art' : 'Type'} onChange={e => { setType(e.target.value); setPreview(null); }}>
                  <MenuItem value="uva">{de ? 'UStVA — Umsatzsteuervoranmeldung' : 'UStVA — VAT advance return'}</MenuItem>
                  <MenuItem value="zm">{de ? 'ZM — Zusammenfassende Meldung' : 'ZM — EC Sales List'}</MenuItem>
                  <MenuItem value="lsz">{de ? 'LSt-Anm. — Lohnsteueranmeldung' : 'LSt — Payroll tax return'}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4}>
              <FormControl size="small" fullWidth>
                <InputLabel>{de ? 'Zeitraumtyp' : 'Period type'}</InputLabel>
                <Select value={periodType} label={de ? 'Zeitraumtyp' : 'Period type'}
                  onChange={e => { setPeriodType(e.target.value); setPreview(null); }}>
                  <MenuItem value="monthly">{de ? 'Monatlich' : 'Monthly'}</MenuItem>
                  <MenuItem value="quarterly">{de ? 'Vierteljährlich' : 'Quarterly'}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField label={de ? 'Jahr' : 'Year'} size="small" fullWidth type="number"
                value={year} onChange={e => { setYearVal(parseInt(e.target.value, 10)); setPreview(null); }} />
            </Grid>
            <Grid item xs={6} sm={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>{de ? 'Periode' : 'Period'}</InputLabel>
                <Select value={period} label={de ? 'Periode' : 'Period'}
                  onChange={e => { setPeriod(Number(e.target.value)); setPreview(null); }}>
                  {periodType === 'monthly'
                    ? Array.from({ length: 12 }, (_, i) => (
                        <MenuItem key={i + 1} value={i + 1}>{(de ? MONTHS_DE : MONTHS_EN)[i]}</MenuItem>
                      ))
                    : [1, 2, 3, 4].map(q => <MenuItem key={q} value={q}>Q{q}</MenuItem>)
                  }
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField label={de ? 'Notizen' : 'Notes'} size="small" fullWidth
                value={notes} onChange={e => setNotes(e.target.value)} />
            </Grid>
            {type === 'uva' && (
              <Grid item xs={12}>
                <Button size="small" variant="outlined" disabled={previewLoading}
                  onClick={loadPreview}
                  startIcon={previewLoading ? <CircularProgress size={14} /> : undefined}>
                  {de ? 'Berechnung vorschau' : 'Preview computed values'}
                </Button>
              </Grid>
            )}
            {preview && type === 'uva' && (
              <Grid item xs={12}>
                <Divider sx={{ mb: 1 }} />
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  {de ? 'Berechnete Werte aus Buchungen' : 'Values computed from journal entries'}
                </Typography>
                <Stack gap={0.5}>
                  {[
                    [de ? 'Umsätze 19% (KZ 81)' : 'Revenue 19% (KZ 81)', preview.taxableRevenue19],
                    [de ? 'Umsätze 7% (KZ 86)'  : 'Revenue 7% (KZ 86)',  preview.taxableRevenue7],
                    [de ? 'USt 19% (KZ 62)'      : 'Output tax 19%',      preview.outputTax19],
                    [de ? 'USt 7%'               : 'Output tax 7%',       preview.outputTax7],
                    [de ? 'Vorsteuer (KZ 66)'    : 'Input tax (KZ 66)',   preview.inputTax],
                    [de ? 'Zahllast (KZ 83)'     : 'Net payable (KZ 83)', preview.netTaxPayable],
                  ].map(([label, val]) => (
                    <Stack key={String(label)} direction="row" justifyContent="space-between">
                      <Typography variant="caption">{label}</Typography>
                      <Typography variant="caption" fontFamily="monospace">{fmt(val as number)} €</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreate(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
            {de ? 'Erstellen' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
