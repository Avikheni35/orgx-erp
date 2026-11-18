import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField, Select,
  MenuItem, FormControl, Grid, Alert, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell, IconButton, Autocomplete, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { purchaseOrdersApi, type POLineItemInput, type CreatePOPayload } from '../../../api/purchaseOrders';
import { suppliersApi } from '../../../api/suppliers';
import { productsApi, type Product, type ProductVariant } from '../../../api/products';
import { serviceItemsApi } from '../../../api/serviceItems';

interface ItemOption {
  _id:             string;
  name:            string;
  sourceType:      'service' | 'product';
  sku?:            string;
  unit?:           string;
  category?:       string;
  costPriceCents?: number;
  vatRate?:        number;
  hasVariants?:    boolean;
}

interface LineForm {
  sourceType:   'service' | 'product' | 'free';
  serviceItemId: string;
  productId:    string;
  variantId:    string;
  description:  string;
  unit:         string;
  quantityStr:  string;
  unitPriceStr: string;
  vatRate:      number;
}

const emptyLine = (): LineForm => ({
  sourceType: 'free', serviceItemId: '', productId: '', variantId: '',
  description: '', unit: 'Stück', quantityStr: '1', unitPriceStr: '', vatRate: 19,
});

function costPriceEur(cents: number) {
  return cents > 0 ? String((cents / 100).toFixed(2)) : '';
}

function lineFromService(item: import('../../../api/serviceItems').ServiceItem, prev?: LineForm): LineForm {
  return {
    sourceType: 'service', serviceItemId: item._id, productId: '', variantId: '',
    description:  prev?.description  || item.name,
    unit:         prev?.unit         || item.unit || 'Stück',
    quantityStr:  prev?.quantityStr  || '1',
    unitPriceStr: costPriceEur(item.costPriceCents > 0 ? item.costPriceCents : item.defaultUnitPriceCents),
    vatRate:      item.vatRate ?? 19,
  };
}

function lineFromProduct(product: Product, prev?: LineForm): LineForm {
  const price = product.costPriceCents > 0 ? product.costPriceCents : product.defaultUnitPriceCents;
  return {
    sourceType: 'product', serviceItemId: '', productId: product._id, variantId: '',
    description:  prev?.description  || product.name,
    unit:         prev?.unit         || product.unit || 'Stück',
    quantityStr:  prev?.quantityStr  || '1',
    unitPriceStr: costPriceEur(price),
    vatRate:      product.vatRate ?? 19,
  };
}

