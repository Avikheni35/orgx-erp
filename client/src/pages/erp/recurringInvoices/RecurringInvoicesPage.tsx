import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Paper, Chip, IconButton, Tooltip, Stack, CircularProgress,
  Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import { useTranslation } from 'react-i18next';
import { recurringInvoicesApi, type RecurringInvoice } from '../../../api/recurringInvoices';

function fmtCents(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE');
}

function freqLabel(f: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    weekly:    t('recurring.freq.weekly'),
    monthly:   t('recurring.freq.monthly'),
    quarterly: t('recurring.freq.quarterly'),
    yearly:    t('recurring.freq.yearly'),
  };
  return map[f] ?? f;
}

export default function RecurringInvoicesPage() {
  const { t } = useTranslation();
  const navigate   = useNavigate();
  const queryClient = useQueryClient();

  const [deleteTarget, setDeleteTarget] = useState<RecurringInvoice | null>(null);
  const [runTarget,    setRunTarget]    = useState<RecurringInvoice | null>(null);
  const [successMsg,   setSuccessMsg]   = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['recurring-invoices'],
    queryFn:  () => recurringInvoicesApi.list().then(r => r.data),
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => recurringInvoicesApi.toggleStatus(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => recurringInvoicesApi.delete(id),
    onSuccess:  () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
    },
  });

  const runMut = useMutation({
    mutationFn: (id: string) => recurringInvoicesApi.runNow(id),
    onSuccess:  (res) => {
      setRunTarget(null);
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
      setSuccessMsg(t('recurring.runSuccess', { number: res.data.invoice.invoiceNumber }));
      setTimeout(() => setSuccessMsg(''), 5000);
    },
  });

  const templates = data?.templates ?? [];

  const totalGross = (ri: RecurringInvoice) =>
    ri.lineItems.reduce((s, l) => s + l.totalGrossCents, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('recurring.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('recurring.subtitle')}</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />}
          onClick={() => navigate('/erp/wiederkehrend/neu')}>
          {t('recurring.create')}
        </Button>
      </Stack>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {isLoading && <CircularProgress />}
      {error    && <Alert severity="error">{String(error)}</Alert>}

      {!isLoading && !error && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('recurring.col.title')}</TableCell>
                <TableCell>{t('recurring.col.customer')}</TableCell>
                <TableCell>{t('recurring.col.frequency')}</TableCell>
                <TableCell>{t('recurring.col.amount')}</TableCell>
                <TableCell>{t('recurring.col.nextRun')}</TableCell>
                <TableCell>{t('recurring.col.lastRun')}</TableCell>
                <TableCell>{t('recurring.col.status')}</TableCell>
                <TableCell align="right">{t('recurring.col.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {t('recurring.empty')}
                  </TableCell>
                </TableRow>
              )}
              {templates.map(ri => (
                <TableRow key={ri._id} hover sx={{ opacity: ri.status === 'paused' ? 0.6 : 1 }}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{ri.title}</Typography>
                  </TableCell>
                  <TableCell>{ri.customerSnapshot.companyName}</TableCell>
                  <TableCell>
                    <Chip label={freqLabel(ri.frequency, t)} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell>{fmtCents(totalGross(ri))}</TableCell>
                  <TableCell sx={{ color: ri.status === 'active' ? 'warning.main' : 'text.secondary', fontWeight: 600 }}>
                    {fmtDate(ri.nextRunDate)}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>
                    {ri.lastRunAt ? fmtDate(ri.lastRunAt) : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={ri.status === 'active' ? t('recurring.status.active') : t('recurring.status.paused')}
                      size="small"
                      color={ri.status === 'active' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title={t('recurring.runNow')}>
                        <IconButton size="small" color="primary"
                          onClick={() => setRunTarget(ri)}
                          disabled={runMut.isPending}>
                          <FlashOnIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={ri.status === 'active' ? t('recurring.pause') : t('recurring.resume')}>
                        <IconButton size="small"
                          onClick={() => toggleMut.mutate(ri._id)}
                          disabled={toggleMut.isPending}>
                          {ri.status === 'active' ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.edit')}>
                        <IconButton size="small"
                          onClick={() => navigate(`/erp/wiederkehrend/${ri._id}/bearbeiten`)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.delete')}>
                        <IconButton size="small" color="error"
                          onClick={() => setDeleteTarget(ri)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Run now confirm */}
      <Dialog open={!!runTarget} onClose={() => setRunTarget(null)}>
        <DialogTitle>{t('recurring.runNowTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('recurring.runNowConfirm', { title: runTarget?.title })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunTarget(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" startIcon={<FlashOnIcon />}
            onClick={() => runTarget && runMut.mutate(runTarget._id)}
            disabled={runMut.isPending}>
            {t('recurring.runNow')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('recurring.deleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('recurring.deleteConfirm', { title: deleteTarget?.title })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="error"
            onClick={() => deleteTarget && deleteMut.mutate(deleteTarget._id)}
            disabled={deleteMut.isPending}>
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
