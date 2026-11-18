import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField,
  Select, MenuItem, FormControl, InputLabel, Grid, Alert, CircularProgress,
  RadioGroup, FormControlLabel, Radio, FormLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from 'react-i18next';
import { accrualsApi, type AccrualType, type CreateAccrualPayload } from '../../../api/accruals';

const today = new Date().toISOString().slice(0, 10);
const nextYearStart = `${new Date().getFullYear() + 1}-01-01`;

// Default accounts per type (SKR03)
const DEFAULTS: Record<AccrualType, { accrualAccount: string; contraAccount: string }> = {
  arap: { accrualAccount: '0980', contraAccount: '4200' },
  prap: { accrualAccount: '0990', contraAccount: '8400' },
};

export default function CreateAccrualPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';

  const [type,              setType]              = useState<AccrualType>('arap');
  const [description,       setDescription]       = useState('');
  const [accrualAccount,    setAccrualAccount]    = useState(DEFAULTS.arap.accrualAccount);
  const [contraAccount,     setContraAccount]     = useState(DEFAULTS.arap.contraAccount);
  const [amountEur,         setAmountEur]         = useState('');
  const [postDate,          setPostDate]          = useState(today);
  const [startDate,         setStartDate]         = useState(today);
  const [endDate,           setEndDate]           = useState(nextYearStart);
  const [referenceDocument, setRef]               = useState('');
  const [notes,             setNotes]             = useState('');
  const [error,             setError]             = useState('');

  function handleTypeChange(v: AccrualType) {
    setType(v);
    setAccrualAccount(DEFAULTS[v].accrualAccount);
    setContraAccount(DEFAULTS[v].contraAccount);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const amountCents = Math.round(parseFloat(amountEur.replace(',', '.')) * 100);
      const payload: CreateAccrualPayload = {
        type, description, accrualAccount, contraAccount, amountCents,
        postDate, startDate, endDate, referenceDocument, notes,
      };
      return accrualsApi.create(payload);
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['accruals'] });
      navigate(`/erp/buchfuehrung/abgrenzungen/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function validate() {
    if (!description) { setError(de ? 'Beschreibung eingeben.' : 'Enter a description.'); return false; }
    if (!accrualAccount) { setError(de ? 'Abgrenzungskonto eingeben.' : 'Enter accrual account.'); return false; }
    if (!contraAccount)  { setError(de ? 'Gegenkonto eingeben.' : 'Enter contra account.'); return false; }
    const amt = parseFloat(amountEur.replace(',', '.'));
    if (!amt || amt <= 0) { setError(de ? 'Betrag eingeben.' : 'Enter an amount.'); return false; }
    return true;
  }

  const TYPE_HELP = {
    arap: de
      ? 'Aktive Rechnungsabgrenzung: Aufwand der Folgeperiode im Voraus gezahlt (z.B. Vorauszahlung Versicherung).'
      : 'Prepaid expense: payment made now for a cost belonging to a future period (e.g. prepaid insurance).',
    prap: de
      ? 'Passive Rechnungsabgrenzung: Ertrag der Folgeperiode im Voraus empfangen (z.B. vorausgezahltes Abo).'
      : 'Deferred revenue: payment received now for a service to be delivered in a future period (e.g. prepaid subscription).',
  };

  return (
    <Box maxWidth={800}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} size="small"
          onClick={() => navigate('/erp/buchfuehrung/abgrenzungen')}>
          {de ? 'Abgrenzungsposten' : 'Accruals'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>
          {de ? 'Neue Abgrenzung' : 'New accrual / deferral'}
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
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <FormLabel component="legend" sx={{ mb: 1, fontWeight: 600 }}>
                {de ? 'Typ' : 'Type'}
              </FormLabel>
              <RadioGroup row value={type} onChange={e => handleTypeChange(e.target.value as AccrualType)}>
                <FormControlLabel value="arap" control={<Radio />}
                  label={de ? 'ARAP — Aktive Rechnungsabgrenzung' : 'ARAP — Prepaid expense'} />
                <FormControlLabel value="prap" control={<Radio />}
                  label={de ? 'PRAP — Passive Rechnungsabgrenzung' : 'PRAP — Deferred revenue'} />
              </RadioGroup>
            </FormControl>
            <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>{TYPE_HELP[type]}</Alert>

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField label={`${de ? 'Beschreibung' : 'Description'} *`} size="small" fullWidth
                  value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={de ? 'z.B. Kfz-Versicherung Jan–Dez 2026' : 'e.g. Car insurance Jan–Dec 2026'} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Abgrenzungskonto' : 'Accrual account'} size="small" fullWidth
                  value={accrualAccount} onChange={e => setAccrualAccount(e.target.value)}
                  helperText={type === 'arap' ? (de ? 'i.d.R. 0980 (ARAP)' : 'typically 0980 (ARAP)') : (de ? 'i.d.R. 0990 (PRAP)' : 'typically 0990 (PRAP)')}
                  inputProps={{ style: { fontFamily: 'monospace' } }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Gegenkonto' : 'Contra account'} size="small" fullWidth
                  value={contraAccount} onChange={e => setContraAccount(e.target.value)}
                  helperText={type === 'arap' ? (de ? 'Aufwandskonto (4xxx)' : 'Expense account (4xxx)') : (de ? 'Ertragskonto (8xxx)' : 'Revenue account (8xxx)')}
                  inputProps={{ style: { fontFamily: 'monospace' } }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={`${de ? 'Betrag (€)' : 'Amount (€)'} *`} size="small" fullWidth
                  type="number" value={amountEur} onChange={e => setAmountEur(e.target.value)}
                  inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right', fontFamily: 'monospace' } }}
                  placeholder="0,00" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={`${de ? 'Buchungsdatum' : 'Post date'} *`} type="date" size="small" fullWidth
                  value={postDate} onChange={e => setPostDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Bezug / Referenz' : 'Reference'} size="small" fullWidth
                  value={referenceDocument} onChange={e => setRef(e.target.value)}
                  placeholder={de ? 'z.B. RE-2025-00042' : 'e.g. INV-2025-00042'} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={`${de ? 'Beginn Abgrenzungszeitraum' : 'Period start'} *`} type="date" size="small" fullWidth
                  value={startDate} onChange={e => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={`${de ? 'Ende / Auflösungsdatum' : 'Period end / reversal date'} *`} type="date" size="small" fullWidth
                  value={endDate} onChange={e => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12}>
                <TextField label={de ? 'Notizen' : 'Notes'} size="small" fullWidth multiline rows={2}
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
