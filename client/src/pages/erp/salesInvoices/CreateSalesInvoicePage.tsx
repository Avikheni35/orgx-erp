import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, CardContent, TextField, Stack, Grid,
  IconButton, Alert, CircularProgress, Select, MenuItem, FormControl,
  InputLabel, Divider, Table, TableHead, TableBody, TableRow, TableCell,
  Autocomplete, ToggleButtonGroup, ToggleButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import ReceiptIcon from '@mui/icons-material/Receipt';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { useTranslation } from 'react-i18next';
import { salesInvoicesApi, type LineItemInput } from '../../../api/salesInvoices';
import { fxRatesApi, COMMON_CURRENCIES } from '../../../api/fxRates';
import { customersApi } from '../../../api/customers';
import { serviceItemsApi, type ServiceItem } from '../../../api/serviceItems';
import { productsApi, type Product, type ProductVariant } from '../../../api/products';
import { settingsApi } from '../../../api/settings';
import ServiceItemFormDialog from '../../../components/ServiceItemFormDialog';
import QuickCreateCustomerDialog from '../../../components/QuickCreateCustomerDialog';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

const OTHER = '__other__';
const CREATE = '__create__';

interface ItemOption {
  _id: string;
  name: string;
  sourceType: 'service' | 'product';
  sku?: string;
  description?: string;
  unit?: string;
  category?: string;
  defaultUnitPriceCents?: number;
  vatRate?: number;
  hasVariants?: boolean;
}

const OTHER_OPTION: ItemOption = { _id: OTHER, name: '__other__', sourceType: 'service' };
const CREATE_OPTION: ItemOption = { _id: CREATE, name: '__create__', sourceType: 'service' };

interface LineForm {
  sourceType: 'service' | 'product' | 'free';
  serviceItemId: string;
  productId: string;
  variantId: string;
  itemName: string;
  description: string;
  unit: string;
  quantity: string;
  unitPriceCents: string;
  vatRate: string;
}

const emptyLine = (): LineForm => ({
  sourceType: 'free',
  serviceItemId: '',
  productId: '',
  variantId: '',
  itemName: '',
  description: '',
  unit: 'Stück',
  quantity: '1',
  unitPriceCents: '',
  vatRate: '19',
});

function lineFromServiceItem(item: ServiceItem, prev?: LineForm): LineForm {
  return {
    sourceType: 'service',
    serviceItemId: item._id,
    productId: '',
    variantId: '',
    itemName: item.name,
    description: item.description || '',
    unit: item.unit,
    quantity: prev?.quantity || '1',
    unitPriceCents: (item.defaultUnitPriceCents / 100).toFixed(2),
    vatRate: String(item.vatRate),
  };
}

function lineFromProduct(product: Product, resolvedPriceCents?: number, prev?: LineForm): LineForm {
  return {
    sourceType: 'product',
    serviceItemId: '',
    productId: product._id,
    variantId: '',
    itemName: product.name,
    description: '',
    unit: product.unit || 'Stück',
    quantity: prev?.quantity || '1',
    unitPriceCents: ((resolvedPriceCents ?? product.defaultUnitPriceCents) / 100).toFixed(2),
    vatRate: String(product.vatRate),
  };
}

function lineFromVariant(product: Product, variant: ProductVariant, resolvedPriceCents?: number, prev?: LineForm): LineForm {
  const variantLabel = Object.values(variant.attributes ?? {}).join(' / ');
  const priceCents = resolvedPriceCents ?? (variant.unitPriceCents > 0 ? variant.unitPriceCents : product.defaultUnitPriceCents);
  return {
    sourceType: 'product',
    serviceItemId: '',
    productId: product._id,
    variantId: variant._id,
    itemName: variantLabel ? `${product.name} — ${variantLabel}` : product.name,
    description: '',
    unit: product.unit || 'Stück',
    quantity: prev?.quantity || '1',
    unitPriceCents: (priceCents / 100).toFixed(2),
    vatRate: String(product.vatRate),
  };
}

