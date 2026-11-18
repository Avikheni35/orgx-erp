import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Grid, TextField,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SendIcon from '@mui/icons-material/Send';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import CancelIcon from '@mui/icons-material/Cancel';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elsterApi, type FilingStatus, type FilingType } from '../../../api/elster';

const STATUS_COLOR: Record<FilingStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft:     'default',
  ready:     'warning',
  submitted: 'info',
  confirmed: 'success',
  rejected:  'error',
};

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function ElsterDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';

  const [actionError,  setActionError]  = useState('');
  const [confirmNum,   setConfirmNum]   = useState('');
  const [showConfirm,  setShowConfirm]  = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['elster-filing', id],
    queryFn:  () => elsterApi.get(id!),
    enabled:  !!id,
  });
  const f = data?.data;

  function invalidate() { qc.invalidateQueries({ queryKey: ['elster-filings'] }); refetch(); setActionError(''); }
  function onErr(e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
  }

  const readyMut   = useMutation({ mutationFn: () => elsterApi.markReady(id!),   onSuccess: invalidate, onError: onErr });
  const submitMut  = useMutation({ mutationFn: () => elsterApi.submit(id!),      onSuccess: invalidate, onError: onErr });
  const confirmMut = useMutation({ mutationFn: () => elsterApi.confirm(id!, confirmNum), onSuccess: () => { invalidate(); setShowConfirm(false); }, onError: onErr });
  const rejectMut  = useMutation({ mutationFn: () => elsterApi.reject(id!),      onSuccess: invalidate, onError: onErr });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !f) return <Alert severity="error">{de ? 'Meldung nicht gefunden.' : 'Filing not found.'}</Alert>;

  const STATUS_LABEL: Record<FilingStatus, string> = {
    draft:     de ? 'Entwurf'     : 'Draft',
    ready:     de ? 'Freigegeben' : 'Ready',
    submitted: de ? 'Eingereicht' : 'Submitted',
    confirmed: de ? 'Bestätigt'   : 'Confirmed',
    rejected:  de ? 'Abgelehnt'   : 'Rejected',
  };

  const TYPE_LABEL: Record<FilingType, string> = {
    uva: de ? 'Umsatzsteuervoranmeldung (UStVA)' : 'VAT Advance Return (UStVA)',
    zm:  de ? 'Zusammenfassende Meldung (ZM)'    : 'EC Sales List (ZM)',
    lsz: de ? 'Lohnsteueranmeldung'               : 'Payroll Tax Return',
  };

  const months = de ? MONTHS_DE : MONTHS_EN;
  const periodLabel = f.periodType === 'quarterly'
    ? `Q${f.period} ${f.year}`
    : `${months[f.period - 1]} ${f.year}`;

  const fmt = (n: number) => n.toLocaleString(de ? 'de-DE' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const totalOutputTax = f.outputTax19 + f.outputTax7;

  return (
    <Box maxWidth={860}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/steuer/elster')}>
          ELSTER
        </Button>
      </Stack>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}

      <Stack gap={3}>
        {/* Header */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Stack direction="row" gap={1} alignItems="center" mb={0.5}>
                  <Typography variant="overline" color="text.secondary" fontFamily="monospace" fontWeight={700}>
                    {f.filingNumber}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[f.status]} color={STATUS_COLOR[f.status]} />
                </Stack>
                <Typography variant="h6" fontWeight={700}>{TYPE_LABEL[f.type]}</Typography>
                <Typography variant="body2" color="text.secondary">{periodLabel}</Typography>
                {f.confirmationNumber && (
                  <Typography variant="body2" color="success.main" fontFamily="monospace" mt={0.5}>
                    {de ? 'Bearbeitungsnr.' : 'Confirmation no.'}: {f.confirmationNumber}
                  </Typography>
                )}
                {f.submittedAt && (
                  <Typography variant="body2" color="text.secondary">
                    {de ? 'Eingereicht am' : 'Submitted'}: {new Date(f.submittedAt).toLocaleDateString(de ? 'de-DE' : 'en-GB')}
                  </Typography>
                )}
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">{de ? 'Zahllast / Erstattung' : 'Net payable / refund'}</Typography>
                <Typography variant="h5" fontWeight={700} color={f.netTaxPayable >= 0 ? 'error.main' : 'success.main'}
                  sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {f.netTaxPayable < 0 ? '−' : ''}{fmt(Math.abs(f.netTaxPayable))}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {f.netTaxPayable < 0 ? (de ? 'Erstattung' : 'Refund') : (de ? 'Zahlung' : 'Payment')}
                </Typography>
              </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" gap={1} flexWrap="wrap">
              {f.status === 'draft' && (
                <Button variant="outlined" startIcon={<CheckCircleIcon />}
                  disabled={readyMut.isPending} onClick={() => readyMut.mutate()}>
                  {de ? 'Freigeben' : 'Mark as ready'}
                </Button>
              )}
              {(f.status === 'draft' || f.status === 'ready') && (
                <Button variant="contained" startIcon={<SendIcon />}
                  disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
                  {de ? 'Als eingereicht markieren' : 'Mark as submitted'}
                </Button>
              )}
              {f.status === 'submitted' && !showConfirm && (
                <>
                  <Button variant="contained" color="success" startIcon={<ThumbUpIcon />}
                    onClick={() => setShowConfirm(true)}>
                    {de ? 'Bearbeitungsnummer eingeben' : 'Enter confirmation number'}
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                    disabled={rejectMut.isPending} onClick={() => rejectMut.mutate()}>
                    {de ? 'Als abgelehnt markieren' : 'Mark as rejected'}
                  </Button>
                </>
              )}
              {showConfirm && (
                <Stack direction="row" gap={1} alignItems="center">
                  <TextField size="small" label={de ? 'ELSTER-Bearbeitungsnummer' : 'ELSTER confirmation number'}
                    value={confirmNum} onChange={e => setConfirmNum(e.target.value)}
                    inputProps={{ style: { fontFamily: 'monospace' } }}
                    placeholder="T20250001234567890" sx={{ width: 300 }} />
                  <Button variant="contained" color="success" disabled={!confirmNum || confirmMut.isPending}
                    onClick={() => confirmMut.mutate()}>
                    {de ? 'Bestätigen' : 'Confirm'}
                  </Button>
                  <Button onClick={() => setShowConfirm(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
                </Stack>
              )}
            </Stack>
            {f.notes && <Typography variant="body2" color="text.secondary" mt={1}>{f.notes}</Typography>}
          </CardContent>
        </Card>

        {/* UVA Form values */}
        {f.type === 'uva' && (
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>
                {de ? 'Formularwerte (UStVA)' : 'Form values (UStVA)'}
              </Typography>
              <Grid container spacing={0}>
                {[
                  { kz: 'KZ 81', label: de ? 'Lieferungen/Leistungen 19%' : 'Supplies 19%',    value: f.taxableRevenue19, section: de ? 'Umsätze' : 'Revenue' },
                  { kz: 'KZ 86', label: de ? 'Lieferungen/Leistungen 7%'  : 'Supplies 7%',     value: f.taxableRevenue7,  section: '' },
                  { kz: 'KZ 35', label: de ? 'Steuerfreie Umsätze'        : 'Exempt revenue',  value: f.taxableRevenue0,  section: '' },
                  { kz: 'KZ 62', label: de ? 'Umsatzsteuer 19%'           : 'Output tax 19%',  value: f.outputTax19,      section: de ? 'Umsatzsteuer' : 'Output tax' },
                  { kz: 'KZ 63', label: de ? 'Umsatzsteuer 7%'            : 'Output tax 7%',   value: f.outputTax7,       section: '' },
                  { kz: 'KZ —',  label: de ? 'Umsatzsteuer gesamt'        : 'Total output tax', value: totalOutputTax,    section: '' },
                  { kz: 'KZ 66', label: de ? 'Abziehbare Vorsteuerbeträge': 'Input tax',       value: f.inputTax,         section: de ? 'Vorsteuer' : 'Input tax' },
                  { kz: 'KZ 83', label: de ? 'Verbleibende Zahllast'      : 'Net payable',     value: f.netTaxPayable,    section: de ? 'Ergebnis' : 'Result' },
                ].map((row, i) => (
                  <Grid item xs={12} key={i} sx={{ display: 'flex', alignItems: 'center', py: 0.75,
                    borderTop: row.section ? '1px solid' : 'none',
                    borderColor: 'divider',
                    bgcolor: row.kz === 'KZ 83' ? 'action.hover' : 'transparent',
                  }}>
                    {row.section && (
                      <Typography variant="caption" color="text.secondary" sx={{ width: 140, fontWeight: 600 }}>
                        {row.section}
                      </Typography>
                    )}
                    {!row.section && <Box sx={{ width: 140 }} />}
                    <Typography variant="caption" color="text.disabled" fontFamily="monospace" sx={{ width: 50 }}>
                      {row.kz}
                    </Typography>
                    <Typography variant="body2" flex={1}>{row.label}</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontWeight={row.kz === 'KZ 83' ? 700 : 400}
                      color={row.kz === 'KZ 83' ? (f.netTaxPayable >= 0 ? 'error.main' : 'success.main') : 'text.primary'}
                      sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 140, textAlign: 'right' }}>
                      {fmt(row.value)}
                    </Typography>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
}
