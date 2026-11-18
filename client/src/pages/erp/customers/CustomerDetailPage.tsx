import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, CardContent, TextField, Stack, Divider,
  FormControlLabel, Checkbox, IconButton, Alert, CircularProgress, Grid, Chip,
  Tab, Tabs, Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { customersApi, type Contact, type CustomerUpdate } from '../../../api/customers';

interface ContactForm {
  _id?: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  isPrimary: boolean;
}

function toContactForm(c: Contact): ContactForm {
  return { _id: c._id, name: c.name, email: c.email ?? '', phone: c.phone ?? '', position: c.position ?? '', isPrimary: c.isPrimary };
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';

  const [tab, setTab]       = useState(0);
  const [editing, setEdit]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.get(id!),
    enabled: !!id,
  });
  const { data: oiData } = useQuery({
    queryKey: ['customer-open-items', id],
    queryFn: () => customersApi.openItems(id!),
    enabled: !!id && tab === 3,
  });

  const c = data?.data;

  // Edit state (initialised from server data when edit mode opened)
  const [companyName, setCompanyName]   = useState('');
  const [legalForm, setLegalForm]       = useState('');
  const [vatId, setVatId]               = useState('');
  const [street, setStreet]             = useState('');
  const [city, setCity]                 = useState('');
  const [zip, setZip]                   = useState('');
  const [country, setCountry]           = useState('DE');
  const [notes, setNotes]               = useState('');
  const [paymentTermsDays, setPTD]      = useState('30');
  const [creditLimitCents, setCLC]      = useState('0');
  const [debtorAccount, setDA]          = useState('');
  const [iban, setIban]                 = useState('');
  const [bic, setBic]                   = useState('');
  const [dunningBlock, setDB]           = useState(false);
  const [taxExempt, setTE]              = useState(false);
  const [contacts, setContacts]         = useState<ContactForm[]>([]);

  const startEdit = () => {
    if (!c) return;
    setCompanyName(c.companyName);
    setLegalForm(c.legalForm ?? '');
    setVatId(c.vatId ?? '');
    setStreet(c.address.street);
    setCity(c.address.city);
    setZip(c.address.zip);
    setCountry(c.address.country);
    setNotes(c.notes ?? '');
    setPTD(String(c.paymentTermsDays));
    setCLC(String(c.creditLimitCents));
    setDA(c.debtorAccount ?? '');
    setIban(c.iban ?? '');
    setBic(c.bic ?? '');
    setDB(c.dunningBlock);
    setTE(c.taxExempt);
    setContacts(c.contacts.map(toContactForm));
    setError('');
    setEdit(true);
  };

  const cancelEdit = () => { setEdit(false); setError(''); };

  const updateContact = (i: number, field: keyof ContactForm, value: string | boolean) => {
    setContacts(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'isPrimary' && value === true) {
        next.forEach((ct, idx) => { if (idx !== i) ct.isPrimary = false; });
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!companyName.trim()) { setError(t('common.required') + ': ' + t('customers.companyName')); return; }
    setSaving(true); setError('');
    try {
      const payload: CustomerUpdate = {
        companyName: companyName.trim(),
        legalForm:   legalForm || undefined,
        vatId:       vatId || undefined,
        address:     { street, city, zip, country },
        contacts:    contacts.filter(ct => ct.name.trim()) as Contact[],
        paymentTermsDays: parseInt(paymentTermsDays) || 30,
        creditLimitCents: parseInt(creditLimitCents) || 0,
        debtorAccount: debtorAccount || undefined,
        iban:          iban || undefined,
        bic:           bic || undefined,
        dunningBlock,
        taxExempt,
        notes:         notes || undefined,
      };
      await customersApi.update(id!, payload);
      await qc.invalidateQueries({ queryKey: ['customer', id] });
      setEdit(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (!c) return <Alert severity="error">{t('common.noData')}</Alert>;

  const primaryContact = c.contacts.find(ct => ct.isPrimary) ?? c.contacts[0];

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={3}>
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate('/erp/kunden')}><ArrowBackIcon /></IconButton>
          <Box>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography variant="h5" fontWeight={700}>{c.companyName}</Typography>
              <Chip size="small" label={c.customerNumber} color="primary" variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 600 }} />
              {!c.isActive && <Chip size="small" label={t('common.inactive')} color="default" />}
              {c.dunningBlock && <Chip size="small" label={t('customers.dunningBlock')} color="warning" />}
            </Stack>
            <Typography variant="body2" color="text.secondary">{c.legalForm ?? ''} {c.address.zip} {c.address.city}</Typography>
          </Box>
        </Stack>
        {!editing ? (
          <Button variant="outlined" startIcon={<EditIcon />} onClick={startEdit}>{t('common.edit')}</Button>
        ) : (
          <Stack direction="row" gap={1}>
            <Button variant="outlined" startIcon={<CancelIcon />} onClick={cancelEdit} disabled={saving}>{t('common.cancel')}</Button>
            <Button variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />} onClick={handleSave} disabled={saving}>{t('common.save')}</Button>
          </Stack>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={t('customers.tabs.masterData')} />
        <Tab label={t('customers.tabs.contacts')} />
        <Tab label={t('customers.tabs.accounting')} />
        <Tab label={t('customers.tabs.openItems')} />
      </Tabs>

      {/* Tab 0: Master Data */}
      {tab === 0 && (
        <Card>
          <CardContent>
            {!editing ? (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}><LabelValue label={t('customers.companyName')} value={c.companyName} /></Grid>
                <Grid item xs={12} sm={3}><LabelValue label={t('customers.legalForm')} value={c.legalForm} /></Grid>
                <Grid item xs={12} sm={3}><LabelValue label={t('customers.vatId')} value={c.vatId} /></Grid>
                <Grid item xs={12}><Divider /></Grid>
                <Grid item xs={12} sm={6}><LabelValue label={t('settings.company.street')} value={c.address.street} /></Grid>
                <Grid item xs={4} sm={2}><LabelValue label={t('settings.company.zip')} value={c.address.zip} /></Grid>
                <Grid item xs={8} sm={3}><LabelValue label={t('settings.company.city')} value={c.address.city} /></Grid>
                <Grid item xs={12} sm={1}><LabelValue label={t('settings.company.country')} value={c.address.country} /></Grid>
                <Grid item xs={12}><LabelValue label={t('common.notes')} value={c.notes} /></Grid>
                <Grid item xs={12}><Typography variant="caption" color="text.secondary">{t('common.created_at')}: {new Date(c.createdAt).toLocaleDateString(locale)}</Typography></Grid>
              </Grid>
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={8}><TextField fullWidth size="small" required label={t('customers.companyName')} value={companyName} onChange={e => setCompanyName(e.target.value)} /></Grid>
                <Grid item xs={12} sm={4}><TextField fullWidth size="small" label={t('customers.legalForm')} value={legalForm} onChange={e => setLegalForm(e.target.value)} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth size="small" label={t('customers.vatId')} value={vatId} onChange={e => setVatId(e.target.value)} /></Grid>
                <Grid item xs={12}><Divider sx={{ my: 0.5 }}><Typography variant="caption" color="text.secondary">{t('customers.address')}</Typography></Divider></Grid>
                <Grid item xs={12}><TextField fullWidth size="small" label={t('settings.company.street')} value={street} onChange={e => setStreet(e.target.value)} /></Grid>
                <Grid item xs={4}><TextField fullWidth size="small" label={t('settings.company.zip')} value={zip} onChange={e => setZip(e.target.value)} /></Grid>
                <Grid item xs={5}><TextField fullWidth size="small" label={t('settings.company.city')} value={city} onChange={e => setCity(e.target.value)} /></Grid>
                <Grid item xs={3}><TextField fullWidth size="small" label={t('settings.company.country')} value={country} onChange={e => setCountry(e.target.value)} /></Grid>
                <Grid item xs={12}><TextField fullWidth size="small" multiline rows={2} label={t('common.notes')} value={notes} onChange={e => setNotes(e.target.value)} /></Grid>
              </Grid>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 1: Contacts */}
      {tab === 1 && (
        <Card>
          <CardContent>
            {!editing ? (
              c.contacts.length === 0 ? (
                <Typography color="text.secondary">{t('customers.noContacts')}</Typography>
              ) : (
                <Stack gap={2}>
                  {c.contacts.map((ct, i) => (
                    <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                      <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                        <Typography fontWeight={600}>{ct.name}</Typography>
                        {ct.isPrimary && <Chip size="small" label={t('customers.primaryContact')} color="primary" />}
                        {ct.position && <Typography variant="caption" color="text.secondary">{ct.position}</Typography>}
                      </Stack>
                      {ct.email && <Typography variant="body2">{ct.email}</Typography>}
                      {ct.phone && <Typography variant="body2" color="text.secondary">{ct.phone}</Typography>}
                    </Box>
                  ))}
                </Stack>
              )
            ) : (
              <Stack gap={2}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setContacts(p => [...p, { name: '', email: '', phone: '', position: '', isPrimary: false }])}>
                  {t('customers.addContact')}
                </Button>
                {contacts.map((ct, i) => (
                  <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                    <Grid container spacing={1.5} alignItems="center">
                      <Grid item xs={12} sm={4}><TextField fullWidth size="small" label={t('customers.contactName')} value={ct.name} onChange={e => updateContact(i, 'name', e.target.value)} /></Grid>
                      <Grid item xs={12} sm={4}><TextField fullWidth size="small" label={t('customers.contactEmail')} value={ct.email} onChange={e => updateContact(i, 'email', e.target.value)} /></Grid>
                      <Grid item xs={6} sm={2}><TextField fullWidth size="small" label={t('customers.contactPhone')} value={ct.phone} onChange={e => updateContact(i, 'phone', e.target.value)} /></Grid>
                      <Grid item xs={6} sm={2}><TextField fullWidth size="small" label={t('customers.contactPosition')} value={ct.position} onChange={e => updateContact(i, 'position', e.target.value)} /></Grid>
                      <Grid item xs={8}>
                        <FormControlLabel control={<Checkbox checked={ct.isPrimary} onChange={e => updateContact(i, 'isPrimary', e.target.checked)} size="small" />} label={<Typography variant="body2">{t('customers.primaryContact')}</Typography>} />
                      </Grid>
                      <Grid item xs={4} sx={{ textAlign: 'right' }}>
                        {contacts.length > 0 && (
                          <IconButton size="small" color="error" onClick={() => setContacts(p => p.filter((_, idx) => idx !== i))}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Accounting */}
      {tab === 2 && (
        <Card>
          <CardContent>
            {!editing ? (
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}><LabelValue label={t('customers.paymentTermsDays')} value={`${c.paymentTermsDays} d`} /></Grid>
                <Grid item xs={6} sm={3}><LabelValue label={t('customers.creditLimitCents')} value={c.creditLimitCents === 0 ? '∞' : `${(c.creditLimitCents / 100).toLocaleString(locale, { minimumFractionDigits: 2 })} €`} /></Grid>
                <Grid item xs={12} sm={3}><LabelValue label={t('customers.debtorAccount')} value={c.debtorAccount} /></Grid>
                <Grid item xs={12} sm={6}><LabelValue label={t('customers.iban')} value={c.iban} /></Grid>
                <Grid item xs={12} sm={3}><LabelValue label={t('customers.bic')} value={c.bic} /></Grid>
                <Grid item xs={12}>
                  <Stack direction="row" gap={3}>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <Typography variant="body2" color="text.secondary">{t('customers.dunningBlock')}:</Typography>
                      <Chip size="small" label={c.dunningBlock ? t('common.yes') : t('common.no')} color={c.dunningBlock ? 'warning' : 'default'} />
                    </Stack>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <Typography variant="body2" color="text.secondary">{t('customers.taxExempt')}:</Typography>
                      <Chip size="small" label={c.taxExempt ? t('common.yes') : t('common.no')} color={c.taxExempt ? 'info' : 'default'} />
                    </Stack>
                  </Stack>
                </Grid>
              </Grid>
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label={t('customers.paymentTermsDays')} value={paymentTermsDays} onChange={e => setPTD(e.target.value)} /></Grid>
                <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label={t('customers.creditLimitCents')} value={creditLimitCents} onChange={e => setCLC(e.target.value)} helperText="0 = ∞" /></Grid>
                <Grid item xs={12} sm={3}><TextField fullWidth size="small" label={t('customers.debtorAccount')} placeholder="10010" value={debtorAccount} onChange={e => setDA(e.target.value)} helperText={t('customers.debtorAccountHint')} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth size="small" label={t('customers.iban')} value={iban} onChange={e => setIban(e.target.value)} /></Grid>
                <Grid item xs={12} sm={3}><TextField fullWidth size="small" label={t('customers.bic')} value={bic} onChange={e => setBic(e.target.value)} /></Grid>
                <Grid item xs={12}>
                  <Stack direction="row" gap={3}>
                    <FormControlLabel control={<Checkbox checked={dunningBlock} onChange={e => setDB(e.target.checked)} />} label={t('customers.dunningBlock')} />
                    <FormControlLabel control={<Checkbox checked={taxExempt} onChange={e => setTE(e.target.checked)} />} label={t('customers.taxExempt')} />
                  </Stack>
                </Grid>
              </Grid>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Open Items */}
      {tab === 3 && (
        <Stack gap={2}>
          <Stack direction="row" gap={2}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">{t('customers.totalOpen')}</Typography>
                <Typography variant="h6" fontWeight={700}>
                  {((oiData?.data?.totalOpenCents ?? 0) / 100).toLocaleString(locale, { minimumFractionDigits: 2 })} €
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">{t('customers.totalOverdue')}</Typography>
                <Typography variant="h6" fontWeight={700} color="error.main">
                  {((oiData?.data?.totalOverdueCents ?? 0) / 100).toLocaleString(locale, { minimumFractionDigits: 2 })} €
                </Typography>
              </CardContent>
            </Card>
          </Stack>
          <Card>
            <CardContent>
              {(oiData?.data?.openItems?.length ?? 0) > 0 ? (
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('customers.invoiceNo')}</TableCell>
                      <TableCell>{t('common.date')}</TableCell>
                      <TableCell>{t('customers.dueDate')}</TableCell>
                      <TableCell align="right">{t('customers.openAmount')}</TableCell>
                      <TableCell>{t('common.status')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {oiData?.data.openItems.map((oi, i) => (
                      <TableRow key={i}>
                        <TableCell><Typography variant="body2" fontFamily="monospace">{oi.invoiceNumber}</Typography></TableCell>
                        <TableCell>{new Date(oi.date).toLocaleDateString(locale)}</TableCell>
                        <TableCell>{new Date(oi.dueDate).toLocaleDateString(locale)}</TableCell>
                        <TableCell align="right">{(oi.openCents / 100).toLocaleString(locale, { minimumFractionDigits: 2 })} €</TableCell>
                        <TableCell>{oi.overdue && <Chip size="small" label={t('customers.overdue')} color="error" />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </Stack>
      )}
    </Box>
  );
}

function LabelValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="body2">{value || '—'}</Typography>
    </Box>
  );
}
