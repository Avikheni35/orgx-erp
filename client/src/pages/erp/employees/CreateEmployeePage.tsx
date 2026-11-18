import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField, Select,
  MenuItem, FormControl, InputLabel, Grid, Alert, CircularProgress, Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from 'react-i18next';
import { employeesApi, type EmployeeCreate, type SalaryType, type TaxClass } from '../../../api/employees';

const EMPTY: EmployeeCreate = {
  firstName: '', lastName: '', dateOfBirth: '', email: '', phone: '', address: '',
  department: '', position: '', startDate: new Date().toISOString().slice(0, 10),
  salaryType: 'monthly', salaryCents: 0, taxClass: '1',
  healthInsurance: '', steuerIdEncrypted: '', svNummerEncrypted: '', ibanEncrypted: '',
  personnelAccount: '4120', costCenterNumber: '', notes: '',
};

export default function CreateEmployeePage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';

  const [form,       setForm]       = useState<EmployeeCreate>(EMPTY);
  const [salaryStr,  setSalaryStr]  = useState('0');
  const [error,      setError]      = useState('');

  const set = <K extends keyof EmployeeCreate>(k: K, v: EmployeeCreate[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => employeesApi.create({
      ...form,
      salaryCents: Math.round(parseFloat(salaryStr.replace(',', '.') || '0') * 100),
    }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      navigate(`/erp/mitarbeiter/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler beim Speichern.' : 'Save failed.'));
    },
  });

  function validate(): boolean {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError(de ? 'Vor- und Nachname sind Pflichtfelder.' : 'First and last name are required.');
      return false;
    }
    if (!form.startDate) {
      setError(de ? 'Eintrittsdatum ist ein Pflichtfeld.' : 'Start date is required.');
      return false;
    }
    return true;
  }

  return (
    <Box maxWidth={860}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/mitarbeiter')} size="small">
          {de ? 'Mitarbeiter' : 'Employees'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>
          {de ? 'Neuen Mitarbeiter anlegen' : 'Create employee'}
        </Typography>
        <Button variant="contained" startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          disabled={mutation.isPending} onClick={() => { if (validate()) mutation.mutate(); }}>
          {de ? 'Speichern' : 'Save'}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={3}>
        {/* Personal data */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Persönliche Daten' : 'Personal data'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField label={`${de ? 'Vorname' : 'First name'} *`} size="small" fullWidth
                  value={form.firstName} onChange={e => set('firstName', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={`${de ? 'Nachname' : 'Last name'} *`} size="small" fullWidth
                  value={form.lastName} onChange={e => set('lastName', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Geburtsdatum' : 'Date of birth'} type="date" size="small" fullWidth
                  value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'E-Mail' : 'Email'} type="email" size="small" fullWidth
                  value={form.email} onChange={e => set('email', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Telefon' : 'Phone'} size="small" fullWidth
                  value={form.phone} onChange={e => set('phone', e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField label={de ? 'Adresse' : 'Address'} size="small" fullWidth multiline rows={2}
                  value={form.address} onChange={e => set('address', e.target.value)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Employment */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Anstellungsdaten' : 'Employment'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Abteilung' : 'Department'} size="small" fullWidth
                  value={form.department} onChange={e => set('department', e.target.value)} placeholder={de ? 'z.B. Buchhaltung' : 'e.g. Accounting'} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Bezeichnung / Position' : 'Job title / Position'} size="small" fullWidth
                  value={form.position} onChange={e => set('position', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={`${de ? 'Eintrittsdatum' : 'Start date'} *`} type="date" size="small" fullWidth
                  value={form.startDate} onChange={e => set('startDate', e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Austrittsdatum' : 'End date'} type="date" size="small" fullWidth
                  value={form.endDate ?? ''} onChange={e => set('endDate', e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Payroll */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Lohn- und Gehaltsdaten' : 'Payroll data'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <FormControl size="small" fullWidth>
                  <InputLabel>{de ? 'Lohnart' : 'Salary type'}</InputLabel>
                  <Select value={form.salaryType} label={de ? 'Lohnart' : 'Salary type'}
                    onChange={e => set('salaryType', e.target.value as SalaryType)}>
                    <MenuItem value="monthly">{de ? 'Monatsgehalt' : 'Monthly salary'}</MenuItem>
                    <MenuItem value="hourly">{de ? 'Stundenlohn' : 'Hourly wage'}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label={form.salaryType === 'monthly' ? (de ? 'Bruttogehalt / Monat (€)' : 'Gross salary / month (€)') : (de ? 'Bruttostundenlohn (€)' : 'Gross hourly rate (€)')}
                  size="small" fullWidth value={salaryStr} onChange={e => setSalaryStr(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl size="small" fullWidth>
                  <InputLabel>{de ? 'Steuerklasse' : 'Tax class'}</InputLabel>
                  <Select value={form.taxClass} label={de ? 'Steuerklasse' : 'Tax class'}
                    onChange={e => set('taxClass', e.target.value as TaxClass)}>
                    {(['1','2','3','4','5','6'] as TaxClass[]).map(c => (
                      <MenuItem key={c} value={c}>{de ? `Klasse ${c}` : `Class ${c}`}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Krankenkasse' : 'Health insurance'} size="small" fullWidth
                  value={form.healthInsurance} onChange={e => set('healthInsurance', e.target.value)} />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
              {de ? 'Sensible Daten (werden verschlüsselt gespeichert)' : 'Sensitive data (stored encrypted)'}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Steuer-ID' : 'Tax ID'} size="small" fullWidth
                  value={form.steuerIdEncrypted} onChange={e => set('steuerIdEncrypted', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'SV-Nummer' : 'SV number'} size="small" fullWidth
                  value={form.svNummerEncrypted} onChange={e => set('svNummerEncrypted', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label="IBAN" size="small" fullWidth
                  value={form.ibanEncrypted} onChange={e => set('ibanEncrypted', e.target.value)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Accounting */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Buchhaltungsverknüpfung' : 'Accounting link'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Personalkonto' : 'Personnel account'} size="small" fullWidth
                  value={form.personnelAccount} onChange={e => set('personnelAccount', e.target.value)}
                  helperText={de ? 'Standard: 4120' : 'Default: 4120'} inputProps={{ style: { fontFamily: 'monospace' } }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={de ? 'Kostenstelle' : 'Cost center'} size="small" fullWidth
                  value={form.costCenterNumber} onChange={e => set('costCenterNumber', e.target.value)}
                  inputProps={{ style: { fontFamily: 'monospace' } }} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={1.5}>{de ? 'Notizen' : 'Notes'}</Typography>
            <TextField size="small" fullWidth multiline rows={3}
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
