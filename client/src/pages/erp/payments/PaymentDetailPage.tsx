import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip,
  CircularProgress, Alert, Divider, Table, TableHead, TableBody,
  TableRow, TableCell,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useTranslation } from 'react-i18next';
import { paymentsApi } from '../../../api/payments';

interface JournalLine {
  accountNumber: string;
  accountName:   string;
  debit:         number;
  credit:        number;
}

interface JournalEntry {
  entryNumber: string;
  date:        string;
  status:      string;
  totalDebit:  number;
  totalCredit: number;
  lines:       JournalLine[];
}

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtEur(n: number, locale: string) {
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function PaymentDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payment', id],
    queryFn:  () => paymentsApi.get(id!),
    enabled:  !!id,
  });

  const payment = data?.data?.payment;
  const entry   = data?.data?.journalEntry as JournalEntry | null;

  return (
    <Box maxWidth={860}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/zahlungen')}>
          {de ? 'Zahlungen' : 'Payments'}
        </Button>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Zahlung nicht gefunden.' : 'Payment not found.'}</Alert>}

      {!isLoading && !isError && payment && (
        <Stack gap={3}>
          {/* Header */}
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="overline" color="text.secondary">{de ? 'Zahlung' : 'Payment'}</Typography>
                  <Typography variant="h5" fontWeight={700} fontFamily="monospace">{payment.paymentNumber}</Typography>
                  <Typography variant="body2" color="text.secondary" mt={0.5}>{payment.description}</Typography>
                </Box>
                <Stack alignItems="flex-end" gap={1}>
                  {payment.direction === 'incoming' ? (
                    <Chip icon={<ArrowDownwardIcon />} label={de ? 'Geldeingang' : 'Incoming'} color="success" />
                  ) : (
                    <Chip icon={<ArrowUpwardIcon />}   label={de ? 'Geldausgang' : 'Outgoing'} color="error" />
                  )}
                  <Typography variant="h5" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums' }}
                    color={payment.direction === 'incoming' ? 'success.main' : 'error.main'}>
                    {payment.direction === 'incoming' ? '+' : '−'}{fmtCents(payment.amountCents, locale)}
                  </Typography>
                </Stack>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Stack direction={{ xs: 'column', sm: 'row' }} gap={3}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{de ? 'Datum' : 'Date'}</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {new Date(payment.date).toLocaleDateString(locale)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{de ? 'Bankkonto' : 'Bank account'}</Typography>
                  <Typography variant="body2" fontWeight={500} fontFamily="monospace">
                    {payment.bankAccount} {payment.bankAccountName && `– ${payment.bankAccountName}`}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{de ? 'Erstellt' : 'Created'}</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {new Date(payment.createdAt).toLocaleString(locale)}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Allocations */}
          {payment.allocations.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                  {de ? 'Zugeordnete Rechnungen' : 'Allocated invoices'}
                </Typography>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{de ? 'Typ' : 'Type'}</TableCell>
                        <TableCell>{de ? 'Rechnung' : 'Invoice'}</TableCell>
                        <TableCell align="right">{de ? 'Zugeordnet' : 'Allocated'}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {payment.allocations.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Chip size="small" variant="outlined"
                              label={a.invoiceType === 'SalesInvoice' ? (de ? 'AR' : 'AR') : (de ? 'AP' : 'AP')}
                              color={a.invoiceType === 'SalesInvoice' ? 'primary' : 'secondary'}
                            />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{a.invoiceNumber}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {fmtCents(a.amountCents, locale)}
                          </TableCell>
                          <TableCell>
                            <RouterLink
                              to={a.invoiceType === 'SalesInvoice'
                                ? `/erp/verkauf/rechnungen/${a.invoiceId}`
                                : `/erp/einkauf/eingangsrechnungen/${a.invoiceId}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <OpenInNewIcon fontSize="small" />
                            </RouterLink>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Journal entry */}
          {entry && (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {de ? 'Buchungssatz' : 'Journal entry'}
                  </Typography>
                  <Chip size="small" label={entry.entryNumber} sx={{ fontFamily: 'monospace' }} />
                </Stack>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{de ? 'Konto' : 'Account'}</TableCell>
                        <TableCell align="right">{de ? 'Soll' : 'Debit'}</TableCell>
                        <TableCell align="right">{de ? 'Haben' : 'Credit'}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entry.lines.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Typography variant="caption" fontFamily="monospace" color="text.disabled" mr={0.5}>{l.accountNumber}</Typography>
                            {l.accountName}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: l.debit > 0 ? 'inherit' : 'text.disabled' }}>
                            {l.debit > 0 ? fmtEur(l.debit, locale) : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: l.credit > 0 ? 'inherit' : 'text.disabled' }}>
                            {l.credit > 0 ? fmtEur(l.credit, locale) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </CardContent>
            </Card>
          )}
        </Stack>
      )}
    </Box>
  );
}
