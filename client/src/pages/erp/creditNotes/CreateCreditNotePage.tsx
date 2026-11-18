import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField, Select,
  MenuItem, FormControl, InputLabel, Grid, Alert, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell, IconButton, Autocomplete,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { creditNotesApi, type CreateCreditNotePayload } from '../../../api/creditNotes';
import { customersApi } from '../../../api/customers';
import apiClient from '../../../api/client';

type LineForm = {
  description:    string;
  unit:           string;
  quantity:       string;
  unitPriceCents: string;
  vatRate:        number;
};

const emptyLine = (): LineForm => ({
  description: '', unit: 'Stück', quantity: '1', unitPriceCents: '', vatRate: 19,
});

function calcLine(l: LineForm) {
  const qty   = parseFloat(l.quantity) || 0;
  const price = Math.round(parseFloat(l.unitPriceCents.replace(',', '.')) * 100 || 0);
  const net   = Math.round(qty * price);
  const vat   = Math.round(net * l.vatRate / 100);
  return { quantity: qty, unitPriceCents: price, totalNetCents: net, totalVatCents: vat, totalGrossCents: net + vat };
}

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function CreateCreditNotePage() {
  const navigate     = useNavigate();
  const [params]     = useSearchParams();
  const qc           = useQueryClient();
  const { i18n }     = useTranslation();
  const de           = i18n.language === 'de';
  const locale       = de ? 'de-DE' : 'en-GB';

  const prefillInvoiceId = params.get('invoiceId') ?? '';

  const [customerId,     setCustomerId]     = useState('');
  const [invoiceId,      setInvoiceId]      = useState(prefillInvoiceId);
  const [creditNoteDate, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [reason,         setReason]         = useState('');
  const [notes,          setNotes]          = useState('');
  const [lines,          setLines]          = useState<LineForm[]>([emptyLine()]);
  const [error,          setError]          = useState('');

  const { data: custData } = useQuery({
    queryKey: ['customers', 'active'],
    queryFn:  () => customersApi.list({ active: true }),
  });
  const customers = custData?.data?.customers ?? [];

  // If invoiceId provided, load invoice to prefill
  const { data: invData } = useQuery({
    queryKey: ['sales-invoice', invoiceId],
    queryFn:  () => apiClient.get<{ _id: string; customerId: string; lineItems: LineForm[] }>(`/sales-invoices/${invoiceId}`),
    enabled:  !!invoiceId,
    select:   res => res.data,
  });

  // Prefill from invoice when loaded
  const [prefilled, setPrefilled] = useState(false);
  if (invData && !prefilled) {
    setPrefilled(true);
    setCustomerId(String(invData.customerId));
    // Copy line items from invoice
    const invLines = (invData as unknown as { lineItems: { description: string; unit: string; quantity: number; unitPriceCents: number; vatRate: number }[] }).lineItems;
    if (invLines?.length) {
      setLines(invLines.map(l => ({
        description: l.description,
        unit: l.unit,
        quantity: String(l.quantity),
        unitPriceCents: String(l.unitPriceCents / 100),
        vatRate: l.vatRate,
      })));
    }
  }

  const totals = lines.reduce((acc, l) => {
    const c = calcLine(l);
    return { net: acc.net + c.totalNetCents, vat: acc.vat + c.totalVatCents, gross: acc.gross + c.totalGrossCents };
  }, { net: 0, vat: 0, gross: 0 });

  const setLine = <K extends keyof LineForm>(i: number, k: K, v: LineForm[K]) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CreateCreditNotePayload = {
        customerId, invoiceId: invoiceId || undefined, creditNoteDate, reason, notes,
        lineItems: lines.map(l => {
          const c = calcLine(l);
          return { description: l.description, unit: l.unit, quantity: c.quantity, unitPriceCents: c.unitPriceCents, vatRate: l.vatRate };
        }),
      };
      return creditNotesApi.create(payload);
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      navigate(`/erp/verkauf/gutschriften/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function validate() {
    if (!customerId)        { setError(de ? 'Kunde auswählen.' : 'Select a customer.'); return false; }
    if (lines.length === 0) { setError(de ? 'Mind. eine Position.' : 'Add at least one line.'); return false; }
    return true;
  }

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/verkauf/gutschriften')} size="small">
          {de ? 'Gutschriften' : 'Credit Notes'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>
          {de ? 'Neue Gutschrift' : 'New credit note'}
        </Typography>
        <Button variant="contained"
          startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          disabled={mutation.isPending} onClick={() => { if (validate()) mutation.mutate(); }}>
          {de ? 'Speichern' : 'Save'}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={3}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Gutschriftdaten' : 'Credit note details'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  size="small"
                  options={customers}
                  getOptionLabel={c => c.companyName}
                  value={customers.find(c => c._id === customerId) ?? null}
                  onChange={(_, v) => setCustomerId(v?._id ?? '')}
                  renderInput={params => <TextField {...params} label={`${de ? 'Kunde' : 'Customer'} *`} />}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField label={de ? 'Bezug auf Rechnungs-Nr.' : 'Original invoice no.'} size="small" fullWidth
                  value={invoiceId} onChange={e => setInvoiceId(e.target.value)}
                  inputProps={{ style: { fontFamily: 'monospace' } }}
                  placeholder="RE-2025-00001" />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField label={`${de ? 'Gutschriftdatum' : 'Credit note date'} *`} type="date" size="small" fullWidth
                  value={creditNoteDate} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12}>
                <TextField label={de ? 'Grund der Gutschrift' : 'Reason for credit note'} size="small" fullWidth
                  value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={de ? 'z.B. Rückgabe, Preiskorrektur, Kulanz' : 'e.g. return, price correction, goodwill'} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={1.5}>{de ? 'Positionen' : 'Line items'}</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 220 }}>{de ? 'Beschreibung' : 'Description'}</TableCell>
                    <TableCell sx={{ width: 90 }}>{de ? 'Einheit' : 'Unit'}</TableCell>
                    <TableCell sx={{ width: 90 }}>{de ? 'Menge' : 'Qty'}</TableCell>
                    <TableCell sx={{ width: 130 }}>{de ? 'Einzelpreis (€)' : 'Unit price (€)'}</TableCell>
                    <TableCell sx={{ width: 80 }}>{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>{de ? 'Gesamt (netto)' : 'Total (net)'}</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line, i) => {
                    const c = calcLine(line);
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <TextField size="small" fullWidth value={line.description}
                            onChange={e => setLine(i, 'description', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" sx={{ width: 80 }} value={line.unit}
                            onChange={e => setLine(i, 'unit', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" sx={{ width: 80 }} value={line.quantity}
                            onChange={e => setLine(i, 'quantity', e.target.value)}
                            inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" sx={{ width: 120 }} value={line.unitPriceCents}
                            onChange={e => setLine(i, 'unitPriceCents', e.target.value)}
                            inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right', fontFamily: 'monospace' } }}
                            placeholder="0,00" />
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" sx={{ width: 70 }}>
                            <Select value={line.vatRate} onChange={e => setLine(i, 'vatRate', Number(e.target.value))}>
                              <MenuItem value={0}>0%</MenuItem>
                              <MenuItem value={7}>7%</MenuItem>
                              <MenuItem value={19}>19%</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'error.main' }}>
                          −{fmtCents(c.totalNetCents, locale)}
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" disabled={lines.length <= 1}
                            onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 700, pr: 2 }}>{de ? 'Gesamt (brutto)' : 'Total (gross)'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'error.main' }}>
                      −{fmtCents(totals.gross, locale)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
            <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => setLines(ls => [...ls, emptyLine()])}>
              {de ? 'Position hinzufügen' : 'Add line'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <TextField label={de ? 'Notizen' : 'Notes'} size="small" fullWidth multiline rows={2}
              value={notes} onChange={e => setNotes(e.target.value)} />
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