function lineFromVariant(product: Product, variant: ProductVariant, prev?: LineForm): LineForm {
  const price = variant.costPriceCents > 0
    ? variant.costPriceCents
    : product.costPriceCents > 0 ? product.costPriceCents : product.defaultUnitPriceCents;
  const attrs  = Object.values(variant.attributes ?? {}).join(' / ');
  return {
    sourceType: 'product', serviceItemId: '', productId: product._id, variantId: variant._id,
    description:  prev?.description  || `${product.name}${attrs ? ' – ' + attrs : ''}`,
    unit:         prev?.unit         || product.unit || 'Stück',
    quantityStr:  prev?.quantityStr  || '1',
    unitPriceStr: costPriceEur(price),
    vatRate:      product.vatRate ?? 19,
  };
}

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function CreatePurchaseOrderPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [supplierId,      setSupplierId]      = useState('');
  const [orderDate,       setOrderDate]       = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate,    setDeliveryDate]    = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes,           setNotes]           = useState('');
  const [internalNotes,   setInternalNotes]   = useState('');
  const [lines,           setLines]           = useState<LineForm[]>([emptyLine()]);
  const [error,           setError]           = useState('');
  const [variantDialog,   setVariantDialog]   = useState<{ product: Product; lineIndex: number } | null>(null);

  const { data: suppData } = useQuery({ queryKey: ['suppliers'], queryFn: () => suppliersApi.list() });
  const suppliers = suppData?.data?.suppliers ?? [];

  const { data: serviceItemsData } = useQuery({
    queryKey: ['service-items-active'],
    queryFn:  () => serviceItemsApi.list(true),
  });
  const serviceItems = serviceItemsData?.data?.items ?? [];

  const { data: productsData } = useQuery({
    queryKey: ['products-active'],
    queryFn:  () => productsApi.list({ active: 'true' }),
  });
  const products = productsData ?? [];

  const {
    data: variantData,
    isLoading: variantsLoading,
    isError: variantsError,
  } = useQuery({
    queryKey: ['product-variants', variantDialog?.product._id],
    queryFn: () => productsApi.listVariants(variantDialog!.product._id),
    enabled: !!variantDialog?.product?._id,
    retry: 1,
  });

  const variants = variantData ?? [];

  const allItemOptions: ItemOption[] = [
    ...serviceItems.map(s => ({
      _id: s._id, name: s.name, sourceType: 'service' as const,
      unit: s.unit, category: s.category, costPriceCents: s.costPriceCents > 0 ? s.costPriceCents : s.defaultUnitPriceCents,
      vatRate: s.vatRate,
    })),
    ...products.filter(p => !p.isService).map(p => ({
      _id: p._id, name: p.name, sourceType: 'product' as const,
      sku: p.sku, unit: p.unit, category: p.categoryName,
      costPriceCents: p.costPriceCents > 0 ? p.costPriceCents : p.defaultUnitPriceCents,
      vatRate: p.vatRate, hasVariants: p.hasVariants,
    })),
  ];

  function handleItemSelect(opt: ItemOption | null, lineIndex: number) {
    // console.log('Selected item option:', opt, 'for line index:', lineIndex);
    if (!opt) { setLines(ls => ls.map((l, i) => i === lineIndex ? emptyLine() : l)); return; }
    if (opt.sourceType === 'service') {
      const item = serviceItems.find(s => s._id === opt._id);
      if (item) setLines(ls => ls.map((l, i) => i === lineIndex ? lineFromService(item, l) : l));
    } else {
      const product = products.find(p => p._id === opt._id);
      if (!product) return;
      if (product.hasVariants) {
        // console.log('Opening variant selection dialog for product:', product);
        setVariantDialog({ product, lineIndex });
      } else {
        setLines(ls => ls.map((l, i) => i === lineIndex ? lineFromProduct(product, l) : l));
      }
    }
  }

  function handleVariantSelect(variant: ProductVariant) {
    if (!variantDialog) return;
    const { product, lineIndex } = variantDialog;
    setLines(ls => ls.map((l, i) => i === lineIndex ? lineFromVariant(product, variant, l) : l));
    setVariantDialog(null);
  }

  const setLine = <K extends keyof LineForm>(i: number, k: K, v: LineForm[K]) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  function getSelectedOption(line: LineForm): ItemOption | null {
    if (line.sourceType === 'service' && line.serviceItemId)
      return allItemOptions.find(o => o._id === line.serviceItemId) ?? null;
    if (line.sourceType === 'product' && line.productId)
      return allItemOptions.find(o => o._id === line.productId) ?? null;
    return null;
  }

  function buildLines(): POLineItemInput[] {
    return lines.map(l => ({
      description:    l.description,
      unit:           l.unit || 'Stück',
      quantity:       parseFloat(l.quantityStr) || 1,
      unitPriceCents: Math.round(parseFloat(l.unitPriceStr.replace(',', '.')) * 100 || 0),
      vatRate:        l.vatRate,
      serviceItemId:  l.sourceType === 'service' && l.serviceItemId ? l.serviceItemId : undefined,
      productId:      l.sourceType === 'product' && l.productId     ? l.productId     : undefined,
      variantId:      l.sourceType === 'product' && l.variantId     ? l.variantId     : undefined,
    }));
  }

  const totalCents = lines.reduce((s, l) => {
    const net = Math.round((parseFloat(l.quantityStr) || 0) * Math.round(parseFloat(l.unitPriceStr.replace(',', '.')) * 100 || 0));
    return s + net + Math.round(net * l.vatRate / 100);
  }, 0);

  const mutation = useMutation({
    mutationFn: () => {
      const body: CreatePOPayload = {
        supplierId, orderDate,
        expectedDeliveryDate: deliveryDate || undefined,
        lineItems: buildLines(),
        deliveryAddress, notes, internalNotes,
      };
      return purchaseOrdersApi.create(body);
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      navigate(`/erp/einkauf/bestellungen/${res.data._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function doValidate() {
    if (!supplierId) { setError(de ? 'Lieferant auswählen.' : 'Select a supplier.'); return false; }
    if (!orderDate)  { setError(de ? 'Bestelldatum angeben.' : 'Enter order date.'); return false; }
    if (lines.length === 0) { setError(de ? 'Mindestens eine Position.' : 'Add at least one line.'); return false; }
    return true;
  }

  // ── Variant dialog attribute columns ──────────────────────────────────────────
  const attrKeys = variantDialog?.product.variantAttributes ?? [];

  return (
    <Box maxWidth={1000}>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/einkauf/bestellungen')} size="small">
          {de ? 'Bestellungen' : 'Purchase Orders'}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>
          {de ? 'Neue Bestellung erstellen' : 'Create purchase order'}
        </Typography>
        <Button variant="contained"
          startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          disabled={mutation.isPending} onClick={() => { if (doValidate()) mutation.mutate(); }}>
          {de ? 'Speichern' : 'Save'}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={3}>
        {/* Header */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Bestellkopf' : 'Order header'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  size="small"
                  options={suppliers}
                  getOptionLabel={s => `${s.companyName} (${s.supplierNumber})`}
                  value={suppliers.find(s => s._id === supplierId) ?? null}
                  onChange={(_, v) => setSupplierId(v?._id ?? '')}
                  renderInput={p => <TextField {...p} label={`${de ? 'Lieferant' : 'Supplier'} *`} />}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField label={`${de ? 'Bestelldatum' : 'Order date'} *`} type="date" size="small" fullWidth
                  value={orderDate} onChange={e => setOrderDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField label={de ? 'Gewünschtes Lieferdatum' : 'Expected delivery'} type="date" size="small" fullWidth
                  value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12}>
                <TextField label={de ? 'Lieferadresse' : 'Delivery address'} size="small" fullWidth multiline rows={2}
                  value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle2" color="text.secondary">{de ? 'Positionen' : 'Line items'}</Typography>
              <Chip label={`${de ? 'Gesamt (brutto)' : 'Total (gross)'}: ${fmtCents(totalCents, locale)}`} color="primary" />
            </Stack>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 220 }}>{de ? 'Artikel' : 'Item'}</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>{de ? 'Bezeichnung' : 'Description'}</TableCell>
                    <TableCell sx={{ width: 80 }}>{de ? 'Einheit' : 'Unit'}</TableCell>
                    <TableCell sx={{ width: 80 }}>{de ? 'Menge' : 'Qty'}</TableCell>
                    <TableCell sx={{ width: 130 }}>{de ? 'EK-Preis (€)' : 'Cost price (€)'}</TableCell>
                    <TableCell sx={{ width: 90 }}>{de ? 'MwSt. %' : 'VAT %'}</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>{de ? 'Gesamt' : 'Total'}</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((l, i) => {
                    const net   = Math.round((parseFloat(l.quantityStr) || 0) * Math.round(parseFloat(l.unitPriceStr.replace(',', '.')) * 100 || 0));
                    const gross = net + Math.round(net * l.vatRate / 100);
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <Autocomplete
                            size="small"
                            options={allItemOptions}
                            groupBy={o => o.sourceType === 'service' ? (de ? 'Dienstleistungen' : 'Services') : (de ? 'Produkte' : 'Products')}
                            getOptionLabel={o => o.name}
                            value={getSelectedOption(l)}
                            onChange={(_, v) => handleItemSelect(v, i)}
                            renderOption={(props, o) => (
                              <li {...props} key={o._id}>
                                <Stack direction="row" alignItems="center" gap={1} width="100%">
                                  <Box flex={1}>
                                    <Typography variant="body2">{o.name}</Typography>
                                    {o.sku && <Typography variant="caption" color="text.secondary">{o.sku}</Typography>}
                                  </Box>
                                  {o.hasVariants
                                    ? <Chip label={de ? 'Varianten' : 'Variants'} size="small" variant="outlined" />
                                    : o.sourceType === 'product' && <Chip label="Produkt" size="small" variant="outlined" color="info" />}
                                </Stack>
                              </li>
                            )}
                            renderInput={p => <TextField {...p} placeholder={de ? 'Artikel wählen…' : 'Select item…'} />}
                            sx={{ minWidth: 200 }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" fullWidth value={l.description}
                            onChange={e => setLine(i, 'description', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" sx={{ width: 70 }} value={l.unit}
                            onChange={e => setLine(i, 'unit', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" sx={{ width: 70 }} value={l.quantityStr}
                            onChange={e => setLine(i, 'quantityStr', e.target.value)}
                            inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" sx={{ width: 120 }} value={l.unitPriceStr}
                            onChange={e => setLine(i, 'unitPriceStr', e.target.value)}
                            inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right', fontFamily: 'monospace' } }}
                            placeholder="0,00" />
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" sx={{ width: 80 }}>
                            <Select value={l.vatRate} onChange={e => setLine(i, 'vatRate', Number(e.target.value))}>
                              <MenuItem value={0}>0%</MenuItem>
                              <MenuItem value={7}>7%</MenuItem>
                              <MenuItem value={19}>19%</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {gross > 0 ? fmtCents(gross, locale) : '—'}
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
                </TableBody>
              </Table>
            </Box>
            <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }}
              onClick={() => setLines(ls => [...ls, emptyLine()])}>
              {de ? 'Position hinzufügen' : 'Add line'}
            </Button>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Notizen' : 'Notes'}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Anmerkungen (extern)' : 'Notes (external)'} size="small" fullWidth multiline rows={2}
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={de ? 'Interne Notizen' : 'Internal notes'} size="small" fullWidth multiline rows={2}
                  value={internalNotes} onChange={e => setInternalNotes(e.target.value)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Stack>

      {/* Variant picker dialog */}
      <Dialog open={!!variantDialog} onClose={() => setVariantDialog(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {de ? 'Variante wählen' : 'Select variant'}{variantDialog ? ` – ${variantDialog.product.name}` : ''}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {attrKeys.map(k => <TableCell key={k}>{k}</TableCell>)}
                  <TableCell>SKU</TableCell>
                  <TableCell align="right">{de ? 'EK-Preis' : 'Cost price'}</TableCell>
                  <TableCell align="right">{de ? 'Bestand' : 'Stock'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {variants.filter(v => v.isActive).map(v => {
                  const parentProduct = variantDialog?.product;
                  const price = (v.costPriceCents ?? 0) > 0
                    ? v.costPriceCents
                    : (parentProduct?.costPriceCents ?? 0) > 0
                      ? parentProduct!.costPriceCents
                      : parentProduct?.defaultUnitPriceCents ?? 0;
                  return (
                    <TableRow key={v._id} hover sx={{ cursor: 'pointer' }} onClick={() => handleVariantSelect(v)}>
                      {attrKeys.map(k => <TableCell key={k}>{v.attributes?.[k] ?? '—'}</TableCell>)}
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{v.sku || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCents(price, locale)}
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          label={v.stockQuantity}
                          color={v.stockQuantity > (v.lowStockThreshold ?? 0) ? 'success' : v.stockQuantity > 0 ? 'warning' : 'error'}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {variantsLoading && (
                  <TableRow>
                    <TableCell colSpan={attrKeys.length + 3} align="center">
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                )}
                {!variantsLoading && variantsError && (
                  <TableRow>
                    <TableCell colSpan={attrKeys.length + 3} align="center">
                      <Alert severity="error" sx={{ display: 'inline-flex' }}>Failed to load variants</Alert>
                    </TableCell>
                  </TableRow>
                )}
                {!variantsLoading && !variantsError && variants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={attrKeys.length + 3} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      {de ? 'Keine Varianten vorhanden' : 'No variants found'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVariantDialog(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
