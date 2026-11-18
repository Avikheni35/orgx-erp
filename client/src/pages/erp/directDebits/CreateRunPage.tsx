import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField,
  Grid, Alert, CircularProgress, Table, TableHead, TableBody, TableRow, TableCell,
  Checkbox, IconButton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { directDebitsApi, type SepaMandate } from '../../../api/directDebits';

const today = new Date().toISOString().slice(0, 10);

type RunEntry = {
  mandateId:   string;
  amountEur:   string;
  description: string;
  invoiceRef:  string;
};

export default function CreateRunPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';

  const [collectionDate, setDate]       = useState(today);
  const [bankAccount,    setBankAcc]    = useState('1200');
  const [notes,          setNotes]      = useState('');
  const [entries,        setEntries]    = useState<RunEntry[]>([]);
  const [error,          setError]      = useState('');

  const { data: mandateData, isLoading } = useQuery({
    queryKey: ['sepa-mandates', 'active'],
    queryFn:  () => directDebitsApi.listMandates({ status: 'active' }),
  });
  const mandates: SepaMandate[] = mandateData?.data?.mandates ?? [];

  function addMandate(m: SepaMandate) {
    if (entries.some(e => e.mandateId === m._id)) return;
    setEntries(prev => [...prev, { mandateId: m._id, amountEur: '', description: '', invoiceRef: '' }]);
  }

  function removeEntry(mandateId: string) {
    setEntries(prev => prev.filter(e => e.mandateId !== mandateId));
  }

  function updateEntry(mandateId: string, field: keyof Omit<RunEntry, 'mandateId'>, value: string) {
    setEntries(prev => prev.map(e => e.mandateId === mandateId ? { ...e, [field]: value } : e));
  }

  const totalCents = entries.reduce((s, e) => s + Math.round((parseFloat(e.amountEur.replace(',', '.')) || 0) * 100), 0);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        collectionDate, bankAccount, notes,
        entries: entries.map(e => ({
          mandateId:   e.mandateId,
          amountCents: Math.round((parseFloat(e.amountEur.replace(',', '.')) || 0) * 100),
          description: e.description,
          invoiceRef:  e.invoiceRef,
        })),
      };
      return directDebitsApi.createRun(payload);
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['direct-debit-runs'] });
      navigate(`/erp/zahlungen/lastschrift/runs/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function validate() {
    if (entries.length === 0) { setError(de ? 'Mindestens ein Mandat auswählen.' : 'Select at least one mandate.'); return false; }
    for (const e of entries) {
      const amt = parseFloat(e.amountEur.replace(',', '.'));
      if (!amt || amt <= 0) { setError(de ? 'Betrag für alle Positionen eingeben.' : 'Enter amount for all entries.'); return false; }
      if (!e.description)   { setError(de ? 'Verwendungszweck für alle Positionen eingeben.' : 'Enter description for all entries.'); return false; }
    }
    return true;
  }

  const mandateById = Object.fromEntries(mandates.map(m => [m._id, m]));

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} size="small" onClick={() => navigate('/erp/zahlungen/lastschrift')}>
          {de ? 'Lastschrift' : 'Direct Debit'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>
          {de ? 'Neuer Lastschriftlauf' : 'New direct debit run'}
        </Typography>
        <Button variant="contained"
          startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          disabled={mutation.isPending} onClick={() => { if (validate()) mutation.mutate(); }}>
          {de ? 'Speichern' : 'Save'}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={3}>
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField label={`${de ? 'Einzugsdatum' : 'Collection date'} *`} type="date" size="small" fullWidth
                  value={collectionDate} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Bankkonto' : 'Bank account'} size="small" fullWidth
                  value={bankAccount} onChange={e => setBankAcc(e.target.value)}
                  inputProps={{ style: { fontFamily: 'monospace' } }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Notizen' : 'Notes'} size="small" fullWidth
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Active mandates to pick from */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={1.5}>
              {de ? 'Mandate auswählen' : 'Select mandates'}
            </Typography>
            {isLoading && <CircularProgress size={20} />}
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>{de ? 'Mandatsreferenz' : 'Mandate ref.'}</TableCell>
                    <TableCell>{de ? 'Kunde' : 'Customer'}</TableCell>
                    <TableCell>IBAN</TableCell>
                    <TableCell>{de ? 'Sequenz' : 'Seq.'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mandates.map(m => (
                    <TableRow key={m._id} hover sx={{ cursor: 'pointer' }} onClick={() => addMandate(m)}>
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={entries.some(e => e.mandateId === m._id)} readOnly />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{m.mandateReference}</TableCell>
                      <TableCell>{m.customerName}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{m.iban}</TableCell>
                      <TableCell>{m.sequence}</TableCell>
                    </TableRow>
                  ))}
                  {mandates.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.disabled' }}>
                        {de ? 'Keine aktiven Mandate vorhanden.' : 'No active mandates.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        {/* Selected entries with amounts */}
        {entries.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={1.5}>
                {de ? 'Positionen' : 'Entries'} ({entries.length})
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Mandat' : 'Mandate'}</TableCell>
                      <TableCell>{de ? 'Kunde' : 'Customer'}</TableCell>
                      <TableCell sx={{ width: 130 }}>{de ? 'Betrag (€)' : 'Amount (€)'}</TableCell>
                      <TableCell sx={{ minWidth: 200 }}>{de ? 'Verwendungszweck' : 'Description'}</TableCell>
                      <TableCell sx={{ width: 120 }}>{de ? 'Referenz' : 'Ref.'}</TableCell>
                      <TableCell sx={{ width: 40 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entries.map(entry => {
                      const m = mandateById[entry.mandateId];
                      return (
                        <TableRow key={entry.mandateId}>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{m?.mandateReference}</TableCell>
                          <TableCell>{m?.customerName}</TableCell>
                          <TableCell>
                            <TextField size="small" type="number" sx={{ width: 120 }} value={entry.amountEur}
                              onChange={e => updateEntry(entry.mandateId, 'amountEur', e.target.value)}
                              inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right', fontFamily: 'monospace' } }}
                              placeholder="0,00" />
                          </TableCell>
                          <TableCell>
                            <TextField size="small" fullWidth value={entry.description}
                              onChange={e => updateEntry(entry.mandateId, 'description', e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <TextField size="small" value={entry.invoiceRef}
                              onChange={e => updateEntry(entry.mandateId, 'invoiceRef', e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" onClick={() => removeEntry(entry.mandateId)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell colSpan={2} align="right" sx={{ fontWeight: 700 }}>{de ? 'Gesamt' : 'Total'}</TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontFamily: 'monospace' }}>
                        {(totalCents / 100).toLocaleString(de ? 'de-DE' : 'en-GB', { minimumFractionDigits: 2 })} €
                      </TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
}
