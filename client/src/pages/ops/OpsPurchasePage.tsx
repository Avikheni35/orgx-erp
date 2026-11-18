import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, TextField, Button, Paper,
  Autocomplete, IconButton, Alert, Divider, CircularProgress, Chip,
} from '@mui/material';
import AddIcon               from '@mui/icons-material/Add';
import DeleteOutlineIcon     from '@mui/icons-material/DeleteOutline';
import ShoppingCartIcon      from '@mui/icons-material/ShoppingCart';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { suppliersApi } from '../../api/suppliers';
import { productsApi } from '../../api/products';
import { purchaseOrdersApi, type POLineItemInput } from '../../api/purchaseOrders';
import { useTranslation } from 'react-i18next';

const MONO         = '"JetBrains Mono", "Courier New", monospace';
const ACCENT       = '#e8801a';
const ACCENT_HOVER = '#c96a12';
const ACCENT_MUTED = 'rgba(232, 128, 26, 0.1)';

function fmtCents(cents: number, locale = 'de-DE') {
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
}

interface DraftLine {
  productId?:     string;
  description:    string;
  unit:           string;
  quantity:       number;
  unitPriceCents: number;
  vatRate:        number;
}

function emptyLine(): DraftLine {
  return { description: '', unit: 'Stk', quantity: 1, unitPriceCents: 0, vatRate: 19 };
}

