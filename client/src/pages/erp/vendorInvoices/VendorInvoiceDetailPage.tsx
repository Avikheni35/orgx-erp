import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, CardContent, Stack, Grid, Chip, Alert,
  CircularProgress, Divider, Table, TableHead, TableBody, TableRow, TableCell,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, IconButton,
  Tabs, Tab, TextField, List, ListItem, ListItemText, ListItemSecondaryAction,
  Tooltip, LinearProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PaidIcon from '@mui/icons-material/Payments';
import CancelIcon from '@mui/icons-material/Cancel';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SendIcon from '@mui/icons-material/Send';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { vendorInvoicesApi, type VendorInvoiceStatus } from '../../../api/vendorInvoices';
import { journalApi } from '../../../api/journal';
import { inventoryApi } from '../../../api/inventory';
import { useAuthStore } from '../../../stores/authStore';

const STATUS_COLOR: Record<VendorInvoiceStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft:            'default',
  pending_approval: 'warning',
  approved:         'info',
  rejected:         'error',
  paid:             'success',
  cancelled:        'error',
};

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

type DialogType = 'approve' | 'paid' | 'cancel' | 'submit' | 'reject' | null;

export default function VendorInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';
  const de = i18n.language === 'de';
  const { user } = useAuthStore();
  const isAdmin = user?.role && ['erp_admin', 'super_admin', 'agency_admin'].includes(user.role);

  const STATUS_LABEL: Record<VendorInvoiceStatus, string> = {
    draft:            t('vendorInvoices.status.draft'),
    pending_approval: t('vendorInvoices.status.pending_approval'),
    approved:         t('vendorInvoices.status.approved'),
    rejected:         t('vendorInvoices.status.rejected'),
    paid:             t('vendorInvoices.status.paid'),
    cancelled:        t('vendorInvoices.status.cancelled'),
  };

  const [dialog, setDialog]     = useState<DialogType>(null);
  const [acting, setActing]     = useState(false);
  const [error, setError]       = useState('');
  const [bottomTab, setBottom]  = useState(0);
  const [rejectNote, setRejectNote] = useState('');
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-invoice', id],
    queryFn: () => vendorInvoicesApi.get(id!),
    enabled: !!id,
  });
  const { data: jeData } = useQuery({
    queryKey: ['journal-by-source', 'VendorInvoice', id],
    queryFn: () => journalApi.bySource('VendorInvoice', id!),
    enabled: !!id,
  });
  const { data: movData } = useQuery({
    queryKey: ['inv-movements-by-source', 'VendorInvoice', id],
    queryFn: () => inventoryApi.movementsBySource('VendorInvoice', id!),
    enabled: !!id,
  });

  const inv = data?.data;

  const handleAction = async (type: DialogType) => {
    if (!type || !inv) return;
    setActing(true); setError('');
    try {
      if (type === 'submit')  await vendorInvoicesApi.submitForApproval(inv._id);
      if (type === 'approve') await vendorInvoicesApi.approve(inv._id);
      if (type === 'reject')  await vendorInvoicesApi.reject(inv._id, rejectNote);
      if (type === 'paid')    await vendorInvoicesApi.markPaid(inv._id);
      if (type === 'cancel')  await vendorInvoicesApi.cancel(inv._id);
      await qc.invalidateQueries({ queryKey: ['vendor-invoice', id] });
      await qc.invalidateQueries({ queryKey: ['vendor-invoices'] });
      setDialog(null);
      setRejectNote('');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setActing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !inv) return;
    setUploading(true); setUploadError('');
    try {
      await vendorInvoicesApi.uploadAttachment(inv._id, file);
      await qc.invalidateQueries({ queryKey: ['vendor-invoice', id] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setUploadError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (attId: string, originalName: string) => {
    if (!inv) return;
    try {
      const res = await vendorInvoicesApi.downloadAttachment(inv._id, attId);
      const url = URL.createObjectURL(new Blob([res.data as BlobPart]));
      const a = document.createElement('a');
      a.href = url; a.download = originalName; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const handleDeleteAttachment = async (attId: string) => {
    if (!inv) return;
    try {
      await vendorInvoicesApi.deleteAttachment(inv._id, attId);
      await qc.invalidateQueries({ queryKey: ['vendor-invoice', id] });
    } catch { /* ignore */ }
  };

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (!inv) return <Alert severity="error">{t('common.noData')}</Alert>;

  const overdue    = inv.status === 'approved' && new Date(inv.dueDate) < new Date();
  const openCents  = inv.totalGrossCents - inv.paidCents;
  const snap       = inv.supplierSnapshot;
  const attachments = inv.attachments ?? [];

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={3}>
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate(-1)}><ArrowBackIcon /></IconButton>
          <Box>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography variant="h5" fontWeight={700} fontFamily="monospace">{inv.supplierInvoiceNumber}</Typography>
              <Chip size="small" label={STATUS_LABEL[inv.status]} color={STATUS_COLOR[inv.status]} />
              {overdue && <Chip size="small" label={t('vendorInvoices.overdue')} color="error" />}
            </Stack>
            <Typography variant="body2" color="text.secondary">{snap.companyName}</Typography>
          </Box>
        </Stack>

        <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="flex-end">
          {/* Accountant: submit for approval */}
          {inv.status === 'draft' && (
            <Button variant="outlined" color="primary" startIcon={<SendIcon />} onClick={() => setDialog('submit')}>
              {de ? 'Zur Genehmigung' : 'Submit for Approval'}
            </Button>
          )}
          {/* Admin: approve pending */}
          {inv.status === 'pending_approval' && isAdmin && (
            <>
              <Button variant="outlined" color="success" startIcon={<CheckCircleIcon />} onClick={() => setDialog('approve')}>
                {t('vendorInvoices.approveInvoice')}
              </Button>
              <Button variant="outlined" color="error" startIcon={<ThumbDownIcon />} onClick={() => { setRejectNote(''); setDialog('reject'); }}>
                {de ? 'Ablehnen' : 'Reject'}
              </Button>
            </>
          )}
          {/* Direct approve for draft (admin only) */}
          {inv.status === 'draft' && isAdmin && (
            <Button variant="outlined" color="success" startIcon={<CheckCircleIcon />} onClick={() => setDialog('approve')}>
              {t('vendorInvoices.approveInvoice')}
            </Button>
          )}
          {['draft', 'pending_approval', 'approved'].includes(inv.status) && (
            <Button variant="contained" color="success" startIcon={<PaidIcon />} onClick={() => setDialog('paid')}>
              {t('vendorInvoices.markPaid')}
            </Button>
          )}
          {['draft', 'pending_approval', 'approved'].includes(inv.status) && (
            <Button variant="outlined" color="error" startIcon={<CancelIcon />} onClick={() => setDialog('cancel')}>
              {t('vendorInvoices.cancelInvoice')}
            </Button>
          )}
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {inv.status === 'rejected' && inv.rejectionNote && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <strong>{de ? 'Ablehnungsgrund:' : 'Rejection reason:'}</strong> {inv.rejectionNote}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>{t('vendorInvoices.supplier')}</Typography>
              <Typography fontWeight={600}>{snap.companyName}{snap.legalForm ? ` ${snap.legalForm}` : ''}</Typography>
              {snap.address?.street && <Typography variant="body2">{snap.address.street}</Typography>}
              {snap.address?.city && <Typography variant="body2">{snap.address.zip} {snap.address.city}</Typography>}
              {snap.vatId && <Typography variant="body2" color="text.secondary">USt-IdNr.: {snap.vatId}</Typography>}
              {snap.creditorAccount && <Typography variant="body2" color="text.secondary">{de ? 'Kreditorenkonto' : 'Creditor account'}: {snap.creditorAccount}</Typography>}

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2} mb={2}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary" display="block">{t('vendorInvoices.invoiceDate')}</Typography>
                  <Typography variant="body2">{new Date(inv.invoiceDate).toLocaleDateString(locale)}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary" display="block">{t('vendorInvoices.dueDate')}</Typography>
                  <Typography variant="body2" color={overdue ? 'error.main' : 'inherit'}>{new Date(inv.dueDate).toLocaleDateString(locale)}</Typography>
                </Grid>
                {inv.approvedAt && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">{t('vendorInvoices.status.approved')}</Typography>
                    <Typography variant="body2">{new Date(inv.approvedAt).toLocaleDateString(locale)}</Typography>
                  </Grid>
                )}
                {inv.paidAt && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">{t('vendorInvoices.status.paid')}</Typography>
                    <Typography variant="body2">{new Date(inv.paidAt).toLocaleDateString(locale)}</Typography>
                  </Grid>
                )}
              </Grid>

              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 520 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Leistung' : 'Item / Service'}</TableCell>
                      <TableCell>{t('vendorInvoices.expenseAccount')}</TableCell>
                      <TableCell align="right">{t('vendorInvoices.quantity')}</TableCell>
                      <TableCell align="right">{t('vendorInvoices.unitPriceEur')}</TableCell>
                      <TableCell align="right">{t('vendorInvoices.vatRate')}</TableCell>
                      <TableCell align="right">{t('vendorInvoices.lineNet')}</TableCell>
                      <TableCell align="right">{t('vendorInvoices.lineGross')}</TableCell>
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
                          <TableCell>
                            {l.expenseAccount
                              ? <Typography variant="body2" fontFamily="monospace">{l.expenseAccount}</Typography>
                              : <Typography variant="caption" color="text.disabled">—</Typography>}
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
                  <Typography variant="caption" color="text.secondary">{t('vendorInvoices.notes')}</Typography>
                  <Typography variant="body2">{inv.notes}</Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {de ? 'Belege & Anhänge' : 'Documents & Attachments'}
                </Typography>
                <Tooltip title={de ? 'Datei hochladen (PDF, JPEG, PNG, DOC — max. 10 MB)' : 'Upload file (PDF, JPEG, PNG, DOC — max 10 MB)'}>
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={uploading ? <CircularProgress size={14} /> : <AttachFileIcon />}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || ['paid', 'cancelled'].includes(inv.status)}
                    >
                      {de ? 'Hochladen' : 'Upload'}
                    </Button>
                  </span>
                </Tooltip>
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" style={{ display: 'none' }} onChange={handleFileChange} />
              </Stack>
              {uploadError && <Alert severity="error" sx={{ mb: 1 }}>{uploadError}</Alert>}
              {uploading && <LinearProgress sx={{ mb: 1 }} />}
              {attachments.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  {de ? 'Keine Anhänge.' : 'No attachments.'}
                </Typography>
              ) : (
                <List dense disablePadding>
                  {attachments.map(att => (
                    <ListItem key={att._id} divider sx={{ pr: 10 }}>
                      <ListItemText
                        primary={att.originalName}
                        secondary={`${att.mimeType} · ${fmtBytes(att.sizeBytes)} · ${new Date(att.uploadedAt).toLocaleDateString(locale)}`}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <ListItemSecondaryAction>
                        <IconButton size="small" onClick={() => handleDownload(att._id, att.originalName)}>
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteAttachment(att._id)} disabled={['paid', 'cancelled'].includes(inv.status)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
              {attachments.length === 0 && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  {de
                    ? 'GoBD: Digitale Originale bitte vor der Buchung als Beleg hochladen.'
                    : 'GoBD: Upload digital originals as proof before posting.'}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('vendorInvoices.summary')}</Typography>
              <Stack gap={1}>
                <Row label={t('vendorInvoices.netAmount')}   value={money(inv.totalNetCents, locale)} />
                <Row label={t('vendorInvoices.vatAmount')}   value={money(inv.totalVatCents, locale)} />
                <Divider />
                <Row label={t('vendorInvoices.grossAmount')} value={money(inv.totalGrossCents, locale)} bold />
                {inv.paidCents > 0 && <Row label={t('vendorInvoices.paidAmount')} value={money(inv.paidCents, locale)} color="success.main" />}
                {!['paid','cancelled'].includes(inv.status) && openCents > 0 && (
                  <Row label={t('vendorInvoices.openAmount')} value={money(openCents, locale)} color={overdue ? 'error.main' : 'inherit'} bold />
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Buchungen & Lagerbewegungen */}
      {(() => {
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
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {entries.map((entry: any) => (
                      <>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {entry.lines.map((line: any, li: number) => (
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
                                {line.debit > 0 ? line.debit.toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €' : '—'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              <Typography variant="caption" color={line.credit > 0 ? 'text.primary' : 'text.disabled'}>
                                {line.credit > 0 ? line.credit.toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €' : '—'}
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
                      <TableCell align="right">{de ? 'Menge (+)' : 'Qty (+)'}</TableCell>
                      <TableCell align="right">{de ? 'Bestand danach' : 'Stock after'}</TableCell>
                      <TableCell align="right">{de ? 'EK-Wert (netto)' : 'Cost value'}</TableCell>
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ) : movements.map((m: any) => (
                      <TableRow key={m._id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{m.itemName}</Typography>
                          <Typography variant="caption" color="text.secondary">{m.itemCategory}</Typography>
                        </TableCell>
                        <TableCell><Typography variant="body2" color="text.secondary">{m.lineDescription}</Typography></TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600} color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            +{m.quantity}
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

      {/* Action dialogs */}
      <Dialog open={dialog !== null && dialog !== 'reject'} onClose={() => !acting && setDialog(null)}>
        <DialogTitle>
          {dialog === 'submit'  && (de ? 'Zur Genehmigung einreichen' : 'Submit for Approval')}
          {dialog === 'approve' && t('vendorInvoices.approveInvoice')}
          {dialog === 'paid'    && t('vendorInvoices.markPaid')}
          {dialog === 'cancel'  && t('vendorInvoices.cancelInvoice')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {dialog === 'submit'  && (de ? 'Rechnung zur Genehmigung weiterleiten?' : 'Forward invoice for approval?')}
            {dialog === 'approve' && t('vendorInvoices.approveConfirm')}
            {dialog === 'paid'    && t('vendorInvoices.paidConfirm')}
            {dialog === 'cancel'  && t('vendorInvoices.cancelConfirm')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={acting}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            color={dialog === 'cancel' ? 'error' : 'primary'}
            onClick={() => handleAction(dialog)}
            disabled={acting}
            startIcon={acting ? <CircularProgress size={16} /> : undefined}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={dialog === 'reject'} onClose={() => !acting && setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{de ? 'Rechnung ablehnen' : 'Reject Invoice'}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {de ? 'Bitte geben Sie einen Ablehnungsgrund an.' : 'Please provide a reason for rejection.'}
          </DialogContentText>
          <TextField
            label={de ? 'Ablehnungsgrund' : 'Rejection reason'}
            multiline rows={3} fullWidth
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={acting}>{t('common.cancel')}</Button>
          <Button
            variant="contained" color="error"
            onClick={() => handleAction('reject')}
            disabled={acting || !rejectNote.trim()}
            startIcon={acting ? <CircularProgress size={16} /> : undefined}
          >
            {de ? 'Ablehnen' : 'Reject'}
          </Button>
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
