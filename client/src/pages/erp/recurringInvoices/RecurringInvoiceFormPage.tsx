import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, CardContent, TextField, Stack, Grid,
  IconButton, Alert, CircularProgress, Select, MenuItem, FormControl,
  InputLabel, Table, TableHead, TableBody, TableRow, TableCell, Autocomplete,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { recurringInvoicesApi, type RecurringFrequency, type RecurringLineItem } from '../../../api/recurringInvoices';
import { customersApi, type Customer } from '../../../api/customers';

interface LineForm {
  description:    string;
  unit:           string;
  quantity:       string;
  unitPriceCents: string;
  vatRate:        string;
}

const emptyLine = (): LineForm => ({
  description:    '',
  unit:           'Stück',
  quantity:       '1',
  unitPriceCents: '0',
  vatRate:        '19',
});

function calcLine(l: LineForm) {
  const qty   = parseFloat(l.quantity)       || 0;
  const price = parseFloat(l.unitPriceCents) || 0;
  const vat   = parseFloat(l.vatRate)        || 0;
  const net   = Math.round(qty * price);
  const vatAmt= Math.round(net * vat / 100);
  return { totalNetCents: net, totalVatCents: vatAmt, totalGrossCents: net + vatAmt };
}

function fmtCents(n: number) {
  return (n / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export default function RecurringInvoiceFormPage() {
  const { t }        = useTranslation();
  const navigate     = useNavigate();
  const { id }       = useParams<{ id?: string }>();
  const isEdit       = !!id;
  const queryClient  = useQueryClient();

  const [title,           setTitle]           = useState('');
  const [customerId,      setCustomerId]      = useState('');
  const [frequency,       setFrequency]       = useState<RecurringFrequency>('monthly');
  const [dayOfMonth,      setDayOfMonth]      = useState('1');
  const [paymentTermDays, setPaymentTermDays] = useState('14');
  const [startDate,       setStartDate]       = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [notes,  setNotes]  = useState('');
  const [lines,  setLines]  = useState<LineForm[]>([emptyLine()]);
  const [errMsg, setErrMsg] = useState('');

  const { data: existingData, isLoading: loadingExisting } = useQuery({
    queryKey:  ['recurring-invoice', id],
    queryFn:   () => recurringInvoicesApi.get(id!).then(r => r.data),
    enabled:   isEdit,
  });

  const { data: custData } = useQuery({
    queryKey: ['customers-all'],
    queryFn:  () => customersApi.list({ limit: 500 }).then(r => r.data),
  });

  const customers: Customer[] = custData?.customers ?? [];

  useEffect(() => {
    if (!existingData) return;
    setTitle(existingData.title);
    setCustomerId(existingData.customerId);
    setFrequency(existingData.frequency);
    setDayOfMonth(String(existingData.dayOfMonth));
    setPaymentTermDays(String(existingData.paymentTermDays));
    setStartDate(existingData.nextRunDate.slice(0, 10));
    setNotes(existingData.notes ?? '');
    setLines(existingData.lineItems.map(l => ({
      description:    l.description,
      unit:           l.unit,
      quantity:       String(l.quantity),
      unitPriceCents: String(l.unitPriceCents),
      vatRate:        String(l.vatRate),
    })));
  }, [existingData]);

  const saveMut = useMutation({
    mutationFn: (payload: Parameters<typeof recurringInvoicesApi.create>[0]) =>
      isEdit
        ? recurringInvoicesApi.update(id!, payload)
        : recurringInvoicesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
      navigate('/erp/wiederkehrend');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrMsg(msg || t('common.error'));
    },
  });

  function handleLineChange(idx: number, field: keyof LineForm, val: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  }

  function handleSubmit() {
    setErrMsg('');
    if (!title.trim())      { setErrMsg(t('recurring.err.title'));      return; }
    if (!customerId)        { setErrMsg(t('recurring.err.customer'));   return; }
    if (lines.length === 0) { setErrMsg(t('recurring.err.lines'));      return; }

    const lineItems = lines.map(l => ({
      description:    l.description,
      unit:           l.unit,
      quantity:       parseFloat(l.quantity) || 0,
      unitPriceCents: parseFloat(l.unitPriceCents) || 0,
      vatRate:        parseFloat(l.vatRate) || 19,
    }));

    saveMut.mutate({
      title,
      customerId,
      frequency,
      dayOfMonth:      parseInt(dayOfMonth) || 1,
      paymentTermDays: parseInt(paymentTermDays) || 14,
      startDate,
      lineItems,
      notes,
    });
  }

  const totals = lines.reduce((acc, l) => {
    const c = calcLine(l);
    return { net: acc.net + c.totalNetCents, gross: acc.gross + c.totalGrossCents };
  }, { net: 0, gross: 0 });

  if (isEdit && loadingExisting) return <CircularProgress sx={{ m: 4 }} />;

  const selectedCustomer = customers.find(c => c._id === customerId) ?? null;

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Stack direction="row" spacing={2} alignItems="center" mb={3}>
        <IconButton onClick={() => navigate('/erp/wiederkehrend')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700}>
          {isEdit ? t('recurring.editTitle') : t('recurring.newTitle')}
        </Typography>
      </Stack>

      {errMsg && <Alert severity="error" sx={{ mb: 2 }}>{errMsg}</Alert>}

      <Stack spacing={3}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('recurring.section.template')}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label={t('recurring.field.title')}
                  fullWidth size="small"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  options={customers}
                  getOptionLabel={c => `${c.companyName}${c.legalForm ? ' ' + c.legalForm : ''}`}
                  value={selectedCustomer}
                  onChange={(_, v) => setCustomerId(v?._id ?? '')}
                  renderInput={params => (
                    <TextField {...params} label={t('recurring.field.customer')} size="small" fullWidth />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('recurring.field.frequency')}</InputLabel>
                  <Select value={frequency} label={t('recurring.field.frequency')}
                    onChange={e => setFrequency(e.target.value as RecurringFrequency)}>
                    <MenuItem value="weekly">{t('recurring.freq.weekly')}</MenuItem>
                    <MenuItem value="monthly">{t('recurring.freq.monthly')}</MenuItem>
                    <MenuItem value="quarterly">{t('recurring.freq.quarterly')}</MenuItem>
                    <MenuItem value="yearly">{t('recurring.freq.yearly')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label={t('recurring.field.dayOfMonth')}
                  fullWidth size="small" type="number"
                  inputProps={{ min: 1, max: 28 }}
                  value={dayOfMonth}
                  onChange={e => setDayOfMonth(e.target.value)}
                  helperText={t('recurring.field.dayOfMonthHelp')}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label={t('recurring.field.startDate')}
                  fullWidth size="small" type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label={t('recurring.field.paymentTermDays')}
                  fullWidth size="small" type="number"
                  inputProps={{ min: 0 }}
                  value={paymentTermDays}
                  onChange={e => setPaymentTermDays(e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label={t('common.notes')}
                  fullWidth size="small" multiline rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight={600}>{t('recurring.section.lineItems')}</Typography>
              <Button size="small" startIcon={<AddIcon />}
                onClick={() => setLines(prev => [...prev, emptyLine()])}>
                {t('salesInvoices.addLine')}
              </Button>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: '35%' }}>{t('salesInvoices.lineDescription')}</TableCell>
                  <TableCell sx={{ width: '10%' }}>{t('serviceItems.unit')}</TableCell>
                  <TableCell sx={{ width: '10%' }}>{t('salesInvoices.quantity')}</TableCell>
                  <TableCell sx={{ width: '12%' }}>{t('salesInvoices.unitPrice')}</TableCell>
                  <TableCell sx={{ width: '8%' }}>{t('salesInvoices.vatRate')}</TableCell>
                  <TableCell sx={{ width: '12%' }} align="right">{t('salesInvoices.lineGross')}</TableCell>
                  <TableCell sx={{ width: '5%' }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((l, idx) => {
                  const c = calcLine(l);
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <TextField size="small" fullWidth variant="standard"
                          value={l.description}
                          onChange={e => handleLineChange(idx, 'description', e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" fullWidth variant="standard"
                          value={l.unit}
                          onChange={e => handleLineChange(idx, 'unit', e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" fullWidth variant="standard" type="number"
                          inputProps={{ min: 0, step: 0.01 }}
                          value={l.quantity}
                          onChange={e => handleLineChange(idx, 'quantity', e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" fullWidth variant="standard" type="number"
                          inputProps={{ min: 0, step: 1 }}
                          value={l.unitPriceCents}
                          onChange={e => handleLineChange(idx, 'unitPriceCents', e.target.value)}
                          helperText="ct" />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" fullWidth variant="standard" type="number"
                          inputProps={{ min: 0, max: 100, step: 1 }}
                          value={l.vatRate}
                          onChange={e => handleLineChange(idx, 'vatRate', e.target.value)} />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{fmtCents(c.totalGrossCents)}</Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small"
                          onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                          disabled={lines.length <= 1}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Stack direction="row" justifyContent="flex-end" spacing={3} mt={2}>
              <Typography variant="body2" color="text.secondary">
                {t('salesInvoices.netAmount')}: {fmtCents(totals.net)}
              </Typography>
              <Typography variant="subtitle1" fontWeight={700}>
                {t('salesInvoices.grossAmount')}: {fmtCents(totals.gross)}
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={() => navigate('/erp/wiederkehrend')}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={saveMut.isPending}>
            {saveMut.isPending ? <CircularProgress size={20} /> : t('common.save')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
