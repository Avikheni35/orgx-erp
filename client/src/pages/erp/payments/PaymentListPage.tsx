import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Chip, Table, TableHead, TableBody,
  TableRow, TableCell, TablePagination, CircularProgress, Alert,
  Select, MenuItem, FormControl, InputLabel, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { useTranslation } from 'react-i18next';
import { paymentsApi, type Payment } from '../../../api/payments';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function PaymentListPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [direction, setDirection] = useState('');
  const [page, setPage]           = useState(0);
  const [rowsPerPage]             = useState(20);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payments', direction, page],
    queryFn:  () => paymentsApi.list({ direction: direction || undefined, page: page + 1, limit: rowsPerPage } as Parameters<typeof paymentsApi.list>[0]),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      setDeleteTarget(null);
    },
  });

  const payments = data?.data?.payments ?? [];
  const total    = data?.data?.total ?? 0;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Zahlungen' : 'Payments'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Ein- und Ausgang verwalten — bucht automatisch ins Journal' : 'Manage receipts & disbursements — auto-posts to journal'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/zahlungen/new')}>
          {de ? 'Neue Zahlung' : 'New payment'}
        </Button>
      </Stack>

      {/* Filter bar */}
      <Stack direction="row" gap={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{de ? 'Richtung' : 'Direction'}</InputLabel>
          <Select value={direction} label={de ? 'Richtung' : 'Direction'} onChange={e => { setDirection(e.target.value); setPage(0); }}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            <MenuItem value="incoming">{de ? 'Eingang' : 'Incoming'}</MenuItem>
            <MenuItem value="outgoing">{de ? 'Ausgang' : 'Outgoing'}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                  <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                  <TableCell>{de ? 'Richtung' : 'Direction'}</TableCell>
                  <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                  <TableCell>{de ? 'Bankkonto' : 'Bank account'}</TableCell>
                  <TableCell>{de ? 'Zuordnungen' : 'Allocations'}</TableCell>
                  <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                      {de ? 'Keine Zahlungen vorhanden.' : 'No payments found.'}
                    </TableCell>
                  </TableRow>
                )}
                {payments.map(p => (
                  <TableRow
                    key={p._id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/erp/zahlungen/${p._id}`)}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.paymentNumber}</TableCell>
                    <TableCell>{new Date(p.date).toLocaleDateString(locale)}</TableCell>
                    <TableCell>
                      {p.direction === 'incoming' ? (
                        <Chip size="small" icon={<ArrowDownwardIcon />} label={de ? 'Eingang' : 'In'} color="success" variant="outlined" />
                      ) : (
                        <Chip size="small" icon={<ArrowUpwardIcon />} label={de ? 'Ausgang' : 'Out'} color="error" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.description}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {p.bankAccount} {p.bankAccountName && <Typography variant="caption" color="text.secondary">({p.bankAccountName})</Typography>}
                    </TableCell>
                    <TableCell>
                      {p.allocations.length > 0 ? (
                        <Stack direction="row" gap={0.5} flexWrap="wrap">
                          {p.allocations.slice(0, 2).map((a, i) => (
                            <Chip key={i} size="small" label={a.invoiceNumber} variant="outlined" />
                          ))}
                          {p.allocations.length > 2 && (
                            <Chip size="small" label={`+${p.allocations.length - 2}`} />
                          )}
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.disabled">{de ? '—' : '—'}</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                      color: p.direction === 'incoming' ? 'success.main' : 'error.main' }}>
                      {p.direction === 'incoming' ? '+' : '−'}{fmtCents(p.amountCents, locale)}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Tooltip title={de ? 'Stornieren' : 'Void'}>
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(p)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[20]}
            onPageChange={(_, p) => setPage(p)}
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} ${de ? 'von' : 'of'} ${count}`}
          />
        </>
      )}

      {/* Void confirm dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{de ? 'Zahlung stornieren?' : 'Void payment?'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {de
              ? `Zahlung ${deleteTarget?.paymentNumber} wird storniert. Das Buchungsgegenstück wird umgekehrt und betroffene Rechnungen werden wieder als offen markiert.`
              : `Payment ${deleteTarget?.paymentNumber} will be reversed. The journal entry will be reversed and affected invoices will be reopened.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button color="error" variant="contained"
            disabled={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}>
            {de ? 'Stornieren' : 'Void'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
