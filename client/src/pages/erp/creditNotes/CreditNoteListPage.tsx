import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Table, TableHead, TableBody, TableRow,
  TableCell, CircularProgress, Alert, Chip, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { creditNotesApi, type CreditNoteStatus } from '../../../api/creditNotes';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<CreditNoteStatus, 'default' | 'info' | 'success' | 'error'> = {
  draft:     'default',
  sent:      'info',
  posted:    'success',
  cancelled: 'error',
};

export default function CreditNoteListPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  const [statusFilter, setStatus] = useState('');

  const STATUS_LABEL: Record<CreditNoteStatus, string> = {
    draft:     de ? 'Entwurf'   : 'Draft',
    sent:      de ? 'Gesendet'  : 'Sent',
    posted:    de ? 'Gebucht'   : 'Posted',
    cancelled: de ? 'Storniert' : 'Cancelled',
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['credit-notes', statusFilter],
    queryFn:  () => creditNotesApi.list({ status: statusFilter || undefined }),
  });
  const creditNotes = data?.data?.creditNotes ?? [];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Gutschriften' : 'Credit Notes'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Ausgestellte Gutschriften an Kunden' : 'Credit notes issued to customers'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/verkauf/gutschriften/new')}>
          {de ? 'Neue Gutschrift' : 'New credit note'}
        </Button>
      </Stack>

      <Stack direction="row" gap={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{de ? 'Status' : 'Status'}</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatus(e.target.value)}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            {(Object.keys(STATUS_LABEL) as CreditNoteStatus[]).map(s => (
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
                <TableCell>{de ? 'Kunde' : 'Customer'}</TableCell>
                <TableCell>{de ? 'Bezug auf Rechnung' : 'Original invoice'}</TableCell>
                <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                <TableCell align="right">{de ? 'Betrag (brutto)' : 'Total (gross)'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {creditNotes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Keine Gutschriften gefunden.' : 'No credit notes found.'}
                  </TableCell>
                </TableRow>
              )}
              {creditNotes.map(cn => (
                <TableRow key={cn._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/verkauf/gutschriften/${cn._id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{cn.creditNoteNumber}</TableCell>
                  <TableCell><Typography variant="body2" fontWeight={500}>{cn.customerName}</Typography></TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary' }}>
                    {cn.invoiceNumber || '—'}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(cn.creditNoteDate).toLocaleDateString(locale)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABEL[cn.status]} color={STATUS_COLOR[cn.status]} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'error.main' }}>
                    −{fmtCents(cn.totalGrossCents, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
