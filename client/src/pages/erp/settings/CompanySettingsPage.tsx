import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, TextField, Button, Grid, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Alert, Divider, Tabs, Tab,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from 'react-i18next';
import { settingsApi, type CompanySettings } from '../../../api/settings';

const LEGAL_FORMS = ['GmbH', 'AG', 'GbR', 'Einzelunternehmen', 'UG', 'KG', 'OHG', 'Sonstige'];

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function CompanySettingsPage() {
  const qc = useQueryClient();
  const { t, i18n } = useTranslation();
  const de = i18n.language === 'de';
  const months = de ? MONTHS_DE : MONTHS_EN;
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Partial<CompanySettings>>({});
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: () => settingsApi.getCompany(),
  });

  useEffect(() => {
    if (data?.data?.settings) {
      setForm(data.data.settings);
    } else {
      setForm({
        companyName: '', legalForm: 'GmbH',
        address: { street: '', city: '', zip: '', country: 'DE' },
        vatId: '', steuernummer: '', hrNumber: '',
        fiscalYearStart: 1, chartOfAccounts: 'SKR03', vatPeriod: 'monthly',
        invoicePrefix: 'RE-', invoiceStartNumber: 1, invoiceDueDays: 30,
        invoiceTermsText: 'Zahlbar innerhalb von 30 Tagen ohne Abzug.',
        datevBeraternummer: '', datevMandantennummer: '',
        mileageRateCents: 30, poApprovalThresholdCents: 100000, salesMode: 'invoice' as const,
      });
    }
  }, [data]);

  const { mutate, isPending, error } = useMutation({
    mutationFn: (d: Partial<CompanySettings>) => settingsApi.updateCompany(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'company'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));
  const setAddr = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, address: { ...(prev.address || {}), [key]: value } as CompanySettings['address'] }));

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

  const tabs = [
    t('settings.company.tabs.company'),
    t('settings.company.tabs.invoice'),
    t('settings.company.tabs.datev'),
    t('settings.company.tabs.other'),
  ];

  return (
    <Box maxWidth={900}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('settings.company.title')}</Typography>
          <Typography variant="body2" color="text.secondary">Pflichtangaben für GoBD-konforme Rechnungen und DATEV-Export</Typography>
        </Box>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={() => mutate(form)} disabled={isPending}>
          {isPending ? <CircularProgress size={18} color="inherit" /> : t('settings.company.saveChanges')}
        </Button>
      </Box>

      {saved && <Alert severity="success" sx={{ mb: 2 }}>{t('common.success')}</Alert>}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as any)?.response?.data?.message || t('common.error')}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        {tabs.map((tp) => <Tab key={tp} label={tp} />)}
      </Tabs>

      {tab === 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('settings.company.tabs.company')}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <TextField label={t('settings.company.companyName')} value={form.companyName || ''} onChange={(e) => set('companyName', e.target.value)} fullWidth size="small" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('settings.company.legalForm')}</InputLabel>
                  <Select value={form.legalForm || 'GmbH'} onChange={(e) => set('legalForm', e.target.value)} label={t('settings.company.legalForm')}>
                    {LEGAL_FORMS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Divider><Typography variant="caption">{t('settings.company.street')}</Typography></Divider>
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField label={t('settings.company.street')} value={form.address?.street || ''} onChange={(e) => setAddr('street', e.target.value)} fullWidth size="small" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={t('settings.company.zip')} value={form.address?.zip || ''} onChange={(e) => setAddr('zip', e.target.value)} fullWidth size="small" />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField label={t('settings.company.city')} value={form.address?.city || ''} onChange={(e) => setAddr('city', e.target.value)} fullWidth size="small" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={t('settings.company.country')} value={form.address?.country || 'DE'} onChange={(e) => setAddr('country', e.target.value)} fullWidth size="small" />
              </Grid>
              <Grid item xs={12}>
                <Divider><Typography variant="caption">§14 UStG</Typography></Divider>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={t('settings.company.vatId')} value={form.vatId || ''} onChange={(e) => set('vatId', e.target.value)} fullWidth size="small" placeholder="DE123456789" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={t('settings.company.steuernummer')} value={form.steuernummer || ''} onChange={(e) => set('steuernummer', e.target.value)} fullWidth size="small" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={t('settings.company.hrNumber')} value={form.hrNumber || ''} onChange={(e) => set('hrNumber', e.target.value)} fullWidth size="small" placeholder="HRB 12345" />
              </Grid>
              <Grid item xs={12}>
                <Divider><Typography variant="caption">{de ? 'Buchhaltung' : 'Accounting'}</Typography></Divider>
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('settings.company.chartOfAccounts')}</InputLabel>
                  <Select value={form.chartOfAccounts || 'SKR03'} onChange={(e) => set('chartOfAccounts', e.target.value)} label={t('settings.company.chartOfAccounts')}>
                    <MenuItem value="SKR03">SKR03 (Dienstleistung / Handel)</MenuItem>
                    <MenuItem value="SKR04">SKR04 (Industrie / GKV)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('settings.company.vatPeriod')}</InputLabel>
                  <Select value={form.vatPeriod || 'monthly'} onChange={(e) => set('vatPeriod', e.target.value)} label={t('settings.company.vatPeriod')}>
                    <MenuItem value="monthly">{t('settings.company.vatPeriods.monthly')}</MenuItem>
                    <MenuItem value="quarterly">{t('settings.company.vatPeriods.quarterly')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('settings.company.fiscalYearStart')}</InputLabel>
                  <Select value={form.fiscalYearStart || 1} onChange={(e) => set('fiscalYearStart', Number(e.target.value))} label={t('settings.company.fiscalYearStart')}>
                    {months.map((m, i) => (
                      <MenuItem key={i+1} value={i+1}>{m}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('settings.company.tabs.invoice')}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField label={t('settings.company.invoicePrefix')} value={form.invoicePrefix || 'RE-'} onChange={(e) => set('invoicePrefix', e.target.value)} fullWidth size="small" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={t('settings.company.invoiceStartNumber')} type="number" value={form.invoiceStartNumber || 1} onChange={(e) => set('invoiceStartNumber', Number(e.target.value))} fullWidth size="small" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label={t('settings.company.invoiceDueDays')} type="number" value={form.invoiceDueDays ?? 30} onChange={(e) => set('invoiceDueDays', Number(e.target.value))} fullWidth size="small" />
              </Grid>
              <Grid item xs={12}>
                <TextField label={t('settings.company.invoiceTermsText')} value={form.invoiceTermsText || ''} onChange={(e) => set('invoiceTermsText', e.target.value)} fullWidth size="small" multiline rows={2} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {tab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('settings.company.tabs.datev')}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label={t('settings.company.datevBeraternummer')} value={form.datevBeraternummer || ''} onChange={(e) => set('datevBeraternummer', e.target.value)} fullWidth size="small" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={t('settings.company.datevMandantennummer')} value={form.datevMandantennummer || ''} onChange={(e) => set('datevMandantennummer', e.target.value)} fullWidth size="small" />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {tab === 3 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('settings.company.tabs.other')}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label={t('settings.company.mileageRate')}
                  type="number"
                  value={form.mileageRateCents ?? 30}
                  onChange={(e) => set('mileageRateCents', Number(e.target.value))}
                  fullWidth size="small"
                  helperText="Standard: 30 Ct/km (§9 EStG)"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label={t('settings.company.poApprovalThreshold')}
                  type="number"
                  value={form.poApprovalThresholdCents ?? 100000}
                  onChange={(e) => set('poApprovalThresholdCents', Number(e.target.value))}
                  fullWidth size="small"
                />
              </Grid>
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" fontWeight={600} mb={1}>
                  {i18n.language === 'de' ? 'Standardmodus für neue Verkäufe' : 'Default mode for new sales'}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                  {i18n.language === 'de'
                    ? 'Bestimmt, ob neue Ausgangsrechnungen standardmäßig als Rechnung oder Direktverkauf (POS) geöffnet werden.'
                    : 'Determines whether new sales invoices open in Invoice or POS Direct mode by default.'}
                </Typography>
                <ToggleButtonGroup
                  value={form.salesMode ?? 'invoice'}
                  exclusive
                  size="small"
                  onChange={(_, v) => { if (v) set('salesMode', v); }}
                >
                  <ToggleButton value="invoice">
                    {i18n.language === 'de' ? 'Rechnung' : 'Invoice'}
                  </ToggleButton>
                  <ToggleButton value="pos">
                    {i18n.language === 'de' ? 'Direktverkauf (POS)' : 'POS / Direct Sale'}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
