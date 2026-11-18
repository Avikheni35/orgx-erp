import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, CardContent, Table, TableHead, TableBody,
  TableRow, TableCell, Chip, Stack, Alert, CircularProgress,
  Grid, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import UndoIcon from '@mui/icons-material/Undo';
import LockIcon from '@mui/icons-material/Lock';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import { useTranslation } from 'react-i18next';
import { journalApi, type JournalStatus } from '../../../api/journal';

const STATUS_COLOR: Record<JournalStatus, 'default' | 'info' | 'success' | 'error'> = {
  draft:    'default',
  posted:   'success',
  reversed: 'error',
};

function money(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function JournalEntryDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';

  const STATUS_LABEL: Record<JournalStatus, string> = {
    draft:    t('journal.statusDraft'),
    posted:   t('journal.statusPosted'),
    reversed: t('journal.statusReversed'),
  };

  const [reverseDlg, setReverseDlg]   = useState(false);
  const [reverseDate, setReverseDate] = useState(new Date().toISOString().slice(0, 10));
  const [actionErr, setActionErr]     = useState('');

  const fmt = (d: string) => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });

  const { data, isLoading } = useQuery({
    queryKey: ['journal-entry', id],
    queryFn:  () => journalApi.get(id!),
    enabled:  !!id,
  });
  const entry = data?.data;

  const { mutate: postEntry, isPending: posting } = useMutation({
    mutationFn: () => journalApi.post(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entry', id] }); qc.invalidateQueries({ queryKey: ['journal'] }); },
    onError: (e: unknown) => setActionErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error')),
  });

  const { mutate: reverseEntry, isPending: reversing } = useMutation({
    mutationFn: () => journalApi.reverse(id!, reverseDate),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['journal-entry', id] });
      qc.invalidateQueries({ queryKey: ['journal'] });
      setReverseDlg(false);
      navigate(`/erp/buchfuehrung/${res.data.reversal._id}`);
    },
    onError: (e: unknown) => setActionErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error')),
  });

  if (isLoading) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!entry)   return <Alert severity="error">{t('common.noData')}</Alert>;

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} size="small">
          {t('common.back')}
        </Button>
        <Box flex={1}>
          <Typography variant="h5" fontWeight={700}>{entry.entryNumber}</Typography>
          <Stack direction="row" gap={1} mt={0.5}>
            <Chip label={STATUS_LABEL[entry.status]} color={STATUS_COLOR[entry.status]} size="small" />
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
              {fmt(entry.date)}
            </Typography>
          </Stack>
        </Box>
        {entry.status === 'draft' && (
          <Button variant="contained" startIcon={<SendIcon />} onClick={() => postEntry()} disabled={posting}>
            {posting ? <CircularProgress size={18} color="inherit" /> : t('journal.postNow')}
          </Button>
        )}
        {entry.status === 'posted' && !entry.reversedBy && (
          <Button variant="outlined" color="warning" startIcon={<UndoIcon />} onClick={() => setReverseDlg(true)}>
            {t('journal.reverse')}
          </Button>
        )}
      </Stack>

      {actionErr && <Alert severity="error" sx={{ mb: 2 }}>{actionErr}</Alert>}

      {entry.reversalOf && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('journal.isReversalOf')}{' '}
          <strong
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => navigate(`/erp/buchfuehrung/${entry.reversalOf}`)}
          >
            {entry.reversalOf}
          </strong>.
        </Alert>
      )}
      {entry.reversedBy && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('journal.wasReversed')}{' '}
          <strong
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => navigate(`/erp/buchfuehrung/${entry.reversedBy}`)}
          >
            {t('journal.toReversal')}
          </strong>
        </Alert>
      )}

      {/* Header card */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" mb={1.5}>{t('journal.documentHeader')}</Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">{t('journal.entryNumber')}</Typography>
              <Typography fontWeight={600} fontFamily="monospace">{entry.entryNumber}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">{t('journal.postingDate')}</Typography>
              <Typography>{fmt(entry.date)}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="caption" color="text.secondary">{t('journal.postingText')}</Typography>
              <Typography fontWeight={500}>{entry.description}</Typography>
            </Grid>
            {entry.reference && (
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">{t('journal.referenceNo')}</Typography>
                <Typography fontFamily="monospace">{entry.reference}</Typography>
              </Grid>
            )}
            {entry.postedAt && (
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">{t('journal.postedAt')}</Typography>
                <Typography>{fmt(entry.postedAt)}</Typography>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="subtitle2" color="text.secondary" mb={1}>{t('journal.journalLines')}</Typography>
        </CardContent>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell>{t('journal.accountNumber')}</TableCell>
              <TableCell>{t('journal.accountName')}</TableCell>
              <TableCell>{t('journal.lineDescription')}</TableCell>
              <TableCell align="right">{t('common.debit')}</TableCell>
              <TableCell align="right">{t('common.credit')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entry.lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600} fontFamily="monospace">{l.accountNumber}</Typography>
                </TableCell>
                <TableCell><Typography variant="body2">{l.accountName}</Typography></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{l.description || '—'}</Typography></TableCell>
                <TableCell align="right">
                  {l.debit > 0 && (
                    <Typography variant="body2" fontFamily="monospace" fontWeight={600} color="primary.main">
                      {money(l.debit)}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  {l.credit > 0 && (
                    <Typography variant="body2" fontFamily="monospace" fontWeight={600} color="error.main">
                      {money(l.credit)}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell colSpan={3}>
                <Typography variant="caption" fontWeight={700}>{t('common.total')}</Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontFamily="monospace" fontWeight={700}>{money(entry.totalDebit)}</Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontFamily="monospace" fontWeight={700}>{money(entry.totalCredit)}</Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      {/* GoBD Hash */}
      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" gap={1} mb={1}>
            <FingerprintIcon fontSize="small" color="action" />
            <Typography variant="subtitle2" color="text.secondary">{t('journal.gobdHash')}</Typography>
            <Tooltip title={t('journal.gobdNote')}>
              <LockIcon fontSize="small" color="action" />
            </Tooltip>
          </Stack>
          <Typography variant="caption" fontFamily="monospace" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            {entry.gobdHash}
          </Typography>
        </CardContent>
      </Card>

      {/* Reverse Dialog */}
      <Dialog open={reverseDlg} onClose={() => setReverseDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('journal.reverseDialog.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {t('journal.reverseDialog.description')}
          </Typography>
          <TextField
            label={t('journal.reverseDialog.reverseDate')}
            type="date"
            value={reverseDate}
            onChange={(e) => setReverseDate(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
          />
          {actionErr && <Alert severity="error" sx={{ mt: 2 }}>{actionErr}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReverseDlg(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="warning" onClick={() => reverseEntry()} disabled={reversing}>
            {reversing ? <CircularProgress size={18} color="inherit" /> : t('journal.reverseDialog.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
