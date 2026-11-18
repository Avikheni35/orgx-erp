import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Grid, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import { useTranslation } from 'react-i18next';
import { directDebitsApi, type MandateStatus, type MandateSequence } from '../../../api/directDebits';

const STATUS_COLOR: Record<MandateStatus, 'success' | 'default' | 'error'> = {
  active:    'success',
  inactive:  'default',
  cancelled: 'error',
};

export default function MandateDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [editOpen,    setEditOpen]    = useState(false);
  const [editStatus,  setEditStatus]  = useState<MandateStatus>('active');
  const [editSeq,     setEditSeq]     = useState<MandateSequence>('RCUR');
  const [editNotes,   setEditNotes]   = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sepa-mandate', id],
    queryFn:  () => directDebitsApi.getMandate(id!),
    enabled:  !!id,
  });
  const mandate = data?.data;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['sepa-mandates'] });
    refetch();
    setActionError('');
  }

  function onErr(e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
  }

  const updateMut = useMutation({
    mutationFn: () => directDebitsApi.updateMandate(id!, {
      status:   editStatus,
      sequence: editSeq,
      notes:    editNotes,
    }),
    onSuccess: () => { invalidate(); setEditOpen(false); },
    onError:   onErr,
  });

  const cancelMut = useMutation({
    mutationFn: () => directDebitsApi.updateMandate(id!, { status: 'cancelled' }),
    onSuccess:  invalidate,
    onError:    onErr,
  });

  function openEdit() {
    if (!mandate) return;
    setEditStatus(mandate.status);
    setEditSeq(mandate.sequence);
    setEditNotes(mandate.notes ?? '');
    setEditOpen(true);
  }

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !mandate) return <Alert severity="error">{de ? 'Mandat nicht gefunden.' : 'Mandate not found.'}</Alert>;

  const STATUS_LABEL: Record<MandateStatus, string> = {
    active:    de ? 'Aktiv'     : 'Active',
    inactive:  de ? 'Inaktiv'   : 'Inactive',
    cancelled: de ? 'Gekündigt' : 'Cancelled',
  };

  const SEQ_LABEL: Record<MandateSequence, string> = {
    FRST: de ? 'Erstlastschrift' : 'First',
    RCUR: de ? 'Folgelastschrift': 'Recurring',
    OOFF: de ? 'Einmalig'        : 'One-off',
    FNAL: de ? 'Letzte'          : 'Final',
  };

  return (
    <Box maxWidth={800}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/erp/zahlungen/lastschrift')}>
          {de ? 'Lastschrift' : 'Direct Debit'}
        </Button>
      </Stack>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}

      <Stack gap={3}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Stack direction="row" gap={1} alignItems="center" mb={0.5}>
                  <Typography variant="overline" color="text.secondary" fontFamily="monospace" fontWeight={700}>
                    {mandate.mandateReference}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[mandate.status]} color={STATUS_COLOR[mandate.status]} />
                  <Chip size="small" variant="outlined" label={mandate.type} />
                </Stack>
                <Typography variant="h5" fontWeight={700}>{mandate.customerName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {SEQ_LABEL[mandate.sequence]}
                  {' · '}
                  {de ? 'Unterzeichnet' : 'Signed'}: {new Date(mandate.signedAt).toLocaleDateString(locale)}
                </Typography>
              </Box>
              {mandate.status !== 'cancelled' && (
                <Stack direction="row" gap={1}>
                  <Button size="small" startIcon={<EditIcon />} onClick={openEdit}>
                    {de ? 'Bearbeiten' : 'Edit'}
                  </Button>
                  <Button size="small" color="error" startIcon={<BlockIcon />}
                    disabled={cancelMut.isPending}
                    onClick={() => cancelMut.mutate()}>
                    {de ? 'Kündigen' : 'Cancel mandate'}
                  </Button>
                </Stack>
              )}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">IBAN</Typography>
                <Typography variant="body2" fontFamily="monospace">{mandate.iban}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">BIC</Typography>
                <Typography variant="body2" fontFamily="monospace">{mandate.bic || '—'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  {de ? 'Gläubiger-ID' : 'Creditor ID'}
                </Typography>
                <Typography variant="body2" fontFamily="monospace">{mandate.creditorId || '—'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  {de ? 'Erstellt am' : 'Created'}
                </Typography>
                <Typography variant="body2">{new Date(mandate.createdAt).toLocaleDateString(locale)}</Typography>
              </Grid>
              {mandate.notes && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">{de ? 'Notizen' : 'Notes'}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{mandate.notes}</Typography>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      </Stack>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{de ? 'Mandat bearbeiten' : 'Edit mandate'}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <FormControl size="small" fullWidth>
              <InputLabel>{de ? 'Status' : 'Status'}</InputLabel>
              <Select value={editStatus} label="Status" onChange={e => setEditStatus(e.target.value as MandateStatus)}>
                <MenuItem value="active">{STATUS_LABEL.active}</MenuItem>
                <MenuItem value="inactive">{STATUS_LABEL.inactive}</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>{de ? 'Sequenztyp' : 'Sequence type'}</InputLabel>
              <Select value={editSeq} label={de ? 'Sequenztyp' : 'Sequence type'}
                onChange={e => setEditSeq(e.target.value as MandateSequence)}>
                {(['FRST', 'RCUR', 'OOFF', 'FNAL'] as MandateSequence[]).map(s => (
                  <MenuItem key={s} value={s}>{SEQ_LABEL[s]}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={de ? 'Notizen' : 'Notes'}
              size="small" fullWidth multiline rows={3}
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
            />
            {actionError && <Alert severity="error">{actionError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={updateMut.isPending}
            onClick={() => updateMut.mutate()}>
            {updateMut.isPending ? <CircularProgress size={20} /> : (de ? 'Speichern' : 'Save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
