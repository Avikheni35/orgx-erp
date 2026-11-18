import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, TextField, Stack, Divider,
  FormControlLabel, Checkbox, IconButton, Alert, CircularProgress, Grid,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { suppliersApi, type Contact } from '../../../api/suppliers';

interface ContactForm {
  name: string;
  email: string;
  phone: string;
  position: string;
  isPrimary: boolean;
}

const emptyContact = (): ContactForm => ({ name: '', email: '', phone: '', position: '', isPrimary: false });

export default function CreateSupplierPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const [companyName, setCompanyName] = useState('');
  const [legalForm, setLegalForm]     = useState('');
  const [vatId, setVatId]             = useState('');
  const [street, setStreet]           = useState('');
  const [city, setCity]               = useState('');
  const [zip, setZip]                 = useState('');
  const [country, setCountry]         = useState('DE');
  const [notes, setNotes]             = useState('');

  const [paymentTermsDays, setPTD]          = useState('30');
  const [creditorAccount, setCA]            = useState('');
  const [defaultExpenseAccount, setDEA]     = useState('');
  const [iban, setIban]                     = useState('');
  const [bic, setBic]                       = useState('');
  const [paymentBlock, setPB]               = useState(false);
  const [taxExempt, setTE]                  = useState(false);

  const [contacts, setContacts] = useState<ContactForm[]>([emptyContact()]);

  const updateContact = (i: number, field: keyof ContactForm, value: string | boolean) => {
    setContacts(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'isPrimary' && value === true) {
        next.forEach((c, idx) => { if (idx !== i) c.isPrimary = false; });
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!companyName.trim()) { setError(t('common.required') + ': ' + t('suppliers.companyName')); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        companyName: companyName.trim(),
        legalForm:   legalForm || undefined,
        vatId:       vatId || undefined,
        address:     { street, city, zip, country },
        contacts:    contacts.filter(c => c.name.trim()) as Contact[],
        paymentTermsDays: parseInt(paymentTermsDays) || 30,
        creditorAccount:      creditorAccount || undefined,
        defaultExpenseAccount: defaultExpenseAccount || undefined,
        iban:          iban || undefined,
        bic:           bic || undefined,
        paymentBlock,
        taxExempt,
        isActive: true,
        notes:    notes || undefined,
      };
      const res = await suppliersApi.create(payload);
      navigate(`/erp/lieferanten/${res.data._id}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <IconButton onClick={() => navigate('/erp/lieferanten')}><ArrowBackIcon /></IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('suppliers.createSupplier')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('suppliers.subtitle')}</Typography>
        </Box>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={3}>
        {/* Master data */}
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('suppliers.masterData')}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <TextField fullWidth size="small" required label={t('suppliers.companyName')} value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth size="small" label={t('suppliers.legalForm')} placeholder="GmbH, AG, UG…" value={legalForm} onChange={e => setLegalForm(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label={t('suppliers.vatId')} placeholder="DE123456789" value={vatId} onChange={e => setVatId(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }}><Typography variant="caption" color="text.secondary">{t('suppliers.address')}</Typography></Divider>
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" label={t('settings.company.street')} value={street} onChange={e => setStreet(e.target.value)} />
              </Grid>
              <Grid item xs={4}>
                <TextField fullWidth size="small" label={t('settings.company.zip')} value={zip} onChange={e => setZip(e.target.value)} />
              </Grid>
              <Grid item xs={5}>
                <TextField fullWidth size="small" label={t('settings.company.city')} value={city} onChange={e => setCity(e.target.value)} />
              </Grid>
              <Grid item xs={3}>
                <TextField fullWidth size="small" label={t('settings.company.country')} value={country} onChange={e => setCountry(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" multiline rows={2} label={t('common.notes')} value={notes} onChange={e => setNotes(e.target.value)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Contacts */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight={600}>{t('suppliers.contacts')}</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setContacts(p => [...p, emptyContact()])}>
                {t('suppliers.addContact')}
              </Button>
            </Stack>
            <Stack gap={2}>
              {contacts.map((c, i) => (
                <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                  <Grid container spacing={1.5} alignItems="center">
                    <Grid item xs={12} sm={4}>
                      <TextField fullWidth size="small" label={t('suppliers.contactName')} value={c.name} onChange={e => updateContact(i, 'name', e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField fullWidth size="small" label={t('suppliers.contactEmail')} value={c.email} onChange={e => updateContact(i, 'email', e.target.value)} />
                    </Grid>
                    <Grid item xs={6} sm={2}>
                      <TextField fullWidth size="small" label={t('suppliers.contactPhone')} value={c.phone} onChange={e => updateContact(i, 'phone', e.target.value)} />
                    </Grid>
                    <Grid item xs={6} sm={2}>
                      <TextField fullWidth size="small" label={t('suppliers.contactPosition')} value={c.position} onChange={e => updateContact(i, 'position', e.target.value)} />
                    </Grid>
                    <Grid item xs={8}>
                      <FormControlLabel
                        control={<Checkbox checked={c.isPrimary} onChange={e => updateContact(i, 'isPrimary', e.target.checked)} size="small" />}
                        label={<Typography variant="body2">{t('suppliers.primaryContact')}</Typography>}
                      />
                    </Grid>
                    <Grid item xs={4} sx={{ textAlign: 'right' }}>
                      {contacts.length > 1 && (
                        <IconButton size="small" color="error" onClick={() => setContacts(p => p.filter((_, idx) => idx !== i))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Grid>
                  </Grid>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>

        {/* Accounting data */}
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('suppliers.accountingData')}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <TextField fullWidth size="small" type="number" label={t('suppliers.paymentTermsDays')} value={paymentTermsDays} onChange={e => setPTD(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth size="small" label={t('suppliers.creditorAccount')} placeholder={t('suppliers.creditorAccountAuto')} value={creditorAccount} onChange={e => setCA(e.target.value)} helperText={t('suppliers.creditorAccountAutoHint')} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth size="small" label={t('suppliers.defaultExpenseAccount')} placeholder="4980" value={defaultExpenseAccount} onChange={e => setDEA(e.target.value)} helperText={t('suppliers.defaultExpenseAccountHint')} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label={t('suppliers.iban')} value={iban} onChange={e => setIban(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth size="small" label={t('suppliers.bic')} value={bic} onChange={e => setBic(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <Stack direction="row" gap={3}>
                  <FormControlLabel
                    control={<Checkbox checked={paymentBlock} onChange={e => setPB(e.target.checked)} />}
                    label={t('suppliers.paymentBlock')}
                  />
                  <FormControlLabel
                    control={<Checkbox checked={taxExempt} onChange={e => setTE(e.target.checked)} />}
                    label={t('suppliers.taxExempt')}
                  />
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Stack>

      <Stack direction="row" gap={2} mt={3} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/erp/lieferanten')} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving} startIcon={saving ? <CircularProgress size={16} /> : undefined}>
          {t('suppliers.createSupplier')}
        </Button>
      </Stack>
    </Box>
  );
}
