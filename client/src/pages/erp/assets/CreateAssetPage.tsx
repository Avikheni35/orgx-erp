import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField,
  Alert, CircularProgress, Autocomplete, Select, MenuItem,
  FormControl, InputLabel, Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from 'react-i18next';
import { assetsApi, type FixedAssetCreate } from '../../../api/assets';
import { accountsApi } from '../../../api/accounts';

const CATEGORIES = ['EDV / IT', 'Maschinen', 'Fahrzeuge', 'Büroausstattung', 'Betriebs- und Geschäftsausstattung', 'Gebäude', 'Sonstiges'];

function centsFromStr(s: string) {
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export default function CreateAssetPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const navigate = useNavigate();

  const [name,           setName]          = useState('');
  const [category,       setCategory]      = useState('');
  const [description,    setDescription]   = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [costStr,        setCostStr]        = useState('');
  const [residualStr,    setResidualStr]    = useState('0');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(60);
  const [depMethod,      setDepMethod]      = useState<'linear' | 'none'>('linear');
  const [assetAccount,   setAssetAccount]   = useState('');
  const [depExpAccount,  setDepExpAccount]  = useState('');
  const [accDepAccount,  setAccDepAccount]  = useState('');
  const [error,          setError]          = useState('');

  const { data: acctData } = useQuery({ queryKey: ['accounts'], queryFn: () => accountsApi.list() });
  const accounts = useMemo(() => (acctData?.data?.accounts ?? []).filter(a => a.isActive), [acctData]);

  const costCents    = centsFromStr(costStr);
  const residualCents = centsFromStr(residualStr);
  const depBase      = costCents - residualCents;
  const monthly      = depMethod === 'linear' && usefulLifeMonths > 0 ? Math.round(depBase / usefulLifeMonths) : 0;
  const annualRate   = depBase > 0 && usefulLifeMonths > 0 ? (1200 / usefulLifeMonths).toFixed(2) : '0';

  function fmtCents(c: number) {
    return (c / 100).toLocaleString(de ? 'de-DE' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  const mutation = useMutation({
    mutationFn: (body: FixedAssetCreate) => assetsApi.create(body),
    onSuccess: (res) => navigate(`/erp/anlagen/${res.data._id}`),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function handleSubmit() {
    setError('');
    if (!name)          return setError(de ? 'Bezeichnung erforderlich.' : 'Name required.');
    if (costCents < 1)  return setError(de ? 'AHK > 0 erforderlich.' : 'Acquisition cost required.');
    if (!acquisitionDate) return setError(de ? 'Anschaffungsdatum erforderlich.' : 'Acquisition date required.');
    if (!assetAccount)  return setError(de ? 'Anlagenkonto erforderlich.' : 'Asset account required.');
    if (depMethod === 'linear' && !depExpAccount) return setError(de ? 'AfA-Aufwandskonto erforderlich.' : 'Depreciation expense account required.');
    if (depMethod === 'linear' && !accDepAccount) return setError(de ? 'Kumuliertes AfA-Konto erforderlich.' : 'Accumulated depreciation account required.');
    mutation.mutate({
      name, category, description, acquisitionDate,
      acquisitionCostCents: costCents,
      residualValueCents:   residualCents,
      usefulLifeMonths,
      depreciationMethod:   depMethod,
      assetAccount,
      depreciationExpenseAccount: depExpAccount || assetAccount,
      accumulatedDepAccount:      accDepAccount || assetAccount,
    });
  }

  return (
    <Box maxWidth={820}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/anlagen')}>
          {de ? 'Anlagen' : 'Assets'}
        </Button>
        <Typography variant="h5" fontWeight={700} ml={1}>
          {de ? 'Neue Anlage erfassen' : 'Add fixed asset'}
        </Typography>
      </Stack>

      <Stack gap={3}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>{de ? 'Stammdaten' : 'Master data'}</Typography>
            <Stack gap={2}>
              <TextField label={de ? 'Bezeichnung' : 'Name'} size="small" value={name} onChange={e => setName(e.target.value)} required />
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                <Autocomplete
                  size="small"
                  sx={{ flex: 1 }}
                  freeSolo
                  options={CATEGORIES}
                  value={category}
                  onInputChange={(_, v) => setCategory(v)}
                  renderInput={(params) => <TextField {...params} label={de ? 'Kategorie' : 'Category'} />}
                />
                <TextField
                  label={de ? 'Anschaffungsdatum' : 'Acquisition date'}
                  type="date"
                  size="small"
                  value={acquisitionDate}
                  onChange={e => setAcquisitionDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <TextField
                label={de ? 'Beschreibung / Seriennummer' : 'Description / serial no.'}
                size="small"
                value={description}
                onChange={e => setDescription(e.target.value)}
                multiline
                rows={2}
              />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>{de ? 'Bewertung & Abschreibung' : 'Valuation & depreciation'}</Typography>
            <Stack gap={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                <TextField label={de ? 'Anschaffungskosten (€)' : 'Acquisition cost (€)'} size="small" value={costStr}
                  onChange={e => setCostStr(e.target.value)} placeholder="0,00" sx={{ flex: 1 }} />
                <TextField label={de ? 'Restwert (€)' : 'Residual value (€)'} size="small" value={residualStr}
                  onChange={e => setResidualStr(e.target.value)} placeholder="0,00" sx={{ flex: 1 }} />
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel>{de ? 'Abschreibungsmethode' : 'Method'}</InputLabel>
                  <Select value={depMethod} label={de ? 'Abschreibungsmethode' : 'Method'}
                    onChange={e => setDepMethod(e.target.value as 'linear' | 'none')}>
                    <MenuItem value="linear">{de ? 'Linear (Straight-line)' : 'Straight-line (linear)'}</MenuItem>
                    <MenuItem value="none">{de ? 'Keine Abschreibung' : 'No depreciation'}</MenuItem>
                  </Select>
                </FormControl>
                {depMethod === 'linear' && (
                  <TextField label={de ? 'Nutzungsdauer (Monate)' : 'Useful life (months)'}
                    type="number" size="small" value={usefulLifeMonths}
                    onChange={e => setUsefulLifeMonths(Math.max(1, parseInt(e.target.value) || 1))}
                    sx={{ flex: 1 }}
                  />
                )}
              </Stack>

              {depMethod === 'linear' && costCents > 0 && (
                <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Stack direction="row" gap={4}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{de ? 'Monatliche AfA' : 'Monthly dep.'}</Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(monthly)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{de ? 'Jährliche AfA' : 'Annual dep.'}</Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(monthly * 12)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{de ? 'AfA-Satz p.a.' : 'Annual rate'}</Typography>
                      <Typography variant="body2" fontWeight={700}>{annualRate}%</Typography>
                    </Box>
                  </Stack>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>{de ? 'Kontenverknüpfung' : 'Account assignment'}</Typography>
            <Stack gap={2}>
              <Autocomplete size="small" options={accounts} getOptionLabel={a => `${a.number} – ${a.name}`}
                value={accounts.find(a => a.number === assetAccount) ?? null}
                onChange={(_, v) => setAssetAccount(v?.number ?? '')}
                renderInput={(params) => <TextField {...params} label={de ? 'Anlagenkonto (z.B. 0400 IT-Ausstattung)' : 'Asset account (e.g. 0400)'} />}
              />
              <Divider />
              <Autocomplete size="small" options={accounts} getOptionLabel={a => `${a.number} – ${a.name}`}
                value={accounts.find(a => a.number === depExpAccount) ?? null}
                onChange={(_, v) => setDepExpAccount(v?.number ?? '')}
                renderInput={(params) => <TextField {...params} label={de ? 'AfA-Aufwandskonto (z.B. 4830 Abschreibungen IT)' : 'Depreciation expense account (e.g. 4830)'} />}
              />
              <Autocomplete size="small" options={accounts} getOptionLabel={a => `${a.number} – ${a.name}`}
                value={accounts.find(a => a.number === accDepAccount) ?? null}
                onChange={(_, v) => setAccDepAccount(v?.number ?? '')}
                renderInput={(params) => <TextField {...params} label={de ? 'Kumuliertes AfA-Konto (z.B. 0440 Wertberichtigung IT)' : 'Accumulated depreciation account (e.g. 0440)'} />}
              />
            </Stack>
          </CardContent>
        </Card>

        {error && <Alert severity="error">{error}</Alert>}

        <Stack direction="row" gap={2} justifyContent="flex-end">
          <Button variant="outlined" onClick={() => navigate('/erp/anlagen')}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? <CircularProgress size={20} /> : (de ? 'Anlage speichern' : 'Save asset')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
