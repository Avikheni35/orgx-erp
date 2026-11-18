import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, CircularProgress, Alert, Button, Stack, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, TextField,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import { useTranslation } from 'react-i18next';
import { vendorInvoicesApi, type VendorInvoice } from '../../../api/vendorInvoices';

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function ApprovalsPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const de = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [acting, setActing]       = useState(false);
  const [selected, setSelected]   = useState<VendorInvoice | null>(null);
  const [dialog, setDialog]       = useState<'approve' | 'reject' | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [error, setError]         = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-invoices-pending'],
    queryFn: () => vendorInvoicesApi.pendingApprovals(),
    refetchInterval: 30_000,
  });

  const invoices = data?.data?.invoices ?? [];

  const openDialog = (inv: VendorInvoice, type: 'approve' | 'reject') => {
    setSelected(inv);
    setRejectNote('');
    setError('');
    setDialog(type);
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActing(true); setError('');
    try {
      await vendorInvoicesApi.approve(selected._id);
      await qc.invalidateQueries({ queryKey: ['vendor-invoices-pending'] });
      setDialog(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setActing(true); setError('');
    try {
      await vendorInvoicesApi.reject(selected._id, rejectNote);
      await qc.invalidateQueries({ queryKey: ['vendor-invoices-pending'] });
      setDialog(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setActing(false);
    }
  };

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={1}>{de ? 'Genehmigungen' : 'Approvals'}</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {de ? 'Eingangsrechnungen, die Ihre Genehmigung erfordern.' : 'Vendor invoices awaiting your approval.'}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {invoices.length === 0 ? (
        <Alert severity="success">
          {de ? 'Keine ausstehenden Genehmigungen.' : 'No pending approvals.'}
        </Alert>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{de ? 'Rechnungsnummer' : 'Invoice No.'}</TableCell>
              <TableCell>{de ? 'Lieferant' : 'Supplier'}</TableCell>
              <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
              <TableCell>{de ? 'Fälligkeit' : 'Due'}</TableCell>
              <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
              <TableCell>{de ? 'Status' : 'Status'}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map(inv => (
              <TableRow
                key={inv._id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/erp/einkauf/eingangsrechnungen/${inv._id}`)}
              >
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{inv.supplierInvoiceNumber}</Typography>
                </TableCell>
                <TableCell>{inv.supplierSnapshot.companyName}</TableCell>
                <TableCell>{new Date(inv.invoiceDate).toLocaleDateString(locale)}</TableCell>
                <TableCell>{new Date(inv.dueDate).toLocaleDateString(locale)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  <strong>{money(inv.totalGrossCents, locale)}</strong>
                </TableCell>
                <TableCell>
                  <Chip size="small" label={de ? 'Warte auf Genehmigung' : 'Pending Approval'} color="warning" />
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Stack direction="row" gap={1}>
                    <Button
                      size="small" variant="outlined" color="success"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => openDialog(inv, 'approve')}
                    >
                      {de ? 'Genehmigen' : 'Approve'}
                    </Button>
                    <Button
                      size="small" variant="outlined" color="error"
                      startIcon={<ThumbDownIcon />}
                      onClick={() => openDialog(inv, 'reject')}
                    >
                      {de ? 'Ablehnen' : 'Reject'}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Approve dialog */}
      <Dialog open={dialog === 'approve'} onClose={() => !acting && setDialog(null)}>
        <DialogTitle>{de ? 'Rechnung genehmigen' : 'Approve Invoice'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {selected ? (
              de
                ? `Eingangsrechnung „${selected.supplierInvoiceNumber}" von ${selected.supplierSnapshot.companyName} (${money(selected.totalGrossCents, locale)}) genehmigen und buchen?`
                : `Approve and post vendor invoice "${selected.supplierInvoiceNumber}" from ${selected.supplierSnapshot.companyName} (${money(selected.totalGrossCents, locale)})?`
            ) : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={acting}>{t('common.cancel')}</Button>
          <Button
            variant="contained" color="success"
            onClick={handleApprove}
            disabled={acting}
            startIcon={acting ? <CircularProgress size={16} /> : undefined}
          >
            {de ? 'Genehmigen' : 'Approve'}
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
            onClick={handleReject}
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
