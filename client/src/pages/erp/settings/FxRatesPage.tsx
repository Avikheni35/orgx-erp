import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Table, TableHead, TableBody,
  TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, IconButton, Tooltip, Chip, Divider,
  FormControl, InputLabel, Select, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTranslation } from 'react-i18next';
import { fxRatesApi, type FxRatePayload, COMMON_CURRENCIES } from '../../../api/fxRates';
import { useCanWrite } from '../../../hooks/useCanWrite';

const EMPTY: FxRatePayload = {
  quoteCurrency: 'USD',
  rate:          1.0,
  date:          new Date().toISOString().slice(0, 10),
  source:        'manual',
};

function fmtRate(r: number) {
  return r.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

export default function FxRatesPage() {
  const { i18n } = useTranslation();
  const de = i18n.language === 'de';
  const qc = useQueryClient();
  const canWrite = useCanWrite();

  const [currencyFilter, setCurrencyFilter] = useState('');
  const [dialogOpen, setDialogOpen]          = useState(false);
  const [form, setForm]                      = useState<FxRatePayload>(EMPTY);
  const [rateStr, setRateStr]                = useState('1.0');
  const [saveError, setSaveError]            = useState('');
  const [delConfirm, setDelConfirm]          = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fx-rates', currencyFilter],
    queryFn: () => fxRatesApi.list({ currency: currencyFilter || undefined, limit: 200 }),
  });
  const rates = data?.data?.rates ?? [];

  const saveMut = useMutation({
    mutationFn: (payload: FxRatePayload) => fxRatesApi.create(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fx-rates'] }); setDialogOpen(false); setSaveError(''); },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setSaveError(err?.response?.data?.message ?? (de ? 'Fehler beim Speichern.' : 'Save failed.'));
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => fxRatesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fx-rates'] }); setDelConfirm(null); },
  });

  function openCreate() {
    setForm({ ...EMPTY, date: new Date().toISOString().slice(0, 10) });
    setRateStr('1.0');
    setSaveError('');
    setDialogOpen(true);
  }

  function handleSave() {
    const rate = parseFloat(rateStr.replace(',', '.'));
    if (isNaN(rate) || rate <= 0) { setSaveError(de ? 'Kurs muss positiv sein.' : 'Rate must be positive.'); return; }
    saveMut.mutate({ ...form, rate });
  }

  // Group rates by currency
  const byCurrency: Record<string, typeof rates> = {};
  for (const r of rates) {
    (byCurrency[r.quoteCurrency] ??= []).push(r);
  }
  const currencies = Object.keys(byCurrency).sort();

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Wechselkurse' : 'Exchange Rates'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'EUR-Gegenwert je Fremdwährung für Auslandsrechnungen' : 'EUR equivalent per foreign currency for cross-border invoices'}
          </Typography>
        </Box>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            {de ? 'Kurs eintragen' : 'Add rate'}
          </Button>
        )}
      </Stack>

      <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 3 }}>
        {de
          ? 'Kurse beziehen sich auf EUR als Basiswährung. Ein Kurs von 1.08 für USD bedeutet: 1 EUR = 1.08 USD. Beim Buchen einer Fremdwährungsrechnung wird der Kurs automatisch angewendet.'
          : 'Rates are quoted against EUR as base currency. A rate of 1.08 for USD means: 1 EUR = 1.08 USD. When posting a foreign-currency invoice the rate is applied automatically.'}
      </Alert>

      {/* Filter */}
      <Stack direction="row" gap={2} mb={2} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{de ? 'Währung filtern' : 'Filter currency'}</InputLabel>
          <Select value={currencyFilter} label={de ? 'Währung filtern' : 'Filter currency'}
            onChange={e => setCurrencyFilter(e.target.value)}>
            <MenuItem value="">{de ? 'Alle Währungen' : 'All currencies'}</MenuItem>
            {COMMON_CURRENCIES.map(c => (
              <MenuItem key={c.code} value={c.code}>{c.code} – {c.label.split('(')[0].trim()}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          {rates.length} {de ? 'Einträge' : 'entries'}
        </Typography>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && currencies.length === 0 && (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <Typography color="text.secondary">
              {de ? 'Noch keine Wechselkurse eingetragen.' : 'No exchange rates entered yet.'}
            </Typography>
            {canWrite && (
              <Button variant="outlined" sx={{ mt: 2 }} onClick={openCreate} startIcon={<AddIcon />}>
                {de ? 'Ersten Kurs eintragen' : 'Add first rate'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {currencies.map(currency => (
        <Card key={currency} variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ pb: '8px !important' }}>
            <Stack direction="row" alignItems="center" gap={1} mb={1}>
              <Typography variant="subtitle1" fontWeight={700}>{currency}</Typography>
              <Chip size="small" label={`EUR / ${currency}`} variant="outlined" />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                {byCurrency[currency].length} {de ? 'Einträge' : 'entries'}
              </Typography>
            </Stack>
            <Divider sx={{ mb: 1 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                  <TableCell align="right">{de ? 'Kurs (1 EUR = X)' : 'Rate (1 EUR = X)'}</TableCell>
                  <TableCell>{de ? 'Quelle' : 'Source'}</TableCell>
                  {canWrite && <TableCell align="center" width={48} />}
                </TableRow>
              </TableHead>
              <TableBody>
                {byCurrency[currency].map(r => (
                  <TableRow key={r._id} hover>
                    <TableCell>{new Date(r.date).toLocaleDateString(de ? 'de-DE' : 'en-GB')}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtRate(r.rate)}
                    </TableCell>
                    <TableCell>
                      <Chip size="small"
                        label={r.source === 'ecb' ? 'EZB' : (de ? 'Manuell' : 'Manual')}
                        color={r.source === 'ecb' ? 'primary' : 'default'} />
                    </TableCell>
                    {canWrite && (
                      <TableCell align="center">
                        <Tooltip title={de ? 'Löschen' : 'Delete'}>
                          <IconButton size="small" color="error" onClick={() => setDelConfirm(r._id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Add rate dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{de ? 'Wechselkurs eintragen' : 'Add exchange rate'}</DialogTitle>
        <DialogContent>
          {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
          <Stack gap={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>{de ? 'Währung' : 'Currency'}</InputLabel>
              <Select value={form.quoteCurrency} label={de ? 'Währung' : 'Currency'}
                onChange={e => setForm(f => ({ ...f, quoteCurrency: e.target.value }))}>
                {COMMON_CURRENCIES.map(c => (
                  <MenuItem key={c.code} value={c.code}>{c.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              required
              label={de ? `1 EUR = ? ${form.quoteCurrency}` : `1 EUR = ? ${form.quoteCurrency}`}
              size="small" fullWidth
              value={rateStr}
              onChange={e => setRateStr(e.target.value)}
              helperText={de ? 'z.B. 1.08 für EUR/USD' : 'e.g. 1.08 for EUR/USD'}
              inputProps={{ inputMode: 'decimal' }}
            />
            <TextField
              required
              label={de ? 'Kursdatum' : 'Rate date'}
              size="small" fullWidth type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>{de ? 'Quelle' : 'Source'}</InputLabel>
              <Select value={form.source} label={de ? 'Quelle' : 'Source'}
                onChange={e => setForm(f => ({ ...f, source: e.target.value as 'manual' | 'ecb' }))}>
                <MenuItem value="manual">{de ? 'Manuell' : 'Manual'}</MenuItem>
                <MenuItem value="ecb">{de ? 'EZB (Europäische Zentralbank)' : 'ECB (European Central Bank)'}</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={saveMut.isPending} onClick={handleSave}>
            {de ? 'Speichern' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!delConfirm} onClose={() => setDelConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{de ? 'Löschen bestätigen' : 'Confirm delete'}</DialogTitle>
        <DialogContent>
          <Typography>{de ? 'Diesen Wechselkurs wirklich löschen?' : 'Delete this exchange rate?'}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelConfirm(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button color="error" variant="contained" disabled={delMut.isPending}
            onClick={() => delConfirm && delMut.mutate(delConfirm)}>
            {de ? 'Löschen' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