function calcLine(l: LineForm) {
  const qty = parseFloat(l.quantity) || 0;
  const price = parseFloat(l.unitPriceCents) || 0;
  const vat = parseFloat(l.vatRate) || 0;
  const net = Math.round(qty * price * 100) / 100;
  const vatAmt = Math.round(net * vat) / 100;
  return { net, vatAmt, gross: net + vatAmt };
}

function money(eur: number, locale: string) {
  return eur.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function isBlankLine(l: LineForm) {
  return l.sourceType === 'free' && l.description.trim() === '' && l.unitPriceCents === '';
}

export default function CreateSalesInvoicePage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const de = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const today = new Date().toISOString().slice(0, 10);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDefaultName, setCreateDefaultName] = useState('');
  const [pendingLineIdx, setPendingLineIdx] = useState<number>(-1);
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [variantDialog, setVariantDialog] = useState<{ lineIdx: number; product: Product } | null>(null);

  const settingApplied = useRef(false);
  const [posMode, setPosMode] = useState(() => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const cached = qc.getQueryData<any>(['settings', 'company']);
    const mode = cached?.data?.settings?.salesMode;
    if (mode != null) settingApplied.current = true;
    return mode === 'pos';
  });
  const [glAccount, setGlAccount] = useState<'1000' | '1200' | '1400'>('1200');

  const { data: settingsData } = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: () => settingsApi.getCompany(),
  });

  useEffect(() => {
    if (settingApplied.current) return;
    const mode = settingsData?.data?.settings?.salesMode;
    if (mode) {
      setPosMode(mode === 'pos');
      settingApplied.current = true;
    }
  }, [settingsData]);

  useEffect(() => {
    const last = lines[lines.length - 1];
    if (!isBlankLine(last)) {
      setLines(prev => [...prev, emptyLine()]);
    }
  }, [lines]);

  useEffect(() => {
    if (currency === 'EUR') { setExchangeRate('1'); return; }
    fxRatesApi.latest(currency)
      .then(r => setExchangeRate(String(r.data.rate)))
      .catch(() => {});
  }, [currency]);

  const { data: custData } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => customersApi.list({ active: true, limit: 200 }),
  });
  const { data: catalogData } = useQuery({
    queryKey: ['service-items-active'],
    queryFn: () => serviceItemsApi.list(true),
  });
  const { data: productsData } = useQuery({
    queryKey: ['m3-products-active'],
    queryFn: () => productsApi.list({ active: 'true' }),
  });
  const {
  data: variantsData = [],
  isLoading: variantsLoading,
  isError: variantsError,
  error: variantsErrorDetails,
} = useQuery({
  queryKey: ['product-variants', variantDialog?.product?._id],
  queryFn: () => {
    console.log(
      'Loading variants for product:',
      variantDialog?.product?._id
    );

    return productsApi.listVariants(variantDialog!.product._id);
  },
  enabled: Boolean(variantDialog?.product?._id),
  retry: 1,
});

  const customers = custData?.data?.customers ?? [];
  const serviceItems: ServiceItem[] = catalogData?.data?.items ?? [];
  const products: Product[] = productsData ?? [];

  const allItemOptions: ItemOption[] = [
    ...serviceItems.map((si): ItemOption => ({
      _id: si._id,
      name: si.name,
      sourceType: 'service',
      description: si.description,
      unit: si.unit,
      category: si.category || (de ? 'Dienstleistungen' : 'Services'),
      defaultUnitPriceCents: si.defaultUnitPriceCents,
      vatRate: si.vatRate,
    })),
    ...products.map((p): ItemOption => ({
      _id: p._id,
      name: p.name,
      sourceType: 'product',
      sku: p.sku,
      description: p.description,
      unit: p.unit,
      category: p.categoryName || (de ? 'Produkte' : 'Products'),
      defaultUnitPriceCents: p.defaultUnitPriceCents,
      vatRate: p.vatRate,
      hasVariants: p.hasVariants,
    })),
  ];

  const updateLine = (i: number, field: keyof LineForm, value: string) => {
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const applyServiceItemToLine = (i: number, item: ServiceItem) => {
    setLines(prev => {
      const next = [...prev];
      next[i] = lineFromServiceItem(item, prev[i]);
      return next;
    });
  };

  const applyProductToLine = async (i: number, product: Product) => {
    let resolvedPrice: number | undefined;
    if (customerId) {
      try {
        const res = await productsApi.resolvePrice({ productId: product._id, customerId, qty: 1 });
        resolvedPrice = res.unitPriceCents;
      } catch { }
    }
    setLines(prev => {
      const next = [...prev];
      next[i] = lineFromProduct(product, resolvedPrice, prev[i]);
      return next;
    });
  };

  const handleItemSelect = (i: number, opt: ItemOption) => {
    if (opt.sourceType === 'product') {
      const product = products.find(p => p._id === opt._id);
      console.log('Opening variant selection dialog for product:', product);
      if (!product) return;
      if (product.hasVariants) {
        setVariantDialog({ lineIdx: i, product });
      } else {
        applyProductToLine(i, product);
      }
    } else {
      const item = serviceItems.find(s => s._id === opt._id);
      if (item) applyServiceItemToLine(i, item);
    }
  };

  const handleVariantSelect = async (variant: ProductVariant) => {
    if (!variantDialog) return;
    const { lineIdx, product } = variantDialog;
    console.log('Selected variant:', variant);
    let resolvedPrice: number | undefined;
    if (customerId) {
      try {
        const res = await productsApi.resolvePrice({ productId: product._id, variantId: variant._id, customerId, qty: 1 });
        resolvedPrice = res.unitPriceCents;
      } catch { }
    }
    setLines(prev => {
      const next = [...prev];
      next[lineIdx] = lineFromVariant(product, variant, resolvedPrice, prev[lineIdx]);
      return next;
    });
    setVariantDialog(null);
  };

  const handleNewItemSaved = (item: ServiceItem) => {
    qc.invalidateQueries({ queryKey: ['service-items-active'] });
    if (pendingLineIdx >= 0) applyServiceItemToLine(pendingLineIdx, item);
    setCreateDialogOpen(false);
  };

  const buildLinePayload = (l: LineForm): LineItemInput => ({
    serviceItemId: l.sourceType === 'service' && l.serviceItemId ? l.serviceItemId : undefined,
    productId: l.sourceType === 'product' && l.productId ? l.productId : undefined,
    variantId: l.sourceType === 'product' && l.variantId ? l.variantId : undefined,
    itemName: l.itemName || undefined,
    description: l.description.trim(),
    unit: l.unit || 'Stück',
    quantity: parseFloat(l.quantity) || 1,
    unitPriceCents: Math.round((parseFloat(l.unitPriceCents) || 0) * 100),
    vatRate: parseFloat(l.vatRate) || 19,
  });

  const totals = lines.filter(l => !isBlankLine(l)).reduce((acc, l) => {
    const c = calcLine(l);
    return { net: acc.net + c.net, vat: acc.vat + c.vatAmt, gross: acc.gross + c.gross };
  }, { net: 0, vat: 0, gross: 0 });

  const validateLines = (filledLines: LineForm[]) => {
    if (filledLines.length === 0) return false;
    return !filledLines.find(l => {
      if (l.sourceType === 'free' && !l.description.trim()) return true;
      if (!l.unitPriceCents) return true;
      return false;
    });
  };

  const handleSubmit = async () => {
    if (!customerId) { setError(t('salesInvoices.selectCustomer')); return; }
    const filledLines = lines.filter(l => !isBlankLine(l));
    if (!validateLines(filledLines)) {
      setError(de ? 'Bitte Artikelname/Beschreibung und Preis für alle Positionen angeben.' : 'Please enter item name/description and price for all line items.');
      return;
    }
    setSaving(true); setError('');
    try {
      const res = await salesInvoicesApi.create({
        customerId,
        invoiceDate,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        lineItems: filledLines.map(buildLinePayload),
        currency: currency !== 'EUR' ? currency : undefined,
        exchangeRate: currency !== 'EUR' ? parseFloat(exchangeRate) || 1 : undefined,
      });
      navigate(`/erp/verkauf/rechnungen/${res.data._id}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handlePosSubmit = async (payLater: boolean) => {
    const filledLines = lines.filter(l => !isBlankLine(l));
    if (!validateLines(filledLines)) {
      setError(de ? 'Bitte Artikelname/Beschreibung und Preis für alle Positionen angeben.' : 'Please enter item name/description and price for all line items.');
      return;
    }
    setSaving(true); setError('');
    try {
      const res = await salesInvoicesApi.posSale({
        lineItems: filledLines.map(buildLinePayload),
        glAccount,
        payLater,
        invoiceDate,
        notes: notes || undefined,
      });
      navigate(`/erp/verkauf/rechnungen/${res.data._id}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const getLineValue = (l: LineForm): ItemOption | null => {
    if (l.sourceType === 'free') return null;
    return allItemOptions.find(o => o._id === (l.sourceType === 'service' ? l.serviceItemId : l.productId)) ?? null;
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} mb={3} flexWrap="wrap">
        <IconButton onClick={() => navigate('/erp/verkauf/rechnungen')}><ArrowBackIcon /></IconButton>
        <Box flex={1}>
          <Typography variant="h5" fontWeight={700}>{t('salesInvoices.createInvoice')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('salesInvoices.subtitle')}</Typography>
        </Box>
        <ToggleButtonGroup
          value={posMode ? 'pos' : 'invoice'}
          exclusive
          size="small"
          onChange={(_, v) => { if (v) setPosMode(v === 'pos'); }}
        >
          <ToggleButton value="invoice" sx={{ gap: 0.5, px: 2 }}>
            <ReceiptIcon fontSize="small" />
            {de ? 'Rechnung' : 'Invoice'}
          </ToggleButton>
          <ToggleButton value="pos" sx={{ gap: 0.5, px: 2 }}>
            <PointOfSaleIcon fontSize="small" />
            {de ? 'Direktverkauf' : 'POS / Direct'}
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack gap={3}>
        {/* Header */}
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              {!posMode && (
                <Grid item xs={12} sm={6}>
                  <Stack direction="row" gap={1} alignItems="flex-start">
                    <FormControl fullWidth size="small" required>
                      <InputLabel>{t('salesInvoices.customer')}</InputLabel>
                      <Select value={customerId} label={t('salesInvoices.customer')} onChange={e => setCustomerId(e.target.value)}>
                        {customers.map(c => (
                          <MenuItem key={c._id} value={c._id}>{c.companyName} ({c.customerNumber})</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <IconButton
                      size="small"
                      title={de ? 'Neuen Kunden anlegen' : 'Create new customer'}
                      onClick={() => setQuickCustOpen(true)}
                      sx={{ mt: 0.25, flexShrink: 0 }}
                    >
                      <PersonAddIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Grid>
              )}
              <Grid item xs={6} sm={posMode ? 4 : 3}>
                <TextField fullWidth size="small" type="date" label={t('salesInvoices.invoiceDate')} value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              {!posMode && (
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small" type="date" label={t('salesInvoices.dueDate')} value={dueDate} onChange={e => setDueDate(e.target.value)} InputLabelProps={{ shrink: true }} helperText={t('common.optional')} />
                </Grid>
              )}
              {!posMode && (
                <Grid item xs={6} sm={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('salesInvoices.currency')}</InputLabel>
                    <Select
                      value={currency}
                      label={t('salesInvoices.currency')}
                      onChange={e => setCurrency(e.target.value)}
                    >
                      <MenuItem value="EUR">EUR — Euro</MenuItem>
                      {COMMON_CURRENCIES.map(c => (
                        <MenuItem key={c.code} value={c.code}>{c.code} — {c.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
              {!posMode && currency !== 'EUR' && (
                <Grid item xs={6} sm={2}>
                  <TextField
                    fullWidth size="small" type="number"
                    label={t('salesInvoices.exchangeRate')}
                    value={exchangeRate}
                    onChange={e => setExchangeRate(e.target.value)}
                    inputProps={{ min: 0.0001, step: 0.0001 }}
                    helperText={t('salesInvoices.exchangeRateHint')}
                  />
                </Grid>
              )}
              {posMode && (
                <Grid item xs={12} sm={8}>
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                      {de ? 'Zahlungsart:' : 'Payment:'}
                    </Typography>
                    {([
                      { key: '1000', label: de ? 'Bargeld' : 'Cash', icon: <LocalAtmIcon fontSize="small" /> },
                      { key: '1200', label: de ? 'Karte' : 'Card', icon: <CreditCardIcon fontSize="small" /> },
                      { key: '1400', label: de ? 'Überweisung' : 'Transfer', icon: <AccountBalanceIcon fontSize="small" /> },
                    ] as { key: '1000' | '1200' | '1400'; label: string; icon: React.ReactNode }[]).map(opt => (
                      <Chip
                        key={opt.key}
                        icon={opt.icon as React.ReactElement}
                        label={opt.label}
                        onClick={() => setGlAccount(opt.key)}
                        color={glAccount === opt.key ? 'primary' : 'default'}
                        variant={glAccount === opt.key ? 'filled' : 'outlined'}
                        sx={{ cursor: 'pointer', fontWeight: glAccount === opt.key ? 700 : 400 }}
                      />
                    ))}
                  </Stack>
                </Grid>
              )}
              <Grid item xs={12}>
                <TextField fullWidth size="small" multiline rows={2} label={t('salesInvoices.notes')} value={notes} onChange={e => setNotes(e.target.value)} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight={600}>{t('salesInvoices.lineItems')}</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setLines(p => [...p, emptyLine()])}>
                {t('salesInvoices.addLine')}
              </Button>
            </Stack>

            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 860 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '22%' }}>
                      {de ? 'Artikel' : 'Item'}
                    </TableCell>
                    <TableCell sx={{ width: '24%' }}>
                      {t('salesInvoices.lineDescription')}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        ({t('common.optional')})
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ width: '8%' }}>{t('salesInvoices.quantity')}</TableCell>
                    <TableCell sx={{ width: '6%' }}>{de ? 'Einh.' : 'Unit'}</TableCell>
                    <TableCell sx={{ width: '12%' }}>{t('salesInvoices.unitPriceEur')}</TableCell>
                    <TableCell sx={{ width: '9%' }}>{t('salesInvoices.vatRate')}</TableCell>
                    <TableCell align="right" sx={{ width: '9%' }}>{t('salesInvoices.lineNet')}</TableCell>
                    <TableCell align="right" sx={{ width: '9%' }}>{t('salesInvoices.lineGross')}</TableCell>
                    <TableCell sx={{ width: '4%' }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((l, i) => {
                    const c = calcLine(l);
                    const isFreeForm = l.sourceType === 'free';
                    return (
                      <TableRow key={i}>
                        {/* Item autocomplete */}
                        <TableCell>
                          <Autocomplete<ItemOption>
                            size="small"
                            options={[...allItemOptions, CREATE_OPTION, OTHER_OPTION]}
                            getOptionLabel={opt => {
                              if (opt._id === OTHER) return de ? 'Sonstige (Freitext)' : 'Other (free text)';
                              if (opt._id === CREATE) return '';
                              return opt.name;
                            }}
                            value={
                              l.sourceType === 'free'
                                ? null
                                : getLineValue(l)
                            }
                            onChange={(_, opt, __, details) => {
                              if (!opt) {
                                setLines(prev => { const n = [...prev]; n[i] = emptyLine(); return n; });
                                return;
                              }
                              if (opt._id === OTHER) {
                                setLines(prev => { const n = [...prev]; n[i] = { ...emptyLine(), sourceType: 'free' }; return n; });
                              } else if (opt._id === CREATE) {
                                const typed = (details as { option?: { name?: string } })?.option?.name ?? '';
                                setCreateDefaultName(typed);
                                setPendingLineIdx(i);
                                setCreateDialogOpen(true);
                              } else {
                                handleItemSelect(i, opt);
                              }
                            }}
                            isOptionEqualToValue={(a, b) => a._id === b._id}
                            groupBy={opt => {
                              if (opt._id === OTHER || opt._id === CREATE) return '';
                              return opt.category || (de ? 'Sonstige' : 'Other');
                            }}
                            filterOptions={(opts, state) => {
                              const q = state.inputValue.trim().toLowerCase();
                              const catalog = opts.filter(o =>
                                o._id !== OTHER && o._id !== CREATE &&
                                (o.name.toLowerCase().includes(q) ||
                                  (o.description ?? '').toLowerCase().includes(q) ||
                                  (o.sku ?? '').toLowerCase().includes(q) ||
                                  (o.category ?? '').toLowerCase().includes(q))
                              );
                              const result: ItemOption[] = [...catalog];
                              if (q && catalog.length === 0) {
                                result.push({ ...CREATE_OPTION, name: state.inputValue.trim() });
                              }
                              result.push(OTHER_OPTION);
                              return result;
                            }}
                            renderOption={(props, opt) => {
                              const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: React.Key };
                              if (opt._id === OTHER) {
                                return (
                                  <li key={key} {...rest} style={{ borderTop: '1px solid #e0e0e0', marginTop: 4, paddingTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <Typography variant="body2" fontStyle="italic" color="text.secondary">
                                      {de ? 'Sonstige (Freitext)' : 'Other (free text)'}
                                    </Typography>
                                  </li>
                                );
                              }
                              if (opt._id === CREATE) {
                                return (
                                  <li key={key} {...rest} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <Typography variant="body2" color="primary.main" fontWeight={600}>
                                      + {de ? `"${opt.name}" erstellen` : `Create "${opt.name}"`}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {de ? 'Zum Katalog hinzufügen' : 'Add to catalog'}
                                    </Typography>
                                  </li>
                                );
                              }
                              return (
                                <li key={key} {...rest} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                  <Stack direction="row" alignItems="center" gap={0.5}>
                                    <Typography variant="body2" fontWeight={500}>{opt.name}</Typography>
                                    {opt.sourceType === 'product' && (
                                      <Chip
                                        label={opt.hasVariants ? (de ? 'Varianten' : 'Variants') : (de ? 'Produkt' : 'Product')}
                                        size="small"
                                        color={opt.hasVariants ? 'secondary' : 'default'}
                                        variant="outlined"
                                        sx={{ height: 16, fontSize: 10 }}
                                      />
                                    )}
                                  </Stack>
                                  <Typography variant="caption" color="text.secondary">
                                    {[
                                      opt.sku ? opt.sku : null,
                                      opt.defaultUnitPriceCents != null ? `${(opt.defaultUnitPriceCents / 100).toFixed(2)} €` : null,
                                      opt.unit ?? null,
                                      opt.vatRate != null ? `${opt.vatRate}% MwSt.` : null,
                                    ].filter(Boolean).join(' · ')}
                                  </Typography>
                                </li>
                              );
                            }}
                            renderInput={params => (
                              <TextField
                                {...params}
                                variant="standard"
                                placeholder={de ? 'Artikel suchen…' : 'Search item…'}
                              />
                            )}
                            sx={{ minWidth: 160 }}
                          />
                        </TableCell>

                        {/* Description */}
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            variant="standard"
                            placeholder={
                              isFreeForm
                                ? (de ? 'Bezeichnung (Pflicht)' : 'Name (required)')
                                : (de ? 'Zusatzinfo (optional)' : 'Extra detail (optional)')
                            }
                            value={l.description}
                            onChange={e => updateLine(i, 'description', e.target.value)}
                            required={isFreeForm}
                            inputProps={{ id: `li-${i}-desc`, tabIndex: -1 }}
                          />
                        </TableCell>

                        {/* Quantity */}
                        <TableCell>
                          <TextField
                            size="small"
                            variant="standard"
                            type="number"
                            value={l.quantity}
                            onChange={e => updateLine(i, 'quantity', e.target.value)}
                            inputProps={{ min: 0.01, step: 0.5, style: { width: 60 }, id: `li-${i}-qty` }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById(`li-${i}-price`)?.focus();
                              }
                            }}
                          />
                        </TableCell>

                        {/* Unit */}
                        <TableCell>
                          <Select
                            size="small"
                            variant="standard"
                            value={l.unit}
                            onChange={e => updateLine(i, 'unit', e.target.value)}
                            sx={{ minWidth: 60 }}
                            SelectDisplayProps={{ id: `li-${i}-unit-btn`, tabIndex: -1 } as React.HTMLAttributes<HTMLDivElement>}
                          >
                            <MenuItem value="Stunde">{de ? 'Std.' : 'hr'}</MenuItem>
                            <MenuItem value="Tag">{de ? 'Tag' : 'day'}</MenuItem>
                            <MenuItem value="Stück">{de ? 'Stk.' : 'pcs'}</MenuItem>
                            <MenuItem value="Pauschale">{de ? 'Psch.' : 'flat'}</MenuItem>
                            <MenuItem value="km">km</MenuItem>
                            <MenuItem value="Monat">{de ? 'Mon.' : 'mo.'}</MenuItem>
                          </Select>
                        </TableCell>

                        {/* Unit price */}
                        <TableCell>
                          <TextField
                            size="small"
                            variant="standard"
                            type="number"
                            placeholder="0.00"
                            value={l.unitPriceCents}
                            onChange={e => updateLine(i, 'unitPriceCents', e.target.value)}
                            inputProps={{ min: 0, step: 0.01, style: { width: 80 }, id: `li-${i}-price` }}
                            onKeyDown={e => {
                              if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById(`li-${i}-vat-btn`)?.focus();
                              }
                            }}
                          />
                        </TableCell>

                        {/* VAT */}
                        <TableCell>
                          <Select
                            size="small"
                            variant="standard"
                            value={l.vatRate}
                            onChange={e => updateLine(i, 'vatRate', String(e.target.value))}
                            SelectDisplayProps={{ id: `li-${i}-vat-btn` } as React.HTMLAttributes<HTMLDivElement>}
                            onKeyDown={e => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault();
                                if (i === lines.length - 1) {
                                  setLines(prev => [...prev, emptyLine()]);
                                  setTimeout(() => document.getElementById(`li-${i + 1}-desc`)?.focus(), 30);
                                } else {
                                  document.getElementById(`li-${i + 1}-desc`)?.focus();
                                }
                              }
                            }}
                          >
                            <MenuItem value="19">19 %</MenuItem>
                            <MenuItem value="7">7 %</MenuItem>
                            <MenuItem value="0">0 %</MenuItem>
                          </Select>
                        </TableCell>

                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {money(c.net, locale)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          <strong>{money(c.gross, locale)}</strong>
                        </TableCell>
                        <TableCell>
                          {lines.length > 1 && (
                            <IconButton size="small" color="error" onClick={() => setLines(p => p.filter((_, idx) => idx !== i))}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Stack alignItems="flex-end" gap={0.5}>
              <Stack direction="row" gap={4}>
                <Typography variant="body2" color="text.secondary">{t('salesInvoices.netAmount')}:</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>{money(totals.net, locale)}</Typography>
              </Stack>
              <Stack direction="row" gap={4}>
                <Typography variant="body2" color="text.secondary">{t('salesInvoices.vatAmount')}:</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>{money(totals.vat, locale)}</Typography>
              </Stack>
              <Stack direction="row" gap={4}>
                <Typography variant="subtitle2" fontWeight={700}>{t('salesInvoices.grossAmount')}:</Typography>
                <Typography variant="subtitle2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>{money(totals.gross, locale)}</Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Stack direction="row" gap={2} mt={3} justifyContent="flex-end" flexWrap="wrap">
        <Button variant="outlined" onClick={() => navigate('/erp/verkauf/rechnungen')} disabled={saving}>{t('common.cancel')}</Button>
        {posMode ? (
          <>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => handlePosSubmit(true)}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={16} /> : undefined}
            >
              {de ? 'Später zahlen' : 'Pay Later'}
            </Button>
            <Button
              variant="contained"
              color="success"
              onClick={() => handlePosSubmit(false)}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={16} /> : <PointOfSaleIcon />}
            >
              {de ? 'Verkauf abschließen' : 'Complete Sale'}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={handleSubmit} disabled={saving} startIcon={saving ? <CircularProgress size={16} /> : undefined}>
            {t('salesInvoices.createInvoice')}
          </Button>
        )}
      </Stack>

      {/* Variant picker dialog */}
      <Dialog open={!!variantDialog} onClose={() => setVariantDialog(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {de
            ? `Variante wählen: ${variantDialog?.product.name}`
            : `Select variant: ${variantDialog?.product.name}`}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {variantsLoading ? (
            <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>
          ) : variantsError ? (
            <Alert severity="error">Failed to load variants</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {variantDialog?.product.variantAttributes.map(attr => (
                    <TableCell key={attr} sx={{ fontWeight: 600 }}>{attr}</TableCell>
                  ))}
                  <TableCell sx={{ fontWeight: 600 }}>SKU</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{de ? 'Preis' : 'Price'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{de ? 'Bestand' : 'Stock'}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {variantsData.filter(v => v.isActive).map(variant => {
                  const priceCents = variant.unitPriceCents > 0
                    ? variant.unitPriceCents
                    : variantDialog?.product.defaultUnitPriceCents ?? 0;
                  return (
                    <TableRow
                      key={variant._id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => handleVariantSelect(variant)}
                    >
                      {variantDialog?.product.variantAttributes.map(attr => (
                        <TableCell key={attr}>{variant.attributes[attr] ?? '—'}</TableCell>
                      ))}
                      <TableCell>
                        <Typography variant="caption" fontFamily="monospace">{variant.sku || '—'}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {(priceCents / 100).toFixed(2)} €
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={variant.stockQuantity}
                          size="small"
                          color={variant.stockQuantity === 0 ? 'error' : variant.stockQuantity <= variant.lowStockThreshold ? 'warning' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); handleVariantSelect(variant); }}>
                          {de ? 'Wählen' : 'Select'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {variantsData.filter(v => v.isActive).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      {de ? 'Keine aktiven Varianten.' : 'No active variants.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVariantDialog(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
        </DialogActions>
      </Dialog>

      <ServiceItemFormDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSaved={handleNewItemSaved}
        defaultName={createDefaultName}
      />

      <QuickCreateCustomerDialog
        open={quickCustOpen}
        onClose={() => setQuickCustOpen(false)}
        onCreated={c => { setCustomerId(c._id); qc.invalidateQueries({ queryKey: ['customers-all'] }); }}
      />
    </Box>
  );
}
