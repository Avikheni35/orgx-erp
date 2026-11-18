import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Grid,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import UndoIcon from '@mui/icons-material/Undo';
import CancelIcon from '@mui/icons-material/Cancel';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { accrualsApi, type AccrualStatus, type AccrualType } from '../../../api/accruals';

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<AccrualStatus, 'default' | 'info' | 'warning' | 'error'> = {
  draft:     'default',
  posted:    'info',
  reversed:  'warning',
  cancelled: 'error',
};

export default function AccrualDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['accrual', id],
    queryFn:  () => accrualsApi.get(id!),
    enabled:  !!id,
  });
  const acc = data?.data;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['accruals'] });
    refetch();
    setActionError('');
  }

  function onErr(e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
  }

  const postMut    = useMutation({ mutationFn: () => accrualsApi.post(id!),    onSuccess: invalidate, onError: onErr });
  const reverseMut = useMutation({ mutationFn: () => accrualsApi.reverse(id!), onSuccess: invalidate, onError: onErr });
  const cancelMut  = useMutation({ mutationFn: () => accrualsApi.cancel(id!),  onSuccess: invalidate, onError: onErr });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !acc) return <Alert severity="error">{de ? 'Abgrenzung nicht gefunden.' : 'Accrual not found.'}</Alert>;

  const STATUS_LABEL: Record<AccrualStatus, string> = {
    draft:     de ? 'Entwurf'     : 'Draft',
    posted:    de ? 'Gebucht'     : 'Posted',
    reversed:  de ? 'Storniert'   : 'Reversed',
    cancelled: de ? 'Abgebrochen' : 'Cancelled',
  };

  const TYPE_LABEL: Record<AccrualType, string> = {
    arap: de ? 'ARAP — Aktive Rechnungsabgrenzung' : 'ARAP — Prepaid expense',
    prap: de ? 'PRAP — Passive Rechnungsabgrenzung' : 'PRAP — Deferred revenue',
  };

  const journalAccountingNote = acc.type === 'arap'
    ? (de ? `Soll: ${acc.accrualAccount} · Haben: ${acc.contraAccount}` : `Debit: ${acc.accrualAccount} · Credit: ${acc.contraAccount}`)
    : (de ? `Soll: ${acc.contraAccount} · Haben: ${acc.accrualAccount}` : `Debit: ${acc.contraAccount} · Credit: ${acc.accrualAccount}`);

  return (
    <Box maxWidth={800}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/erp/buchfuehrung/abgrenzungen')}>
          {de ? 'Abgrenzungsposten' : 'Accruals'}
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
                    {acc.accrualNumber}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[acc.status]} color={STATUS_COLOR[acc.status]} />
                  <Chip size="small" variant="outlined" label={acc.type.toUpperCase()}
                    color={acc.type === 'arap' ? 'primary' : 'secondary'} />
                </Stack>
                <Typography variant="h6" fontWeight={700}>{acc.description}</Typography>
                <Typography variant="body2" color="text.secondary">{TYPE_LABEL[acc.type]}</Typography>
                {acc.referenceDocument && (
                  <Typography variant="body2" color="text.secondary">
                    {de ? 'Bezug' : 'Reference'}: {acc.referenceDocument}
                  </Typography>
                )}
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">{de ? 'Betrag' : 'Amount'}</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {money(acc.amountCents, locale)}
                </Typography>
              </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2} mb={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Buchungsdatum' : 'Post date'}</Typography>
                <Typography variant="body2">{new Date(acc.postDate).toLocaleDateString(locale)}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Beginn' : 'Start'}</Typography>
                <Typography variant="body2">{new Date(acc.startDate).toLocaleDateString(locale)}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Ende / Auflösung' : 'End / reversal'}</Typography>
                <Typography variant="body2">{new Date(acc.endDate).toLocaleDateString(locale)}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Buchungssatz' : 'Journal entry'}</Typography>
                <Typography variant="body2" fontFamily="monospace" fontSize={12}>{journalAccountingNote}</Typography>
              </Grid>
            </Grid>

            {acc.notes && (
              <Typography variant="body2" color="text.secondary">{acc.notes}</Typography>
            )}

            {acc.journalEntryId && (
              <Box mt={1}>
                <Button size="small" variant="text" startIcon={<OpenInNewIcon fontSize="small" />}
                  onClick={() => navigate(`/erp/buchfuehrung/${acc.journalEntryId}`)}>
                  {de ? 'Buchungssatz ansehen' : 'View journal entry'}
                </Button>
                {acc.reversalJournalEntryId && (
                  <Button size="small" variant="text" startIcon={<OpenInNewIcon fontSize="small" />}
                    onClick={() => navigate(`/erp/buchfuehrung/${acc.reversalJournalEntryId}`)}>
                    {de ? 'Stornobuchung ansehen' : 'View reversal entry'}
                  </Button>
                )}
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" gap={1} flexWrap="wrap">
              {acc.status === 'draft' && (
                <>
                  <Button variant="contained" color="primary" startIcon={<BookmarkIcon />}
                    disabled={postMut.isPending} onClick={() => postMut.mutate()}>
                    {de ? 'Buchen' : 'Post to journal'}
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                    disabled={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                    {de ? 'Abbrechen' : 'Cancel'}
                  </Button>
                </>
              )}
              {acc.status === 'posted' && (
                <Button variant="outlined" color="warning" startIcon={<UndoIcon />}
                  disabled={reverseMut.isPending} onClick={() => reverseMut.mutate()}>
                  {de ? 'Stornieren' : 'Reverse'}
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
