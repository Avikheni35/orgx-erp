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
import { suppliersApi, type Contact, type SupplierUpdate } from '../../../api/suppliers';

interface ContactForm {
  _id?: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  isPrimary: boolean;
}

function toForm(c: Contact): ContactForm {
  return { _id: c._id, name: c.name, email: c.email ?? '', phone: c.phone ?? '', position: c.position ?? '', isPrimary: c.isPrimary };
}

export default function SupplierDetailPage() {
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
    queryKey: ['supplier', id],
    queryFn: () => suppliersApi.get(id!),
    enabled: !!id,
  });
  const { data: oiData } = useQuery({
    queryKey: ['supplier-open-items', id],
    queryFn: () => suppliersApi.openItems(id!),
    enabled: !!id && tab === 3,
  });

  const s = data?.data;

  const [companyName, setCompanyName] = useState('');
  const [legalForm, setLegalForm]     = useState('');
  const [vatId, setVatId]             = useState('');
  const [street, setStreet]           = useState('');
  const [city, setCity]               = useState('');
  const [zip, setZip]                 = useState('');
  const [country, setCountry]         = useState('DE');
  const [notes, setNotes]             = useState('');
  const [paymentTermsDays, setPTD]    = useState('30');
  const [creditorAccount, setCA]      = useState('');
  const [defaultExpenseAccount, setDEA] = useState('');
  const [iban, setIban]               = useState('');
  const [bic, setBic]                 = useState('');
  const [paymentBlock, setPB]         = useState(false);
  const [taxExempt, setTE]            = useState(false);
  const [contacts, setContacts]       = useState<ContactForm[]>([]);

  const startEdit = () => {
    if (!s) return;
    setCompanyName(s.companyName);
    setLegalForm(s.legalForm ?? '');
    setVatId(s.vatId ?? '');
    setStreet(s.address.street);
    setCity(s.address.city);
    setZip(s.address.zip);
    setCountry(s.address.country);
    setNotes(s.notes ?? '');
    setPTD(String(s.paymentTermsDays));
    setCA(s.creditorAccount ?? '');
    setDEA(s.defaultExpenseAccount ?? '');
    setIban(s.iban ?? '');
    setBic(s.bic ?? '');
    setPB(s.paymentBlock);
    setTE(s.taxExempt);
    setContacts(s.contacts.map(toForm));
    setError('');
    setEdit(true);
  };

  const cancelEdit = () => { setEdit(false); setError(''); };

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

  const handleSave = async () => {
    if (!companyName.trim()) { setError(t('common.required') + ': ' + t('suppliers.companyName')); return; }
    setSaving(true); setError('');
    try {
      const payload: SupplierUpdate = {
        companyName: companyName.trim(),
        legalForm:   legalForm || undefined,
        vatId:       vatId || undefined,
        address:     { street, city, zip, country },
        contacts:    contacts.filter(c => c.name.trim()) as Contact[],
        paymentTermsDays: parseInt(paymentTermsDays) || 30,
        creditorAccount:       creditorAccount || undefined,
        defaultExpenseAccount: defaultExpenseAccount || undefined,
        iban:          iban || undefined,
        bic:           bic || undefined,
        paymentBlock,
        taxExempt,
        notes:         notes || undefined,
      };
      await suppliersApi.update(id!, payload);
      await qc.invalidateQueries({ queryKey: ['supplier', id] });
      setEdit(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (!s) return <Alert severity="error">{t('common.noData')}</Alert>;

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={3}>
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate('/erp/lieferanten')}><ArrowBackIcon /></IconButton>
          <Box>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography variant="h5" fontWeight={700}>{s.companyName}</Typography>
              <Chip size="small" label={s.supplierNumber} color="secondary" variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 600 }} />
              {!s.isActive && <Chip size="small" label={t('common.inactive')} color="default" />}
              {s.paymentBlock && <Chip size="small" label={t('suppliers.paymentBlock')} color="warning" />}
            </Stack>
            <Typography variant="body2" color="text.secondary">{s.legalForm ?? ''} {s.address.zip} {s.address.city}</Typography>
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
        <Tab label={t('suppliers.tabs.masterData')} />
        <Tab label={t('suppliers.tabs.contacts')} />
        <Tab label={t('suppliers.tabs.accounting')} />
        <Tab label={t('suppliers.tabs.openItems')} />
      </Tabs>

      {/* Tab 0: Master Data */}
      {tab === 0 && (
        <Card>
          <CardContent>
            {!editing ? (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}><LV label={t('suppliers.companyName')} value={s.companyName} /></Grid>
                <Grid item xs={12} sm={3}><LV label={t('suppliers.legalForm')} value={s.legalForm} /></Grid>
                <Grid item xs={12} sm={3}><LV label={t('suppliers.vatId')} value={s.vatId} /></Grid>
                <Grid item xs={12}><Divider /></Grid>
                <Grid item xs={12} sm={6}><LV label={t('settings.company.street')} value={s.address.street} /></Grid>
                <Grid item xs={4} sm={2}><LV label={t('settings.company.zip')} value={s.address.zip} /></Grid>
                <Grid item xs={8} sm={3}><LV label={t('settings.company.city')} value={s.address.city} /></Grid>
                <Grid item xs={12} sm={1}><LV label={t('settings.company.country')} value={s.address.country} /></Grid>
                <Grid item xs={12}><LV label={t('common.notes')} value={s.notes} /></Grid>
                <Grid item xs={12}><Typography variant="caption" color="text.secondary">{t('common.created_at')}: {new Date(s.createdAt).toLocaleDateString(locale)}</Typography></Grid>
              </Grid>
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={8}><TextField fullWidth size="small" required label={t('suppliers.companyName')} value={companyName} onChange={e => setCompanyName(e.target.value)} /></Grid>
                <Grid item xs={12} sm={4}><TextField fullWidth size="small" label={t('suppliers.legalForm')} value={legalForm} onChange={e => setLegalForm(e.target.value)} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth size="small" label={t('suppliers.vatId')} value={vatId} onChange={e => setVatId(e.target.value)} /></Grid>
                <Grid item xs={12}><Divider sx={{ my: 0.5 }}><Typography variant="caption" color="text.secondary">{t('suppliers.address')}</Typography></Divider></Grid>
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
              s.contacts.length === 0 ? (
                <Typography color="text.secondary">{t('suppliers.noContacts')}</Typography>
              ) : (
                <Stack gap={2}>
                  {s.contacts.map((c, i) => (
                    <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                      <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                        <Typography fontWeight={600}>{c.name}</Typography>
                        {c.isPrimary && <Chip size="small" label={t('suppliers.primaryContact')} color="secondary" />}
                        {c.position && <Typography variant="caption" color="text.secondary">{c.position}</Typography>}
                      </Stack>
                      {c.email && <Typography variant="body2">{c.email}</Typography>}
                      {c.phone && <Typography variant="body2" color="text.secondary">{c.phone}</Typography>}
                    </Box>
                  ))}
                </Stack>
              )
            ) : (
              <Stack gap={2}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setContacts(p => [...p, { name: '', email: '', phone: '', position: '', isPrimary: false }])}>
                  {t('suppliers.addContact')}
                </Button>
                {contacts.map((c, i) => (
                  <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                    <Grid container spacing={1.5} alignItems="center">
                      <Grid item xs={12} sm={4}><TextField fullWidth size="small" label={t('suppliers.contactName')} value={c.name} onChange={e => updateContact(i, 'name', e.target.value)} /></Grid>
                      <Grid item xs={12} sm={4}><TextField fullWidth size="small" label={t('suppliers.contactEmail')} value={c.email} onChange={e => updateContact(i, 'email', e.target.value)} /></Grid>
                      <Grid item xs={6} sm={2}><TextField fullWidth size="small" label={t('suppliers.contactPhone')} value={c.phone} onChange={e => updateContact(i, 'phone', e.target.value)} /></Grid>
                      <Grid item xs={6} sm={2}><TextField fullWidth size="small" label={t('suppliers.contactPosition')} value={c.position} onChange={e => updateContact(i, 'position', e.target.value)} /></Grid>
                      <Grid item xs={8}>
                        <FormControlLabel control={<Checkbox checked={c.isPrimary} onChange={e => updateContact(i, 'isPrimary', e.target.checked)} size="small" />} label={<Typography variant="body2">{t('suppliers.primaryContact')}</Typography>} />
                      </Grid>
                      <Grid item xs={4} sx={{ textAlign: 'right' }}>
                        <IconButton size="small" color="error" onClick={() => setContacts(p => p.filter((_, idx) => idx !== i))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
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
                <Grid item xs={6} sm={3}><LV label={t('suppliers.paymentTermsDays')} value={`${s.paymentTermsDays} d`} /></Grid>
                <Grid item xs={12} sm={3}><LV label={t('suppliers.creditorAccount')} value={s.creditorAccount} /></Grid>
                <Grid item xs={12} sm={3}><LV label={t('suppliers.defaultExpenseAccount')} value={s.defaultExpenseAccount} /></Grid>
                <Grid item xs={12} sm={6}><LV label={t('suppliers.iban')} value={s.iban} /></Grid>
                <Grid item xs={12} sm={3}><LV label={t('suppliers.bic')} value={s.bic} /></Grid>
                <Grid item xs={12}>
                  <Stack direction="row" gap={3}>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <Typography variant="body2" color="text.secondary">{t('suppliers.paymentBlock')}:</Typography>
                      <Chip size="small" label={s.paymentBlock ? t('common.yes') : t('common.no')} color={s.paymentBlock ? 'warning' : 'default'} />
                    </Stack>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <Typography variant="body2" color="text.secondary">{t('suppliers.taxExempt')}:</Typography>
                      <Chip size="small" label={s.taxExempt ? t('common.yes') : t('common.no')} color={s.taxExempt ? 'info' : 'default'} />
                    </Stack>
                  </Stack>
                </Grid>
              </Grid>
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label={t('suppliers.paymentTermsDays')} value={paymentTermsDays} onChange={e => setPTD(e.target.value)} /></Grid>
                <Grid item xs={12} sm={3}><TextField fullWidth size="small" label={t('suppliers.creditorAccount')} placeholder="70010" value={creditorAccount} onChange={e => setCA(e.target.value)} helperText={t('suppliers.creditorAccountHint')} /></Grid>
                <Grid item xs={12} sm={3}><TextField fullWidth size="small" label={t('suppliers.defaultExpenseAccount')} placeholder="4980" value={defaultExpenseAccount} onChange={e => setDEA(e.target.value)} helperText={t('suppliers.defaultExpenseAccountHint')} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth size="small" label={t('suppliers.iban')} value={iban} onChange={e => setIban(e.target.value)} /></Grid>
                <Grid item xs={12} sm={3}><TextField fullWidth size="small" label={t('suppliers.bic')} value={bic} onChange={e => setBic(e.target.value)} /></Grid>
                <Grid item xs={12}>
                  <Stack direction="row" gap={3}>
                    <FormControlLabel control={<Checkbox checked={paymentBlock} onChange={e => setPB(e.target.checked)} />} label={t('suppliers.paymentBlock')} />
                    <FormControlLabel control={<Checkbox checked={taxExempt} onChange={e => setTE(e.target.checked)} />} label={t('suppliers.taxExempt')} />
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
                <Typography variant="body2" color="text.secondary">{t('suppliers.totalOpen')}</Typography>
                <Typography variant="h6" fontWeight={700}>
                  {((oiData?.data?.totalOpenCents ?? 0) / 100).toLocaleString(locale, { minimumFractionDigits: 2 })} €
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">{t('suppliers.totalOverdue')}</Typography>
                <Typography variant="h6" fontWeight={700} color="error.main">
                  {((oiData?.data?.totalOverdueCents ?? 0) / 100).toLocaleString(locale, { minimumFractionDigits: 2 })} €
                </Typography>
              </CardContent>
            </Card>
          </Stack>
          <Card>
            <CardContent>
              <Alert severity="info" icon={false}>
                <Typography variant="body2">{t('suppliers.openItemsPhase8')}</Typography>
              </Alert>
              {(oiData?.data?.openItems?.length ?? 0) > 0 ? (
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('suppliers.invoiceNo')}</TableCell>
                      <TableCell>{t('common.date')}</TableCell>
                      <TableCell>{t('suppliers.dueDate')}</TableCell>
                      <TableCell align="right">{t('suppliers.openAmount')}</TableCell>
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
                        <TableCell>{oi.overdue && <Chip size="small" label={t('suppliers.overdue')} color="error" />}</TableCell>
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

function LV({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="body2">{value || '—'}</Typography>
    </Box>
  );
}
