import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Stack, Select, MenuItem, FormControl, InputLabel, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { salesQuotesApi, type QuoteStatus } from '../../../api/salesQuotes';

const STATUS_COLOR: Record<QuoteStatus, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  draft:     'default',
  sent:      'info',
  accepted:  'success',
  rejected:  'error',
  expired:   'warning',
  converted: 'warning',
};

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function SalesQuoteListPage() {
  const navigate     = useNavigate();
  const { i18n }     = useTranslation();
  const de           = i18n.language === 'de';
  const locale       = de ? 'de-DE' : 'en-GB';
  const [status, setStatus] = useState('');

  const STATUS_LABEL: Record<QuoteStatus, string> = {
    draft:     de ? 'Entwurf'     : 'Draft',
    sent:      de ? 'Gesendet'    : 'Sent',
    accepted:  de ? 'Akzeptiert'  : 'Accepted',
    rejected:  de ? 'Abgelehnt'   : 'Rejected',
    expired:   de ? 'Abgelaufen'  : 'Expired',
    converted: de ? 'Umgewandelt' : 'Converted',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['sales-quotes', status],
    queryFn:  () => salesQuotesApi.list({ status: status || undefined }),
  });
  const quotes = data?.data?.quotes ?? [];
  const now    = new Date();

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Angebote' : 'Quotes'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? `${quotes.length} Angebot(e)` : `${quotes.length} quote(s)`}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/verkauf/angebote/new')}>
          {de ? 'Neues Angebot' : 'New quote'}
        </Button>
      </Stack>

      <Card sx={{ mb: 2, p: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{de ? 'Status' : 'Status'}</InputLabel>
          <Select value={status} label="Status" onChange={e => setStatus(e.target.value)}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            {(Object.keys(STATUS_LABEL) as QuoteStatus[]).map(s => (
              <MenuItem key={s} value={s}>{STATUS_LABEL[s]}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Card>

      <Card>
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : quotes.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Typography color="text.secondary">{de ? 'Keine Angebote vorhanden.' : 'No quotes found.'}</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{de ? 'Angebots-Nr.' : 'Quote no.'}</TableCell>
                <TableCell>{de ? 'Kunde' : 'Customer'}</TableCell>
                <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                <TableCell>{de ? 'Gültig bis' : 'Valid until'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                <TableCell align="right">{de ? 'Brutto' : 'Total'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {quotes.map(q => {
                const isExpired = ['draft','sent'].includes(q.status) && new Date(q.validUntil) < now;
                return (
                  <TableRow key={q._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/verkauf/angebote/${q._id}`)}>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{q.quoteNumber}</Typography>
                    </TableCell>
                    <TableCell>{q.customerName}</TableCell>
                    <TableCell>{new Date(q.quoteDate).toLocaleDateString(locale)}</TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        {new Date(q.validUntil).toLocaleDateString(locale)}
                        {isExpired && <Chip size="small" label={de ? 'Abgelaufen' : 'Expired'} color="warning" />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={STATUS_LABEL[q.status]} color={STATUS_COLOR[q.status]} />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {money(q.totalGrossCents, locale)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </Box>
  );
}
