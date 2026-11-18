import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Table, TableHead, TableBody, TableRow,
  TableCell, CircularProgress, Alert, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { payrollApi, type PayrollStatus } from '../../../api/payroll';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<PayrollStatus, 'default' | 'info' | 'success'> = {
  draft:     'default',
  finalized: 'info',
  posted:    'success',
};

export default function PayrollListPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payrolls'],
    queryFn:  payrollApi.list,
  });
  const payrolls = data?.data?.payrolls ?? [];

  const STATUS_LABEL: Record<PayrollStatus, string> = {
    draft:     de ? 'Entwurf'     : 'Draft',
    finalized: de ? 'Abgeschlossen' : 'Finalized',
    posted:    de ? 'Gebucht'     : 'Posted',
  };

  function formatPeriod(p: { year: number; month: number }, locale: string) {
    return new Date(p.year, p.month - 1, 1).toLocaleString(locale, { month: 'long', year: 'numeric' });
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Lohnabrechnung' : 'Payroll'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Monatliche Lohn- und Gehaltsabrechnungen' : 'Monthly payroll runs'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/lohn/new')}>
          {de ? 'Neue Lohnabrechnung' : 'New payroll run'}
        </Button>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                <TableCell>{de ? 'Abrechnungsmonat' : 'Period'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                <TableCell align="right">{de ? 'Mitarbeiter' : 'Employees'}</TableCell>
                <TableCell align="right">{de ? 'Gesamtbrutto' : 'Total gross'}</TableCell>
                <TableCell align="right">{de ? 'Gesamtnetto' : 'Total net'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payrolls.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Keine Lohnabrechnungen vorhanden.' : 'No payroll runs found.'}
                  </TableCell>
                </TableRow>
              )}
              {payrolls.map(p => (
                <TableRow key={p._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/lohn/${p._id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{p.payrollNumber}</TableCell>
                  <TableCell><Typography variant="body2" fontWeight={600}>{formatPeriod(p, locale)}</Typography></TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABEL[p.status]} color={STATUS_COLOR[p.status]} />
                  </TableCell>
                  <TableCell align="right">{p.entries.length}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(p.totalGrossCents, locale)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(p.totalNetCents, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
