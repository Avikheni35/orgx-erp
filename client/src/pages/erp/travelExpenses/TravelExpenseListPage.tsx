import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Table, TableHead, TableBody, TableRow,
  TableCell, CircularProgress, Alert, Chip, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { travelExpensesApi, type TravelExpenseStatus } from '../../../api/travelExpenses';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<TravelExpenseStatus, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  draft:     'default',
  submitted: 'info',
  approved:  'success',
  rejected:  'error',
  paid:      'warning',
};

export default function TravelExpenseListPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  const [statusFilter, setStatus] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['travel-expenses', statusFilter],
    queryFn:  () => travelExpensesApi.list({ status: statusFilter || undefined }),
  });
  const expenses = data?.data?.expenses ?? [];

  const STATUS_LABEL: Record<TravelExpenseStatus, string> = {
    draft:     de ? 'Entwurf'     : 'Draft',
    submitted: de ? 'Eingereicht' : 'Submitted',
    approved:  de ? 'Genehmigt'   : 'Approved',
    rejected:  de ? 'Abgelehnt'   : 'Rejected',
    paid:      de ? 'Ausgezahlt'  : 'Paid',
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Reisekostenabrechnungen' : 'Travel Expenses'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Erstattung von Reisekosten mit Genehmigungsworkflow' : 'Travel expense reimbursement with approval workflow'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/reisekosten/new')}>
          {de ? 'Neue Abrechnung' : 'New claim'}
        </Button>
      </Stack>

      <Stack direction="row" gap={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{de ? 'Status' : 'Status'}</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatus(e.target.value)}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            {(Object.keys(STATUS_LABEL) as TravelExpenseStatus[]).map(s => (
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
                <TableCell>{de ? 'Mitarbeiter' : 'Employee'}</TableCell>
                <TableCell>{de ? 'Reisezweck' : 'Purpose'}</TableCell>
                <TableCell>{de ? 'Ziel' : 'Destination'}</TableCell>
                <TableCell>{de ? 'Zeitraum' : 'Period'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Keine Abrechnungen gefunden.' : 'No expense claims found.'}
                  </TableCell>
                </TableRow>
              )}
              {expenses.map(e => (
                <TableRow key={e._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/reisekosten/${e._id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{e.expenseNumber}</TableCell>
                  <TableCell><Typography variant="body2" fontWeight={500}>{e.employeeName}</Typography></TableCell>
                  <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.purpose}</TableCell>
                  <TableCell>{e.destination || '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {new Date(e.startDate).toLocaleDateString(locale)}
                    {e.startDate !== e.endDate && ` – ${new Date(e.endDate).toLocaleDateString(locale)}`}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABEL[e.status]} color={STATUS_COLOR[e.status]} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtCents(e.totalAmountCents, locale)}
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
