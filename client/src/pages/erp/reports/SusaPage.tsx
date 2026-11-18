import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Stack, Select, MenuItem, FormControl, InputLabel, CircularProgress, Alert,
  Tooltip, Chip, Button,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { reportsApi, type SusaRow } from '../../../api/reports';
import { fiscalYearsApi, type FiscalYear } from '../../../api/fiscalYears';

function fmt(n: number, locale: string) {
  return n === 0 ? '—' : n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function exportCsv(rows: SusaRow[], totals: { debit: number; credit: number; debitBalance: number; creditBalance: number }) {
  const sep = ';';
  const lines = [
    ['Kontonummer', 'Kontoname', 'Typ', 'Soll', 'Haben', 'Saldo Soll', 'Saldo Haben'].join(sep),
    ...rows.map(r => [r.number, r.name, r.type, r.debit, r.credit, r.debitBalance, r.creditBalance].join(sep)),
    ['SUMME', '', '', totals.debit, totals.credit, totals.debitBalance, totals.creditBalance].join(sep),
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `SUSA_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SusaPage() {
  const { i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [fyId, setFyId] = useState('');

  const { data: fyData } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn:  () => fiscalYearsApi.list(),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-susa', fyId],
    queryFn:  () => reportsApi.susa(fyId ? { fyId } : undefined),
  });

  const fys    = fyData?.data?.fiscalYears ?? [];
  const rows   = data?.data?.rows ?? [];
  const totals = data?.data?.totals;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Summen- und Saldenliste' : 'Trial Balance'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Gebuchte Buchungssätze nach Konto aggregiert' : 'Posted journal entries aggregated by account'}
          </Typography>
        </Box>

        <Stack direction="row" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{de ? 'Geschäftsjahr' : 'Fiscal year'}</InputLabel>
            <Select
              value={fyId}
              label={de ? 'Geschäftsjahr' : 'Fiscal year'}
              onChange={e => setFyId(e.target.value)}
            >
              <MenuItem value="">{de ? 'Alle Zeiträume' : 'All periods'}</MenuItem>
              {fys.map(fy => (
                <MenuItem key={fy._id} value={fy._id}>{fy.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {rows.length > 0 && totals && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => exportCsv(rows, totals)}
            >
              CSV
            </Button>
          )}
        </Stack>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden der Daten.' : 'Failed to load report.'}</Alert>}

      {!isLoading && !isError && (
        <Card>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, whiteSpace: 'nowrap' } }}>
                  <TableCell>{de ? 'Konto' : 'Account'}</TableCell>
                  <TableCell>{de ? 'Bezeichnung' : 'Name'}</TableCell>
                  <TableCell>{de ? 'Typ' : 'Type'}</TableCell>
                  <TableCell align="right">{de ? 'Umsatz Soll' : 'Debit turnover'}</TableCell>
                  <TableCell align="right">{de ? 'Umsatz Haben' : 'Credit turnover'}</TableCell>
                  <TableCell align="right">{de ? 'Saldo Soll' : 'Debit balance'}</TableCell>
                  <TableCell align="right">{de ? 'Saldo Haben' : 'Credit balance'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">
                        {de ? 'Keine gebuchten Buchungssätze vorhanden.' : 'No posted journal entries found.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : rows.map(row => (
                  <TableRow key={row.number} hover>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{row.number}</Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={row.name} placement="top-start">
                        <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>{row.name}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {row.type && <Chip size="small" variant="outlined" label={row.type} sx={{ fontSize: 10 }} />}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                      {fmt(row.debit, locale)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                      {fmt(row.credit, locale)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {row.debitBalance > 0
                        ? <Typography variant="body2" fontWeight={600}>{fmt(row.debitBalance, locale)}</Typography>
                        : <Typography variant="body2" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {row.creditBalance > 0
                        ? <Typography variant="body2" fontWeight={600}>{fmt(row.creditBalance, locale)}</Typography>
                        : <Typography variant="body2" color="text.disabled">—</Typography>}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Totals row */}
                {totals && rows.length > 0 && (
                  <TableRow sx={{ '& td': { borderTop: 2, borderColor: 'divider', fontWeight: 700 } }}>
                    <TableCell colSpan={3}>
                      <Typography variant="body2" fontWeight={700}>{de ? 'Summe' : 'Total'}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(totals.debit, locale)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(totals.credit, locale)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(totals.debitBalance, locale)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(totals.creditBalance, locale)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </Card>
      )}
    </Box>
  );
}
