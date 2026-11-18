import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  Box, Typography, Card, CardContent, Table, TableHead, TableBody,
  TableRow, TableCell, Divider, Chip, CircularProgress, Alert, Stack,
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';

interface LineItem {
  itemName?: string;
  description?: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  totalNetCents: number;
  totalGrossCents: number;
}

interface PublicInvoice {
  _id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  customerSnapshot: { companyName: string; address?: { street: string; city: string; zip: string; country: string } };
  lineItems: LineItem[];
  totalNetCents: number;
  totalVatCents: number;
  totalGrossCents: number;
  paidCents: number;
  notes?: string;
}

interface PublicInvoiceResponse {
  invoice: PublicInvoice;
  company: { name: string; address: Record<string, string>; vatId: string };
}

function money(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', sent: 'Ausstehend', paid: 'Bezahlt', cancelled: 'Storniert',
};
const STATUS_COLOR: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  draft: 'default', sent: 'warning', paid: 'success', cancelled: 'error',
};

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async () => {
      const res = await axios.get<PublicInvoiceResponse>(`/api/public/invoice/${token}`);
      return res.data;
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center" px={3}>
        <Alert severity="error" sx={{ maxWidth: 480 }}>
          Dieser Link ist ungültig oder abgelaufen. Bitte wenden Sie sich an Ihren Ansprechpartner.
        </Alert>
      </Box>
    );
  }

  const { invoice, company } = data!;
  const overdue = invoice.status === 'sent' && new Date(invoice.dueDate) < new Date();
  const remaining = invoice.totalGrossCents - invoice.paidCents;

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', py: 6, px: 3 }}>
      <Box maxWidth={760} mx="auto">
        {/* Header */}
        <Stack direction="row" alignItems="center" gap={2} mb={4}>
          <ReceiptIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{company.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {[company.address?.street, `${company.address?.zip ?? ''} ${company.address?.city ?? ''}`.trim()].filter(Boolean).join(', ')}
              {company.vatId && ` · USt-IdNr. ${company.vatId}`}
            </Typography>
          </Box>
        </Stack>

        <Card>
          <CardContent>
            {/* Invoice meta */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3} flexWrap="wrap" gap={2}>
              <Box>
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  Rechnung {invoice.invoiceNumber}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  An: <strong>{invoice.customerSnapshot.companyName}</strong>
                </Typography>
                {invoice.customerSnapshot.address && (
                  <Typography variant="body2" color="text.secondary">
                    {invoice.customerSnapshot.address.street}, {invoice.customerSnapshot.address.zip} {invoice.customerSnapshot.address.city}
                  </Typography>
                )}
              </Box>
              <Box textAlign={{ xs: 'left', sm: 'right' }}>
                <Chip
                  label={overdue ? 'Überfällig' : STATUS_LABEL[invoice.status] ?? invoice.status}
                  color={overdue ? 'error' : STATUS_COLOR[invoice.status] ?? 'default'}
                  sx={{ mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary">
                  Rechnungsdatum: {fmtDate(invoice.invoiceDate)}
                </Typography>
                <Typography variant="body2" color={overdue ? 'error.main' : 'text.secondary'}>
                  Fälligkeitsdatum: {fmtDate(invoice.dueDate)}
                </Typography>
              </Box>
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {/* Line items */}
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Beschreibung</TableCell>
                  <TableCell align="right">Menge</TableCell>
                  <TableCell align="right">Einzelpreis (netto)</TableCell>
                  <TableCell align="right">MwSt.</TableCell>
                  <TableCell align="right">Gesamt (brutto)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoice.lineItems.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{item.itemName || item.description}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {item.quantity.toLocaleString('de-DE')}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {money(item.unitPriceCents)}
                    </TableCell>
                    <TableCell align="right">{item.vatRate} %</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {money(item.totalGrossCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Divider sx={{ mb: 2 }} />

            {/* Totals */}
            <Box maxWidth={320} ml="auto">
              <Stack direction="row" justifyContent="space-between" mb={0.5}>
                <Typography variant="body2" color="text.secondary">Nettobetrag</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(invoice.totalNetCents)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between" mb={0.5}>
                <Typography variant="body2" color="text.secondary">MwSt.</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(invoice.totalVatCents)}</Typography>
              </Stack>
              <Divider sx={{ my: 1 }} />
              <Stack direction="row" justifyContent="space-between" mb={0.5}>
                <Typography variant="body1" fontWeight={700}>Gesamtbetrag</Typography>
                <Typography variant="body1" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(invoice.totalGrossCents)}</Typography>
              </Stack>
              {invoice.paidCents > 0 && (
                <>
                  <Stack direction="row" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" color="success.main">Bereits bezahlt</Typography>
                    <Typography variant="body2" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>−{money(invoice.paidCents)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body1" fontWeight={700} color={remaining > 0 ? 'error.main' : 'success.main'}>Noch offen</Typography>
                    <Typography variant="body1" fontWeight={700} color={remaining > 0 ? 'error.main' : 'success.main'} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {money(remaining)}
                    </Typography>
                  </Stack>
                </>
              )}
            </Box>

            {invoice.notes && (
              <Box mt={3}>
                <Typography variant="body2" color="text.secondary" fontStyle="italic">
                  Hinweis: {invoice.notes}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