export default function OpsPurchasePage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const qc       = useQueryClient();

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [lines,      setLines]      = useState<DraftLine[]>([emptyLine()]);
  const [notes,      setNotes]      = useState('');
  const [done,       setDone]       = useState(false);
  const [errMsg,     setErrMsg]     = useState('');

  const { data: supplierData } = useQuery({
    queryKey: ['ops-suppliers'],
    queryFn:  () => suppliersApi.list(),
  });
  const suppliers = supplierData?.data?.suppliers ?? [];

  const { data: productsRaw } = useQuery({
    queryKey: ['ops-products'],
    queryFn:  () => productsApi.list({ active: 'true' }),
  });
  const products = (productsRaw ?? []).filter(p => !p.hasVariants);

  function setLine(idx: number, patch: Partial<DraftLine>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  const totalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const hasLines   = lines.some(l => l.description.trim() || l.productId);

  const mutation = useMutation({
    mutationFn: () => {
      const lineItems: POLineItemInput[] = lines
        .filter(l => l.description.trim() || l.productId)
        .map(l => ({
          productId:      l.productId,
          description:    l.description,
          unit:           l.unit,
          quantity:       l.quantity,
          unitPriceCents: l.unitPriceCents,
          vatRate:        l.vatRate,
        }));
      return purchaseOrdersApi.create({
        supplierId:      supplierId ?? '',
        orderDate:       new Date().toISOString().slice(0, 10),
        lineItems,
        deliveryAddress: '',
        notes,
        internalNotes:   '',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setDone(true);
      setErrMsg('');
    },
    onError: () => setErrMsg(de ? 'Fehler beim Speichern.' : 'Failed to save order.'),
  });

  /* ── success screen ───────────────────────────────────────────────────────── */
  if (done) {
    return (
      <Box sx={{ maxWidth: 400, mx: 'auto', textAlign: 'center', pt: 5, pb: 3 }}>
        <Box sx={{
          width: 100, height: 100, borderRadius: '50%', mx: 'auto', mb: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'success.main',
          boxShadow: '0 0 0 18px rgba(76,175,80,0.12)',
        }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 52, color: '#fff' }} />
        </Box>
        <Typography variant="h5" fontWeight={800} gutterBottom letterSpacing={-0.5}>
          {de ? 'Bestellung gespeichert' : 'Order saved'}
        </Typography>
        <Typography color="text.secondary" mb={4} sx={{ px: 2 }}>
          {de ? 'Als Entwurf in der Einkaufsverwaltung hinterlegt.' : 'Saved as draft in purchase orders.'}
        </Typography>
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={() => { setLines([emptyLine()]); setSupplierId(null); setNotes(''); setDone(false); }}
          sx={{
            py: 2, fontSize: 15, fontWeight: 800, borderRadius: 2,
            bgcolor: ACCENT, '&:hover': { bgcolor: ACCENT_HOVER },
            boxShadow: `0 4px 20px ${ACCENT}50`,
          }}
        >
          {de ? 'Neue Bestellung' : 'New order'}
        </Button>
      </Box>
    );
  }

  /* ── main view ────────────────────────────────────────────────────────────── */
  return (
    <Box sx={{ maxWidth: 680, mx: 'auto' }}>
      {errMsg && <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }} onClose={() => setErrMsg('')}>{errMsg}</Alert>}

      {/* supplier */}
      <Paper elevation={2} sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
        <Autocomplete
          options={suppliers}
          getOptionLabel={s => s.companyName}
          onChange={(_, s) => setSupplierId(s?._id ?? null)}
          renderInput={params => (
            <TextField
              {...params}
              label={de ? 'Lieferant (optional)' : 'Supplier (optional)'}
              size="medium"
              autoFocus
              sx={{ '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}
            />
          )}
        />
      </Paper>

      {/* line items */}
      <Paper elevation={2} sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: 600, color: 'text.secondary' }}>
            {de ? 'Positionen' : 'Line items'}
          </Typography>
        </Box>

        {lines.map((line, idx) => (
          <Box key={idx}>
            {idx > 0 && <Divider />}
            <Box sx={{ p: 2 }}>
              {/* product search row */}
              <Stack direction="row" gap={1} alignItems="center" mb={1.5}>
                <Autocomplete
                  options={products}
                  getOptionLabel={p => p.name}
                  onChange={(_, p) => p && setLine(idx, {
                    productId:      p._id,
                    description:    p.name,
                    unit:           p.unit || 'Stk',
                    unitPriceCents: p.costPriceCents,
                    vatRate:        p.vatRate,
                  })}
                  renderInput={params => (
                    <TextField {...params} label={de ? 'Produkt suchen' : 'Search product'} size="small" />
                  )}
                  sx={{ flex: 1 }}
                />
                <IconButton
                  color="error"
                  onClick={() => setLines(l => l.filter((_, i) => i !== idx))}
                  disabled={lines.length === 1}
                  sx={{ flexShrink: 0, '&:hover': { bgcolor: 'error.50' } }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>

              {/* detail row */}
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                <TextField
                  size="small"
                  label={de ? 'Bezeichnung' : 'Description'}
                  value={line.description}
                  onChange={e => setLine(idx, { description: e.target.value })}
                  sx={{ flex: 2 }}
                />
                <TextField
                  size="small"
                  label={de ? 'Menge' : 'Qty'}
                  type="number"
                  value={line.quantity}
                  inputProps={{ min: 1 }}
                  onChange={e => setLine(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                  sx={{ width: 80 }}
                />
                <TextField
                  size="small"
                  label={de ? 'EK (€)' : 'Cost (€)'}
                  type="number"
                  value={(line.unitPriceCents / 100).toFixed(2)}
                  onChange={e => setLine(idx, { unitPriceCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                  inputProps={{ style: { fontFamily: MONO } }}
                  sx={{ width: 110 }}
                />
                <TextField
                  size="small"
                  label="MwSt %"
                  type="number"
                  value={line.vatRate}
                  onChange={e => setLine(idx, { vatRate: Number(e.target.value) })}
                  sx={{ width: 76 }}
                />
              </Stack>

              {line.unitPriceCents > 0 && (
                <Stack direction="row" alignItems="center" gap={0.75} mt={1}>
                  <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    = {fmtCents(line.unitPriceCents * line.quantity, locale)}
                  </Typography>
                  <Chip size="small" label={`${line.vatRate}% MwSt`} sx={{ height: 16, fontSize: 10 }} />
                </Stack>
              )}
            </Box>
          </Box>
        ))}

        <Divider />
        <Box sx={{ px: 2, py: 1.25 }}>
          <Button
            startIcon={<AddIcon />}
            size="small"
            onClick={() => setLines(l => [...l, emptyLine()])}
            sx={{ color: ACCENT, fontWeight: 600, '&:hover': { bgcolor: ACCENT_MUTED } }}
          >
            {de ? 'Position hinzufügen' : 'Add line'}
          </Button>
        </Box>
      </Paper>

      <Paper elevation={1} sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
        <TextField
          fullWidth
          size="small"
          label={de ? 'Notizen' : 'Notes'}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          multiline
          rows={2}
          sx={{ '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}
        />
      </Paper>

      {/* sticky submit strip */}
      <Box sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.default', pt: 1, pb: 0.5 }}>
        <Paper
          elevation={6}
          sx={{
            borderRadius: 2, px: 2.5, py: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10, fontWeight: 600, color: 'text.secondary', mb: 0.25 }}>
              {de ? 'Gesamt (netto)' : 'Total (net)'}
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontWeight: 800, fontSize: 24, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: ACCENT }}>
              {fmtCents(totalCents, locale)}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            startIcon={
              mutation.isPending
                ? <CircularProgress size={18} color="inherit" />
                : <ShoppingCartIcon />
            }
            disabled={mutation.isPending || !hasLines}
            onClick={() => mutation.mutate()}
            sx={{
              px: 3.5, py: 1.75, fontWeight: 700, fontSize: 14, borderRadius: 2,
              bgcolor: ACCENT, '&:hover': { bgcolor: ACCENT_HOVER },
              boxShadow: `0 4px 20px ${ACCENT}45`,
              '&:disabled': { boxShadow: 'none' },
            }}
          >
            {de ? 'Speichern' : 'Save order'}
          </Button>
        </Paper>
      </Box>
    </Box>
  );
}
