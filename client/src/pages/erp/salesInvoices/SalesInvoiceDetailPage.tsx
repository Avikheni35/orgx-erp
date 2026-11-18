import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, CardContent, Stack, Grid, Chip, Alert,
  CircularProgress, Divider, Table, TableHead, TableBody, TableRow, TableCell,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, IconButton,
  Tabs, Tab, FormControl, InputLabel, Select, MenuItem, TextField,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import EmailIcon from '@mui/icons-material/Email';
import PaidIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import UndoIcon from '@mui/icons-material/Undo';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { salesInvoicesApi, type InvoiceStatus } from '../../../api/salesInvoices';
import { journalApi } from '../../../api/journal';
import { inventoryApi } from '../../../api/inventory';
import { bankAccountsApi, type BankAccount } from '../../../api/bankAccounts';

const STATUS_COLOR: Record<InvoiceStatus, 'default'|'warning'|'info'|'success'|'error'> = {
  draft: 'default', sent: 'info', paid: 'success', cancelled: 'error',
};

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

type DialogType = 'send' | 'paid' | 'unpaid' | 'cancel' | null;

export default function SalesInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';

  const STATUS_LABEL: Record<InvoiceStatus, string> = {
    draft: t('salesInvoices.status.draft'), sent: t('salesInvoices.status.sent'),
    paid: t('salesInvoices.status.paid'), cancelled: t('salesInvoices.status.cancelled'),
  };

  const [dialog, setDialog]       = useState<DialogType>(null);
  const [acting, setActing]       = useState(false);
  const [error, setError]         = useState('');
  const [pdfLoading, setPdfLoading]       = useState(false);
  const [xmlLoading, setXmlLoading]       = useState(false);
  const [emailOpen,  setEmailOpen]        = useState(false);
  const [emailTo,    setEmailTo]          = useState('');
  const [emailMsg,   setEmailMsg]         = useState('');
  const [emailSending, setEmailSending]   = useState(false);
  const [emailError,   setEmailError]     = useState('');
  const [emailSuccess, setEmailSuccess]   = useState('');
  const [linkSending, setLinkSending]     = useState(false);
  const [linkSuccess, setLinkSuccess]     = useState('');
  const [linkError,   setLinkError]       = useState('');

  const handleDownloadPdf = async () => {
    if (!inv) return;
    setPdfLoading(true);
    try {
      const res = await salesInvoicesApi.pdf(inv._id);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rechnung_${inv.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadXRechnung = async () => {
    if (!inv) return;
    setXmlLoading(true);
    try {
      const res = await salesInvoicesApi.xrechnung(inv._id);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `XRechnung_${inv.invoiceNumber}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setXmlLoading(false);
    }
  };
  const handleOpenEmailDialog = () => {
    setEmailTo('');
    setEmailMsg('');
    setEmailError('');
    setEmailSuccess('');
    setEmailOpen(true);
  };

  const handleSendEmail = async () => {
    if (!inv || !emailTo) { setEmailError(i18n.language === 'de' ? 'E-Mail-Adresse erforderlich.' : 'Email address required.'); return; }
    setEmailSending(true); setEmailError('');
    try {
      await salesInvoicesApi.sendEmail(inv._id, { to: emailTo, message: emailMsg || undefined });
      setEmailSuccess(i18n.language === 'de' ? `Rechnung wurde an ${emailTo} gesendet.` : `Invoice sent to ${emailTo}.`);
      await qc.invalidateQueries({ queryKey: ['sales-invoice', id] });
      await qc.invalidateQueries({ queryKey: ['sales-invoices'] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setEmailError(err?.response?.data?.message ?? (i18n.language === 'de' ? 'Fehler beim Senden.' : 'Failed to send.'));
    } finally {
      setEmailSending(false);
    }
  };

  const handleSendLink = async () => {
    if (!inv) return;
    setLinkSending(true); setLinkError(''); setLinkSuccess('');
    try {
      const res = await salesInvoicesApi.sendLink(inv._id);
      setLinkSuccess(i18n.language === 'de'
        ? `Link wurde an ${res.data.email} gesendet.`
        : `Link sent to ${res.data.email}.`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setLinkError(err?.response?.data?.message ?? (i18n.language === 'de' ? 'Fehler beim Senden.' : 'Failed to send link.'));
    } finally {
      setLinkSending(false);
    }
  };

  const [paymentGlAccount, setPaymentGlAccount] = useState<string>('1200');
  const [bottomTab, setBottom] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['sales-invoice', id],
    queryFn: () => salesInvoicesApi.get(id!),
    enabled: !!id,
  });
  const { data: jeData } = useQuery({
    queryKey: ['journal-by-source', 'SalesInvoice', id],
    queryFn: () => journalApi.bySource('SalesInvoice', id!),
    enabled: !!id,
  });
  const { data: movData } = useQuery({
    queryKey: ['inv-movements-by-source', 'SalesInvoice', id],
    queryFn: () => inventoryApi.movementsBySource('SalesInvoice', id!),
    enabled: !!id,
  });
  const { data: bankData } = useQuery({
    queryKey: ['bank-accounts-active'],
    queryFn: () => bankAccountsApi.list({ isActive: true }),
  });

  useEffect(() => {
    const accounts = bankData?.data?.accounts ?? [];
    if (!accounts.length) return;
    const def = accounts.find(a => a.isDefault) ?? accounts[0];
    setPaymentGlAccount(def.glAccount);
  }, [bankData]);

  const inv = data?.data;

  const handleAction = async (type: DialogType) => {
    if (!type || !inv) return;
    setActing(true); setError('');
    try {
      if (type === 'send')   await salesInvoicesApi.send(inv._id);
      if (type === 'paid')   await salesInvoicesApi.markPaid(inv._id, paymentGlAccount);
      if (type === 'unpaid') await salesInvoicesApi.unmarkPaid(inv._id);
      if (type === 'cancel') await salesInvoicesApi.cancel(inv._id);
      await qc.invalidateQueries({ queryKey: ['sales-invoice', id] });
      await qc.invalidateQueries({ queryKey: ['sales-invoices'] });
      setDialog(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setActing(false);
    }
  };

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (!inv) return <Alert severity="error">{t('common.noData')}</Alert>;

  const overdue = inv.status === 'sent' && new Date(inv.dueDate) < new Date();
  const openCents = inv.totalGrossCents - inv.paidCents;
  const snap = inv.customerSnapshot;

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={3}>
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate(-1)}><ArrowBackIcon /></IconButton>
          <Box>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography variant="h5" fontWeight={700} fontFamily="monospace">{inv.invoiceNumber}</Typography>
              <Chip size="small" label={STATUS_LABEL[inv.status]} color={STATUS_COLOR[inv.status]} />
              {overdue && <Chip size="small" label={t('salesInvoices.overdue')} color="error" />}
            </Stack>
            <Typography variant="body2" color="text.secondary">{snap.companyName}</Typography>
          </Box>
        </Stack>

        <Stack direction="row" gap={1}>
          <Button
            variant="outlined"
            startIcon={pdfLoading ? <CircularProgress size={16} /> : <DownloadIcon />}
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
          >
            PDF
          </Button>
          <Button
            variant="outlined"
            startIcon={xmlLoading ? <CircularProgress size={16} /> : <DownloadIcon />}
            onClick={handleDownloadXRechnung}
            disabled={xmlLoading}
            title={t('salesInvoices.xrechnungTooltip')}
          >
            XRechnung
          </Button>
          <Button variant="outlined" startIcon={<EmailIcon />} onClick={handleOpenEmailDialog}
            disabled={inv.status === 'cancelled'}>
            {i18n.language === 'de' ? 'Per E-Mail' : 'Send email'}
          </Button>
          <Button variant="outlined" startIcon={linkSending ? <CircularProgress size={16} /> : <OpenInNewIcon />}
            onClick={handleSendLink} disabled={linkSending || inv.status === 'cancelled'}>
            {i18n.language === 'de' ? 'Link senden' : 'Send link'}
          </Button>
          {inv.status === 'draft' && (
            <Button variant="outlined" startIcon={<SendIcon />} onClick={() => setDialog('send')}>
              {t('salesInvoices.sendInvoice')}
            </Button>
          )}
          {inv.status === 'sent' && (
            <Button variant="contained" color="success" startIcon={<PaidIcon />} onClick={() => setDialog('paid')}>
              {t('salesInvoices.markPaid')}
            </Button>
          )}
          {inv.status === 'paid' && (
            <Button variant="outlined" color="warning" startIcon={<UndoIcon />} onClick={() => setDialog('unpaid')}>
              {t('salesInvoices.revokePayment')}
            </Button>
          )}
          {['draft','sent'].includes(inv.status) && (
            <Button variant="outlined" color="error" startIcon={<CancelIcon />} onClick={() => setDialog('cancel')}>
              {t('salesInvoices.cancelInvoice')}
            </Button>
          )}
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {linkSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setLinkSuccess('')}>{linkSuccess}</Alert>}
      {linkError   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setLinkError('')}>{linkError}</Alert>}

      <Grid container spacing={3}>
        {/* Left: Invoice details */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              {/* Customer address block */}
              <Typography variant="subtitle2" color="text.secondary" mb={1}>{t('salesInvoices.customer')}</Typography>
              <Typography fontWeight={600}>{snap.companyName}{snap.legalForm ? ` ${snap.legalForm}` : ''}</Typography>
              {snap.address.street && <Typography variant="body2">{snap.address.street}</Typography>}
              {snap.address.city && <Typography variant="body2">{snap.address.zip} {snap.address.city}</Typography>}
              {snap.vatId && <Typography variant="body2" color="text.secondary">USt-IdNr.: {snap.vatId}</Typography>}

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2} mb={2}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary" display="block">{t('salesInvoices.invoiceDate')}</Typography>
                  <Typography variant="body2">{new Date(inv.invoiceDate).toLocaleDateString(locale)}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary" display="block">{t('salesInvoices.dueDate')}</Typography>
                  <Typography variant="body2" color={overdue ? 'error.main' : 'inherit'}>{new Date(inv.dueDate).toLocaleDateString(locale)}</Typography>
                </Grid>
                {inv.sentAt && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">{t('salesInvoices.status.sent')}</Typography>
                    <Typography variant="body2">{new Date(inv.sentAt).toLocaleDateString(locale)}</Typography>
                  </Grid>
                )}
                {inv.paidAt && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">{t('salesInvoices.status.paid')}</Typography>
                    <Typography variant="body2">{new Date(inv.paidAt).toLocaleDateString(locale)}</Typography>
                  </Grid>
                )}
              </Grid>

              {/* Line items */}
              <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{i18n.language === 'de' ? 'Leistung' : 'Item / Service'}</TableCell>
                    <TableCell align="right">{t('salesInvoices.quantity')}</TableCell>
                    <TableCell align="right">{t('salesInvoices.unitPriceEur')}</TableCell>
                    <TableCell align="right">{t('salesInvoices.vatRate')}</TableCell>
                    <TableCell align="right">{t('salesInvoices.lineNet')}</TableCell>
                    <TableCell align="right">{t('salesInvoices.lineGross')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {inv.lineItems.map((l, i) => {
                    const displayName = l.itemName || l.description;
                    const detail = l.itemName && l.description ? l.description : '';
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{displayName}</Typography>
                          {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {l.quantity} {l.unit || ''}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.unitPriceCents, locale)}</TableCell>
                        <TableCell align="right">{l.vatRate} %</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.totalNetCents, locale)}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}><strong>{money(l.totalGrossCents, locale)}</strong></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </Box>

              {inv.notes && (
                <Box mt={2}>
                  <Typography variant="caption" color="text.secondary">{t('salesInvoices.notes')}</Typography>
                  <Typography variant="body2">{inv.notes}</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right: Summary */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('salesInvoices.summary')}</Typography>
              <Stack gap={1}>
                <Row label={t('salesInvoices.netAmount')}   value={money(inv.totalNetCents, locale)} />
                <Row label={t('salesInvoices.vatAmount')}   value={money(inv.totalVatCents, locale)} />
                <Divider />
                <Row label={t('salesInvoices.grossAmount')} value={money(inv.totalGrossCents, locale)} bold />
                {inv.paidCents > 0 && <Row label={t('salesInvoices.paidAmount')} value={money(inv.paidCents, locale)} color="success.main" />}
                {inv.status !== 'paid' && inv.status !== 'cancelled' && openCents > 0 && (
                  <Row label={t('salesInvoices.openAmount')} value={money(openCents, locale)} color={overdue ? 'error.main' : 'inherit'} bold />
                )}
              </Stack>

              {snap.debtorAccount && (
                <Box mt={2} pt={2} sx={{ borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary">{t('customers.debtorAccount')}</Typography>
                  <Typography variant="body2" fontFamily="monospace">{snap.debtorAccount}</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Buchungen & Lagerbewegungen ────────────────────────────────────── */}
      {(() => {
        const de = i18n.language === 'de';
        const entries   = jeData?.data?.entries ?? [];
        const movements = movData?.data?.movements ?? [];
        if (!entries.length && !movements.length) return null;
        return (
          <Box mt={3}>
            <Tabs value={bottomTab} onChange={(_, v) => setBottom(v)} sx={{ mb: 2 }}>
              <Tab label={`${de ? 'Buchungen' : 'Journal entries'} (${entries.length})`} />
              <Tab label={`${de ? 'Lagerbewegungen' : 'Inventory movements'} (${movements.length})`} />
            </Tabs>

            {bottomTab === 0 && (
              <Card>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Buchungssatz' : 'Entry'}</TableCell>
                      <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                      <TableCell>{de ? 'Konto' : 'Account'}</TableCell>
                      <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                      <TableCell align="right">{de ? 'Soll' : 'Debit'}</TableCell>
                      <TableCell align="right">{de ? 'Haben' : 'Credit'}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entries.map(entry => (
                      <>
                        {entry.lines.map((line, li) => (
                          <TableRow key={`${entry._id}-${li}`} hover>
                            {li === 0 && (
                              <TableCell rowSpan={entry.lines.length} sx={{ borderRight: '1px solid', borderColor: 'divider', verticalAlign: 'top' }}>
                                <Typography variant="caption" fontFamily="monospace" fontWeight={600}>{entry.entryNumber}</Typography>
                              </TableCell>
                            )}
                            {li === 0 && (
                              <TableCell rowSpan={entry.lines.length} sx={{ verticalAlign: 'top' }}>
                                <Typography variant="caption">{new Date(entry.date).toLocaleDateString(locale)}</Typography>
                              </TableCell>
                            )}
                            <TableCell>
                              <Typography variant="caption" fontFamily="monospace">{line.accountNumber}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>{line.accountName}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" color="text.secondary">{line.description}</Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              <Typography variant="caption" color={line.debit > 0 ? 'text.primary' : 'text.disabled'}>
                                {line.debit > 0 ? (line.debit).toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €' : '—'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              <Typography variant="caption" color={line.credit > 0 ? 'text.primary' : 'text.disabled'}>
                                {line.credit > 0 ? (line.credit).toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €' : '—'}
                              </Typography>
                            </TableCell>
                            {li === 0 && (
                              <TableCell rowSpan={entry.lines.length} sx={{ verticalAlign: 'top' }}>
                                <IconButton size="small" onClick={() => navigate(`/erp/buchfuehrung/${entry._id}`)}>
                                  <OpenInNewIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}

            {bottomTab === 1 && (
              <Card>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Artikel' : 'Item'}</TableCell>
                      <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                      <TableCell align="right">{de ? 'Menge (−)' : 'Qty (−)'}</TableCell>
                      <TableCell align="right">{de ? 'Bestand danach' : 'Stock after'}</TableCell>
                      <TableCell align="right">{de ? 'VK-Wert (netto)' : 'Sales value'}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                          <Typography variant="body2" color="text.secondary">
                            {de ? 'Keine Lagerbewegungen (nur Katalog-Artikel erzeugen Bewegungen).' : 'No movements (only catalog-linked lines create movements).'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : movements.map(m => (
                      <TableRow key={m._id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{m.itemName}</Typography>
                          <Typography variant="caption" color="text.secondary">{m.itemCategory}</Typography>
                        </TableCell>
                        <TableCell><Typography variant="body2" color="text.secondary">{m.lineDescription}</Typography></TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600} color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {m.quantity}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{m.stockAfter}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {(m.totalCents / 100).toLocaleString(locale, { minimumFractionDigits: 2 })} €
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </Box>
        );
      })()}

      {/* Confirm dialogs */}
      <Dialog open={dialog !== null} onClose={() => !acting && setDialog(null)}>
        <DialogTitle>
          {dialog === 'send'   && t('salesInvoices.sendInvoice')}
          {dialog === 'paid'   && t('salesInvoices.markPaid')}
          {dialog === 'unpaid' && t('salesInvoices.revokePayment')}
          {dialog === 'cancel' && t('salesInvoices.cancelInvoice')}
        </DialogTitle>
        <DialogContent>
          {dialog !== 'paid' && (
            <DialogContentText>
              {dialog === 'send'   && t('salesInvoices.sendConfirm')}
              {dialog === 'unpaid' && t('salesInvoices.revokeConfirm')}
              {dialog === 'cancel' && t('salesInvoices.cancelConfirm')}
            </DialogContentText>
          )}
          {dialog === 'paid' && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <DialogContentText>{t('salesInvoices.paidConfirm')}</DialogContentText>
              <FormControl size="small" fullWidth>
                <InputLabel>{t('salesInvoices.paymentMethod')}</InputLabel>
                <Select
                  value={paymentGlAccount}
                  label={t('salesInvoices.paymentMethod')}
                  onChange={(e) => setPaymentGlAccount(e.target.value)}
                >
                  {(bankData?.data?.accounts ?? []).map((acct) => (
                    <MenuItem key={acct._id} value={acct.glAccount}>
                      {acct.accountName}
                      {acct.bankName ? ` – ${acct.bankName}` : ''}
                      {` (${acct.glAccount})`}
                      {acct.isDefault ? ' ★' : ''}
                    </MenuItem>
                  ))}
                  <MenuItem value="1000">{t('salesInvoices.paymentMethodCash')}</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={acting}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            color={dialog === 'cancel' ? 'error' : dialog === 'unpaid' ? 'warning' : 'primary'}
            onClick={() => handleAction(dialog)}
            disabled={acting}
            startIcon={acting ? <CircularProgress size={16} /> : undefined}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Email dialog */}
      <Dialog open={emailOpen} onClose={() => !emailSending && setEmailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{i18n.language === 'de' ? 'Rechnung per E-Mail senden' : 'Send invoice by email'}</DialogTitle>
        <DialogContent>
          {emailError   && <Alert severity="error"   sx={{ mb: 2 }}>{emailError}</Alert>}
          {emailSuccess && <Alert severity="success" sx={{ mb: 2 }}>{emailSuccess}</Alert>}
          {!emailSuccess && (
            <Stack gap={2} sx={{ mt: 1 }}>
              <TextField
                required
                label={i18n.language === 'de' ? 'Empfänger-E-Mail' : 'Recipient email'}
                size="small"
                fullWidth
                type="email"
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                helperText={i18n.language === 'de' ? 'E-Mail-Adresse des Kunden' : "Customer's email address"}
              />
              <TextField
                label={i18n.language === 'de' ? 'Nachricht (optional)' : 'Message (optional)'}
                size="small"
                fullWidth
                multiline
                rows={4}
                value={emailMsg}
                onChange={e => setEmailMsg(e.target.value)}
                helperText={i18n.language === 'de' ? 'Wird vor dem Standardtext eingefügt' : 'Prepended to the standard body text'}
              />
              <Alert severity="info" sx={{ py: 0.5 }}>
                {i18n.language === 'de'
                  ? `Die Rechnung ${inv?.invoiceNumber} wird als PDF-Anhang gesendet. Ist die Rechnung im Entwurfsstatus, wird sie automatisch als "Gesendet" markiert.`
                  : `Invoice ${inv?.invoiceNumber} will be sent as a PDF attachment. If the invoice is a draft, it will be automatically marked as sent.`}
              </Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailOpen(false)} disabled={emailSending}>
            {emailSuccess ? (i18n.language === 'de' ? 'Schließen' : 'Close') : (i18n.language === 'de' ? 'Abbrechen' : 'Cancel')}
          </Button>
          {!emailSuccess && (
            <Button
              variant="contained"
              startIcon={emailSending ? <CircularProgress size={16} /> : <EmailIcon />}
              disabled={emailSending || !emailTo}
              onClick={handleSendEmail}
            >
              {i18n.language === 'de' ? 'Senden' : 'Send'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={bold ? 700 : 400} color={color} sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Stack>
  );
}
