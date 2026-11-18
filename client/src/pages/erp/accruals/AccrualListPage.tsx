import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Table, TableHead, TableBody, TableRow,
  TableCell, CircularProgress, Alert, Chip, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { accrualsApi, type AccrualStatus, type AccrualType } from '../../../api/accruals';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<AccrualStatus, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  draft:     'default',
  posted:    'info',
  reversed:  'warning',
  cancelled: 'error',
};

export default function AccrualListPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  const [typeFilter,   setType]   = useState('');
  const [statusFilter, setStatus] = useState('');

  const STATUS_LABEL: Record<AccrualStatus, string> = {
    draft:     de ? 'Entwurf'   : 'Draft',
    posted:    de ? 'Gebucht'   : 'Posted',
    reversed:  de ? 'Storniert' : 'Reversed',
    cancelled: de ? 'Abgebrochen' : 'Cancelled',
  };

  const TYPE_LABEL: Record<AccrualType, string> = {
    arap: de ? 'ARAP (aktiv)'  : 'ARAP (prepaid expense)',
    prap: de ? 'PRAP (passiv)' : 'PRAP (deferred revenue)',
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['accruals', typeFilter, statusFilter],
    queryFn:  () => accrualsApi.list({
      type:   typeFilter  || undefined,
      status: statusFilter || undefined,
    }),
  });
  const accruals = data?.data?.accruals ?? [];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Rechnungsabgrenzung' : 'Accruals & Deferrals'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'ARAP / PRAP — zeitliche Abgrenzungsposten' : 'ARAP / PRAP — period accruals and deferrals'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />}
          onClick={() => navigate('/erp/buchfuehrung/abgrenzungen/new')}>
          {de ? 'Neue Abgrenzung' : 'New accrual'}
        </Button>
      </Stack>

      <Stack direction="row" gap={2} mb={2} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{de ? 'Typ' : 'Type'}</InputLabel>
          <Select value={typeFilter} label={de ? 'Typ' : 'Type'} onChange={e => setType(e.target.value)}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            <MenuItem value="arap">ARAP</MenuItem>
            <MenuItem value="prap">PRAP</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{de ? 'Status' : 'Status'}</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatus(e.target.value)}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            {(Object.keys(STATUS_LABEL) as AccrualStatus[]).map(s => (
              <MenuItem key={s} value={s}>{STATUS_LABEL[s]}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                <TableCell>{de ? 'Typ' : 'Type'}</TableCell>
                <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                <TableCell>{de ? 'Konto' : 'Account'}</TableCell>
                <TableCell>{de ? 'Buchungsdatum' : 'Post date'}</TableCell>
                <TableCell>{de ? 'Bis' : 'Until'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {accruals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Keine Abgrenzungsposten gefunden.' : 'No accruals found.'}
                  </TableCell>
                </TableRow>
              )}
              {accruals.map(a => (
                <TableRow key={a._id} hover sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/erp/buchfuehrung/abgrenzungen/${a._id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{a.accrualNumber}</TableCell>
                  <TableCell>
                    <Chip size="small" label={a.type.toUpperCase()}
                      color={a.type === 'arap' ? 'primary' : 'secondary'} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{a.description}</Typography>
                    {a.referenceDocument && (
                      <Typography variant="caption" color="text.secondary">{a.referenceDocument}</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{a.accrualAccount}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {new Date(a.postDate).toLocaleDateString(locale)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {new Date(a.endDate).toLocaleDateString(locale)}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABEL[a.status]} color={STATUS_COLOR[a.status]} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtCents(a.amountCents, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <Box mt={3} p={2} sx={{ bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {de
            ? 'ARAP (Aktive Rechnungsabgrenzung): Aufwand der Folgeperiode vorausbezahlt · PRAP (Passive Rechnungsabgrenzung): Ertrag der Folgeperiode vorausempfangen'
            : 'ARAP: Prepaid expenses for next period · PRAP: Deferred revenue received for next period'}
        </Typography>
      </Box>
    </Box>
  );
}
