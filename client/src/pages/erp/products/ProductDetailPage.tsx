import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, TextField, FormControl,
  InputLabel, Select, MenuItem, FormControlLabel, Switch, Grid, Divider,
  Table, TableHead, TableBody, TableRow, TableCell, Paper, CircularProgress,
  Alert, Chip, IconButton, Tooltip, InputAdornment, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useTranslation } from 'react-i18next';
import { productsApi, Product, ProductVariant } from '../../../api/products';

const VAT_RATES = [0, 7, 19];
const UNITS_DE = ['Stück', 'Stunde', 'Tag', 'kg', 'g', 'l', 'ml', 'm', 'm²', 'Pauschale', 'Monat'];
const UNITS_EN = ['pcs', 'hour', 'day', 'kg', 'g', 'l', 'ml', 'm', 'm²', 'flat', 'month'];

const fmt = (cents: number) => (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 });
const parseCents = (val: string) => Math.round(parseFloat(val.replace(',', '.')) * 100) || 0;

function cartesian(arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>((acc, arr) => acc.flatMap(combo => arr.map(val => [...combo, val])), [[]]);
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { i18n } = useTranslation();
  const de = i18n.language === 'de';

  const units = de ? UNITS_DE : UNITS_EN;

  const [form, setForm] = useState<Partial<Product>>({
    name: '', sku: '', description: '', unit: de ? 'Stück' : 'pcs',
    vatRate: 19, isService: false, hasVariants: false,
    variantAttributes: [], costPriceCents: 0, defaultUnitPriceCents: 0,
    stockQuantity: 0, lowStockThreshold: 0, barcode: '', isActive: true, notes: '',
  });

  // variant state
  const [attrValues, setAttrValues] = useState<Record<string, string[]>>({});
  const [attrInputs, setAttrInputs] = useState<Record<string, string>>({}); // raw typed text per attribute
  const [variants, setVariants] = useState<Partial<ProductVariant>[]>([]);
  const [stockDialog, setStockDialog] = useState<{ variantId?: string; delta: number } | null>(null);

  const { data: categories = [] } = useQuery({ queryKey: ['m3-product-categories'], queryFn: productsApi.listCategories });

  const { data: product, isLoading } = useQuery({
    queryKey: ['m3-product', id],
    queryFn: () => productsApi.get(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (product) {
      setForm(product);
      if (product.variants) {
        setVariants(product.variants);
        // rebuild attrValues from existing variants
        const avMap: Record<string, Set<string>> = {};
        product.variantAttributes.forEach(a => avMap[a] = new Set());
        product.variants.forEach(v => {
          Object.entries(v.attributes).forEach(([k, val]) => {
            if (!avMap[k]) avMap[k] = new Set();
            avMap[k].add(val);
          });
        });
        setAttrValues(Object.fromEntries(Object.entries(avMap).map(([k, s]) => [k, [...s]])));
      }
    }
  }, [product]);

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setForm(p => ({ ...p, [k]: v }));

  // generate variant combinations from attribute values
  const generateVariants = () => {
    const attrNames = form.variantAttributes ?? [];
    const valueArrays = attrNames.map(a => attrValues[a] ?? []);
    if (valueArrays.some(a => a.length === 0)) return;
    const combos = cartesian(valueArrays);
    const generated = combos.map(combo => {
      const attributes = Object.fromEntries(attrNames.map((a, i) => [a, combo[i]]));
      const skuSuffix = combo.join('-').toUpperCase().replace(/\s+/g, '');
      const existing = variants.find(v =>
        attrNames.every(a => (v.attributes as Record<string, string>)?.[a] === attributes[a])
      );
      return existing ?? {
        attributes,
        sku: form.sku ? `${form.sku}-${skuSuffix}` : skuSuffix,
        costPriceCents: form.costPriceCents ?? 0,
        unitPriceCents: form.defaultUnitPriceCents ?? 0,
        stockQuantity: 0,
        lowStockThreshold: 0,
        isActive: true,
      };
    });
    setVariants(generated);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let saved: Product;
      if (isNew) {
        saved = await productsApi.create(form);
      } else {
        saved = await productsApi.update(id!, form);
      }
      if (form.hasVariants && variants.length > 0) {
        await productsApi.bulkSetVariants(saved._id, variants);
      }
      return saved;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['m3-products'] });
      qc.invalidateQueries({ queryKey: ['m3-product', id] });
      if (isNew) navigate(`/erp/products/${saved._id}`, { replace: true });
    },
  });

  const stockAdjustMutation = useMutation({
    mutationFn: async () => {
      if (!stockDialog) return;
      if (stockDialog.variantId) {
        await productsApi.variantStockAdjust(id!, stockDialog.variantId, stockDialog.delta);
      } else {
        await productsApi.stockAdjust(id!, stockDialog.delta);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m3-product', id] }); setStockDialog(null); },
  });

  if (!isNew && isLoading) return <Box textAlign="center" py={8}><CircularProgress /></Box>;

  const hasVariants = form.hasVariants ?? false;
  const isService = form.isService ?? false;

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/products')} size="small">
          {de ? 'Produkte' : 'Products'}
        </Button>
        <Box flex={1}>
          <Typography variant="h5" fontWeight={700}>
            {isNew ? (de ? 'Neues Produkt' : 'New product') : form.name}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : (de ? 'Speichern' : 'Save')}
        </Button>
      </Stack>

      {saveMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(saveMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (de ? 'Fehler beim Speichern' : 'Save failed')}
        </Alert>
      )}

      <Grid container spacing={2}>
        {/* Basic info */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>{de ? 'Grunddaten' : 'Basic info'}</Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField label={de ? 'Name' : 'Name'} value={form.name ?? ''} onChange={e => set('name', e.target.value)} fullWidth size="small" required />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField label="SKU" value={form.sku ?? ''} onChange={e => set('sku', e.target.value)} fullWidth size="small" />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField label={de ? 'Barcode' : 'Barcode'} value={form.barcode ?? ''} onChange={e => set('barcode', e.target.value)} fullWidth size="small" />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{de ? 'Kategorie' : 'Category'}</InputLabel>
                    <Select value={form.categoryId ?? ''} label={de ? 'Kategorie' : 'Category'} onChange={e => set('categoryId', e.target.value || null)}>
                      <MenuItem value="">{de ? '— Keine —' : '— None —'}</MenuItem>
                      {categories.map(c => <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{de ? 'Einheit' : 'Unit'}</InputLabel>
                    <Select value={form.unit ?? ''} label={de ? 'Einheit' : 'Unit'} onChange={e => set('unit', e.target.value)}>
                      {units.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{de ? 'MwSt.' : 'VAT'}</InputLabel>
                    <Select value={form.vatRate ?? 19} label={de ? 'MwSt.' : 'VAT'} onChange={e => set('vatRate', Number(e.target.value))}>
                      {VAT_RATES.map(r => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <TextField label={de ? 'Beschreibung' : 'Description'} value={form.description ?? ''} onChange={e => set('description', e.target.value)} fullWidth size="small" multiline rows={2} />
                </Grid>
                <Grid item xs={12}>
                  <Stack direction="row" gap={3} flexWrap="wrap">
                    <FormControlLabel
                      control={<Switch checked={isService} onChange={e => { set('isService', e.target.checked); if (e.target.checked) set('hasVariants', false); }} />}
                      label={de ? 'Dienstleistung (kein Lager)' : 'Service (no stock tracking)'}
                    />
                    {!isService && (
                      <FormControlLabel
                        control={<Switch checked={hasVariants} onChange={e => set('hasVariants', e.target.checked)} />}
                        label={de ? 'Varianten aktivieren (Größe, Farbe …)' : 'Enable variants (size, color …)'}
                      />
                    )}
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Pricing & stock (simple product) */}
        {!hasVariants && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>{de ? 'Preise & Bestand' : 'Pricing & stock'}</Typography>
                <Divider sx={{ mb: 2 }} />
                <Grid container spacing={2} key={product?._id ?? 'new'}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label={de ? 'Einkaufspreis (€)' : 'Cost price (€)'}
                      size="small" fullWidth
                      defaultValue={fmt(form.costPriceCents ?? 0)}
                      onBlur={e => set('costPriceCents', parseCents(e.target.value))}
                      InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label={de ? 'Verkaufspreis (€)' : 'Sale price (€)'}
                      size="small" fullWidth
                      defaultValue={fmt(form.defaultUnitPriceCents ?? 0)}
                      onBlur={e => set('defaultUnitPriceCents', parseCents(e.target.value))}
                      InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }}
                    />
                  </Grid>
                  {!isService && (
                    <>
                      <Grid item xs={12} sm={2}>
                        <TextField
                          label={de ? 'Bestand' : 'Stock'}
                          type="number" size="small" fullWidth
                          value={form.stockQuantity ?? 0}
                          onChange={e => set('stockQuantity', Number(e.target.value))}
                          disabled={!isNew}
                        />
                      </Grid>
                      <Grid item xs={12} sm={2}>
                        <TextField
                          label={de ? 'Mindestbestand' : 'Low stock'}
                          type="number" size="small" fullWidth
                          value={form.lowStockThreshold ?? 0}
                          onChange={e => set('lowStockThreshold', Number(e.target.value))}
                        />
                      </Grid>
                    </>
                  )}
                </Grid>
                {!isNew && !isService && !hasVariants && (
                  <Button size="small" sx={{ mt: 1.5 }} onClick={() => setStockDialog({ delta: 0 })}>
                    {de ? 'Bestand anpassen' : 'Adjust stock'}
                  </Button>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Variant builder */}
        {hasVariants && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle2" color="text.secondary">{de ? 'Varianten' : 'Variants'}</Typography>
                  <Button size="small" startIcon={<AutoFixHighIcon />} onClick={generateVariants} variant="outlined">
                    {de ? 'Generieren' : 'Generate'}
                  </Button>
                </Stack>
                <Divider sx={{ mb: 2 }} />

                {/* Attribute axes */}
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  {de ? 'Attribute definieren (z.B. Größe, Farbe, Design)' : 'Define attributes (e.g. Size, Color, Design)'}
                </Typography>
                <Stack spacing={1} mb={2}>
                  {(form.variantAttributes ?? []).map((attr, i) => (
                    <Stack key={i} direction="row" gap={1} alignItems="flex-start">
                      <TextField
                        size="small" label={de ? 'Attribut' : 'Attribute'} value={attr}
                        onChange={e => {
                          const attrs = [...(form.variantAttributes ?? [])];
                          const oldAttr = attrs[i];
                          attrs[i] = e.target.value;
                          set('variantAttributes', attrs);
                          if (oldAttr && attrValues[oldAttr]) {
                            const av = { ...attrValues };
                            av[e.target.value] = av[oldAttr];
                            delete av[oldAttr];
                            setAttrValues(av);
                          }
                          setAttrInputs(p => { const n = { ...p }; delete n[oldAttr]; return n; });
                        }}
                        sx={{ minWidth: 130 }}
                      />
                      <TextField
                        size="small" label={de ? 'Werte (kommagetrennt)' : 'Values (comma-separated)'}
                        value={attrInputs[attr] !== undefined ? attrInputs[attr] : (attrValues[attr] ?? []).join(', ')}
                        onChange={e => setAttrInputs(p => ({ ...p, [attr]: e.target.value }))}
                        onBlur={e => {
                          const parsed = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          setAttrValues(p => ({ ...p, [attr]: parsed }));
                          setAttrInputs(p => { const n = { ...p }; delete n[attr]; return n; });
                        }}
                        sx={{ flex: 1 }}
                        placeholder="S, M, L, XL"
                      />
                      <IconButton size="small" onClick={() => {
                        const attrs = (form.variantAttributes ?? []).filter((_, j) => j !== i);
                        set('variantAttributes', attrs);
                        const av = { ...attrValues };
                        delete av[attr];
                        setAttrValues(av);
                      }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                  <Button size="small" startIcon={<AddIcon />} onClick={() => set('variantAttributes', [...(form.variantAttributes ?? []), ''])}>
                    {de ? 'Attribut hinzufügen' : 'Add attribute'}
                  </Button>
                </Stack>

                {/* Variant matrix */}
                {variants.length > 0 && (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          {(form.variantAttributes ?? []).map(a => <TableCell key={a}>{a}</TableCell>)}
                          <TableCell>SKU</TableCell>
                          <TableCell align="right">{de ? 'EK (€)' : 'Cost (€)'}</TableCell>
                          <TableCell align="right">{de ? 'VK (€)' : 'Price (€)'}</TableCell>
                          <TableCell align="right">{de ? 'Bestand' : 'Stock'}</TableCell>
                          <TableCell align="right">{de ? 'Limit' : 'Low'}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {variants.map((v, i) => (
                          <TableRow key={v._id ?? i}>
                            {(form.variantAttributes ?? []).map(a => (
                              <TableCell key={a}>
                                <Typography variant="caption">{(v.attributes as Record<string, string>)?.[a] ?? ''}</Typography>
                              </TableCell>
                            ))}
                            <TableCell>
                              <TextField size="small" value={v.sku ?? ''} onChange={e => { const arr = [...variants]; arr[i] = { ...arr[i], sku: e.target.value }; setVariants(arr); }} sx={{ width: 120 }} inputProps={{ style: { fontSize: 12, fontFamily: 'monospace' } }} />
                            </TableCell>
                            <TableCell>
                              <TextField key={`ek-${v._id}-${v.costPriceCents}`} size="small" defaultValue={fmt(v.costPriceCents ?? 0)} onBlur={e => { const arr = [...variants]; arr[i] = { ...arr[i], costPriceCents: parseCents(e.target.value) }; setVariants(arr); }} sx={{ width: 80 }} inputProps={{ style: { fontSize: 12, textAlign: 'right' } }} />
                            </TableCell>
                            <TableCell>
                              <TextField key={`vk-${v._id}-${v.unitPriceCents}`} size="small" defaultValue={fmt(v.unitPriceCents ?? 0)} onBlur={e => { const arr = [...variants]; arr[i] = { ...arr[i], unitPriceCents: parseCents(e.target.value) }; setVariants(arr); }} sx={{ width: 80 }} inputProps={{ style: { fontSize: 12, textAlign: 'right' } }} />
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={0.5}>
                                <Chip label={v.stockQuantity ?? 0} size="small" color={(v.stockQuantity ?? 0) === 0 ? 'error' : 'default'} />
                                {!isNew && v._id && (
                                  <Tooltip title={de ? 'Bestand anpassen' : 'Adjust stock'}>
                                    <IconButton size="small" onClick={() => setStockDialog({ variantId: v._id as string, delta: 0 })}>
                                      <AddIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <TextField size="small" type="number" value={v.lowStockThreshold ?? 0} onChange={e => { const arr = [...variants]; arr[i] = { ...arr[i], lowStockThreshold: Number(e.target.value) }; setVariants(arr); }} sx={{ width: 60 }} inputProps={{ style: { fontSize: 12 } }} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      {variants.length} {de ? 'Varianten (SKUs)' : 'variants (SKUs)'}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Notes */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <TextField label={de ? 'Notizen' : 'Notes'} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} fullWidth size="small" multiline rows={2} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Stock adjust dialog */}
      <Dialog open={!!stockDialog} onClose={() => setStockDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{de ? 'Bestand anpassen' : 'Adjust stock'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" type="number"
            label={de ? 'Menge (+ Eingang / - Ausgang)' : 'Quantity (+ in / - out)'}
            value={stockDialog?.delta ?? 0}
            onChange={e => setStockDialog(p => p ? { ...p, delta: Number(e.target.value) } : null)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockDialog(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" onClick={() => stockAdjustMutation.mutate()} disabled={stockAdjustMutation.isPending || !stockDialog?.delta}>
            {de ? 'Buchen' : 'Apply'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
