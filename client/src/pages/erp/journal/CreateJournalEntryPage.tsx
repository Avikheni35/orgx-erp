import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, CardContent, Grid, TextField, Stack,
  Table, TableHead, TableBody, TableRow, TableCell, IconButton, Alert,
  CircularProgress, Tooltip, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTranslation } from 'react-i18next';
import { journalApi } from '../../../api/journal';

interface Line {
  accountNumber: string;
  debit:         string;
  credit:        string;
  description:   string;
  costCenter:    string;
}

const emptyLine = (): Line => ({ accountNumber: '', debit: '', credit: '', description: '', costCenter: '' });

function money(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CreateJournalEntryPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { t }    = useTranslation();

  const [form, setForm] = useState({
    date:        new Date().toISOString().slice(0, 10),
    description: '',
    reference:   '',
  });
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()]);
  const [errMsg, setErrMsg] = useState('');

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  const updateLine = (i: number, k: keyof Line, v: string) =>
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const addLine    = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (i: number) => {
    if (lines.length <= 2) return;
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  };

  const buildPayload = () => ({
    ...form,
    lines: lines.map((l) => ({
      accountNumber: l.accountNumber.trim(),
      debit:         parseFloat(l.debit)  || 0,
      credit:        parseFloat(l.credit) || 0,
      description:   l.description.trim(),
      costCenter:    l.costCenter.trim(),
    })),
  });

  const { mutate: saveDraft, isPending: savingDraft } = useMutation({
    mutationFn: () => journalApi.create(buildPayload()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['journal'] });
      navigate(`/erp/buchfuehrung/${res.data._id}`);
    },
    onError: (e: unknown) => setErrMsg((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error')),
  });

  const { mutate: saveAndPost, isPending: posting } = useMutation({
    mutationFn: async () => {
      const res = await journalApi.create(buildPayload());
      await journalApi.post(res.data._id);
      return res.data._id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['journal'] });
      navigate(`/erp/buchfuehrung/${id}`);
    },
    onError: (e: unknown) => setErrMsg((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.error')),
  });

  const validate = (): boolean => {
    if (!form.description.trim()) { setErrMsg(t('journal.textRequired')); return false; }
    if (!form.date) { setErrMsg(t('journal.dateRequired')); return false; }
    for (const l of lines) {
      if (!l.accountNumber.trim()) { setErrMsg(t('journal.allAccountsRequired')); return false; }
    }
    if (!balanced) { setErrMsg(t('journal.balanceError')); return false; }
    setErrMsg('');
    return true;
  };

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/buchfuehrung')} size="small">
          {t('journal.title')}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>{t('journal.createEntry')}</Typography>
        <Button
          variant="outlined"
          startIcon={<SaveIcon />}
          onClick={() => { if (validate()) saveDraft(); }}
          disabled={savingDraft || posting}
        >
          {savingDraft ? <CircularProgress size={18} color="inherit" /> : t('journal.saveAsDraft')}
        </Button>
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          onClick={() => { if (validate()) saveAndPost(); }}
          disabled={savingDraft || posting || !balanced}
        >
          {posting ? <CircularProgress size={18} color="inherit" /> : t('journal.postEntry')}
        </Button>
      </Stack>

      {errMsg && <Alert severity="error" sx={{ mb: 2 }}>{errMsg}</Alert>}

      {/* Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" mb={1.5}>{t('journal.documentHeader')}</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={3}>
              <TextField
                label={`${t('journal.postingDate')} *`}
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                fullWidth size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={`${t('journal.postingText')} *`}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                fullWidth size="small"
                placeholder="z.B. Kauf Büromaterial Rechnr. R-2025-001"
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label={t('journal.referenceNo')}
                value={form.reference}
                onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
                fullWidth size="small"
                placeholder="z.B. R-2025-001"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2, pb: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle2" color="text.secondary">{t('journal.journalLines')}</Typography>
            <Tooltip title={t('journal.minLines')}>
              <InfoOutlinedIcon fontSize="small" color="action" />
            </Tooltip>
          </Stack>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell sx={{ width: 130 }}>{t('journal.accountNumber')}</TableCell>
              <TableCell>{t('journal.lineDescription')}</TableCell>
              <TableCell sx={{ width: 90 }}>KST</TableCell>
              <TableCell align="right" sx={{ width: 140 }}>{t('common.debit')} (€)</TableCell>
              <TableCell align="right" sx={{ width: 140 }}>{t('common.credit')} (€)</TableCell>
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line, i) => (
              <TableRow key={i}>
                <TableCell>
                  <TextField
                    value={line.accountNumber}
                    onChange={(e) => updateLine(i, 'accountNumber', e.target.value)}
                    size="small"
                    placeholder="z.B. 4400"
                    sx={{ width: 120 }}
                    inputProps={{ style: { fontFamily: 'monospace' } }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    value={line.description}
                    onChange={(e) => updateLine(i, 'description', e.target.value)}
                    size="small"
                    placeholder={t('common.optional')}
                    fullWidth
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    value={line.costCenter}
                    onChange={(e) => updateLine(i, 'costCenter', e.target.value)}
                    size="small"
                    placeholder="100"
                    sx={{ width: 80 }}
                    inputProps={{ style: { fontFamily: 'monospace' } }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    value={line.debit}
                    onChange={(e) => updateLine(i, 'debit', e.target.value)}
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right', fontFamily: 'monospace' } }}
                    sx={{ width: 130 }}
                    placeholder="0,00"
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    value={line.credit}
                    onChange={(e) => updateLine(i, 'credit', e.target.value)}
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right', fontFamily: 'monospace' } }}
                    sx={{ width: 130 }}
                    placeholder="0,00"
                  />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => removeLine(i)} disabled={lines.length <= 2}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}

            {/* Totals row */}
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell colSpan={3}>
                <Button size="small" startIcon={<AddIcon />} onClick={addLine}>{t('journal.addLine')}</Button>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontFamily="monospace" fontWeight={700}>{money(totalDebit)}</Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontFamily="monospace" fontWeight={700}>{money(totalCredit)}</Typography>
              </TableCell>
              <TableCell>
                <Chip
                  label={balanced ? t('journal.balanced') : t('journal.difference', { amount: money(Math.abs(totalDebit - totalCredit)) })}
                  color={balanced ? 'success' : 'error'}
                  size="small"
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">{t('journal.gobdNote')}</Typography>
      </Box>
    </Box>
  );
}
