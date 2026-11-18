import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField,
  Select, MenuItem, FormControl, InputLabel, Grid, Alert, CircularProgress, Autocomplete,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from 'react-i18next';
import { directDebitsApi } from '../../../api/directDebits';
import { customersApi } from '../../../api/customers';

const today = new Date().toISOString().slice(0, 10);

export default function CreateMandatePage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';

  const [customerId, setCustomerId] = useState('');
  const [type,       setType]       = useState('CORE');
  const [sequence,   setSequence]   = useState('FRST');
  const [iban,       setIban]       = useState('');
  const [bic,        setBic]        = useState('');
  const [signedAt,   setSignedAt]   = useState(today);
  const [creditorId, setCreditorId] = useState('');
  const [notes,      setNotes]      = useState('');
  const [error,      setError]      = useState('');

  const { data: custData } = useQuery({
    queryKey: ['customers', 'active'],
    queryFn:  () => customersApi.list({ active: true }),
  });
  const customers = custData?.data?.customers ?? [];

  const mutation = useMutation({
    mutationFn: () => directDebitsApi.createMandate({ customerId, type, sequence, iban, bic, signedAt, creditorId, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sepa-mandates'] });
      navigate('/erp/zahlungen/lastschrift');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function validate() {
    if (!customerId)    { setError(de ? 'Kunde auswählen.' : 'Select a customer.'); return false; }
    if (!iban.trim())   { setError(de ? 'IBAN eingeben.' : 'Enter IBAN.'); return false; }
    if (!signedAt)      { setError(de ? 'Unterzeichnungsdatum eingeben.' : 'Enter signed date.'); return false; }
    return true;
  }

  return (
    <Box maxWidth={700}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} size="small" onClick={() => navigate('/erp/zahlungen/lastschrift')}>
          {de ? 'Lastschrift' : 'Direct Debit'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>
          {de ? 'Neues SEPA-Mandat' : 'New SEPA Mandate'}
        </Typography>
        <Button variant="contained"
          startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          disabled={mutation.isPending} onClick={() => { if (validate()) mutation.mutate(); }}>
          {de ? 'Speichern' : 'Save'}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Autocomplete size="small" options={customers} getOptionLabel={c => c.companyName}
                value={customers.find(c => c._id === customerId) ?? null}
                onChange={(_, v) => setCustomerId(v?._id ?? '')}
                renderInput={p => <TextField {...p} label={`${de ? 'Kunde' : 'Customer'} *`} />} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl size="small" fullWidth>
                <InputLabel>{de ? 'Typ' : 'Type'}</InputLabel>
                <Select value={type} label={de ? 'Typ' : 'Type'} onChange={e => setType(e.target.value)}>
                  <MenuItem value="CORE">CORE {de ? '(Privatkunden)' : '(B2C)'}</MenuItem>
                  <MenuItem value="B2B">B2B {de ? '(Firmenkunden)' : '(B2B)'}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl size="small" fullWidth>
                <InputLabel>{de ? 'Sequenz' : 'Sequence'}</InputLabel>
                <Select value={sequence} label={de ? 'Sequenz' : 'Sequence'} onChange={e => setSequence(e.target.value)}>
                  <MenuItem value="FRST">FRST — {de ? 'Erstlastschrift' : 'First'}</MenuItem>
                  <MenuItem value="RCUR">RCUR — {de ? 'Folgelastschrift' : 'Recurring'}</MenuItem>
                  <MenuItem value="OOFF">OOFF — {de ? 'Einmalig' : 'One-off'}</MenuItem>
                  <MenuItem value="FNAL">FNAL — {de ? 'Letzte' : 'Final'}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label={`${de ? 'Unterzeichnet am' : 'Signed at'} *`} type="date" size="small" fullWidth
                value={signedAt} onChange={e => setSignedAt(e.target.value)} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField label={`IBAN *`} size="small" fullWidth value={iban}
                onChange={e => setIban(e.target.value.toUpperCase())}
                inputProps={{ style: { fontFamily: 'monospace', letterSpacing: '0.05em' } }}
                placeholder="DE89 3704 0044 0532 0130 00" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="BIC" size="small" fullWidth value={bic}
                onChange={e => setBic(e.target.value.toUpperCase())}
                inputProps={{ style: { fontFamily: 'monospace' } }}
                placeholder="COBADEFFXXX" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label={de ? 'Gläubiger-ID (CI)' : 'Creditor ID (CI)'} size="small" fullWidth
                value={creditorId} onChange={e => setCreditorId(e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace' } }}
                placeholder="DE98ZZZ09999999999" />
            </Grid>
            <Grid item xs={12}>
              <TextField label={de ? 'Notizen' : 'Notes'} size="small" fullWidth multiline rows={2}
                value={notes} onChange={e => setNotes(e.target.value)} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
