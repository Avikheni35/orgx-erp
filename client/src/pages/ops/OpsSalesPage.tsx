import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { APP_NAME } from '@/config/brand';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, IconButton, Paper, Divider,
  CircularProgress, Alert, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Table, TableHead, TableRow,
  TableCell, TableBody, Chip, ButtonBase, InputAdornment,
  Collapse,
} from '@mui/material';
import AddIcon                from '@mui/icons-material/Add';
import RemoveIcon             from '@mui/icons-material/Remove';
import DeleteOutlineIcon      from '@mui/icons-material/DeleteOutline';
import PointOfSaleIcon        from '@mui/icons-material/PointOfSale';
import MoneyIcon              from '@mui/icons-material/Money';
import AccountBalanceIcon     from '@mui/icons-material/AccountBalance';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TrendingUpIcon         from '@mui/icons-material/TrendingUp';
import EditNoteIcon           from '@mui/icons-material/EditNote';
import ReceiptLongIcon        from '@mui/icons-material/ReceiptLong';
import SearchIcon             from '@mui/icons-material/Search';
import QrCodeScannerIcon      from '@mui/icons-material/QrCodeScanner';
import PrintIcon              from '@mui/icons-material/Print';
import EmailIcon              from '@mui/icons-material/Email';
import UndoIcon               from '@mui/icons-material/Undo';
import PersonIcon             from '@mui/icons-material/Person';
import PercentIcon            from '@mui/icons-material/Percent';
import AccessTimeIcon         from '@mui/icons-material/AccessTime';
import ArrowBackIcon          from '@mui/icons-material/ArrowBack';
import ShoppingCartIcon       from '@mui/icons-material/ShoppingCart';
import GridViewIcon           from '@mui/icons-material/GridView';
import { productsApi, type Product, type ProductVariant } from '../../api/products';
import { salesInvoicesApi, type LineItemInput, type SalesInvoice } from '../../api/salesInvoices';
import { customersApi, type Customer } from '../../api/customers';
import { shiftsApi, type Shift } from '../../api/shifts';
import { useTranslation } from 'react-i18next';

const MONO         = '"JetBrains Mono", "Courier New", monospace';
const ACCENT       = '#e8801a';
const ACCENT_HOVER = '#c96a12';
const ACCENT_MUTED = 'rgba(232, 128, 26, 0.08)';

function fmtCents(cents: number, locale = 'de-DE') {
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
}
function fmtTime(iso: string, locale = 'de-DE') {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(from: string) {
  const ms = Date.now() - new Date(from).getTime();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface SaleLine {
  product:        Product;
  variant?:       ProductVariant;
  qty:            number;
  unitPriceCents: number;
  vatRate:        number;
  discountPct:    number;
}

function effectivePrice(line: SaleLine) {
  return Math.round(line.unitPriceCents * (1 - line.discountPct / 100));
}

function openPrintReceipt(opts: {
  invoiceNumber: string; lines: SaleLine[]; totalGross: number;
  paymentMethod: string; changeDue: number; locale: string; storeName: string;
}) {
  const { invoiceNumber, lines, totalGross, paymentMethod, changeDue, locale, storeName } = opts;
  const now = new Date().toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  const fmt = (c: number) => (c / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  const itemRows = lines.map(l => {
    const ep = effectivePrice(l);
    const name = l.variant
      ? `${l.product.name} (${Object.values(l.variant.attributes).join('/')})`
      : l.product.name;
    return `<tr><td>${name}</td><td class="r">${l.qty}×${fmt(ep)}</td><td class="r">${fmt(ep * l.qty)}</td></tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body{font-family:monospace;font-size:13px;margin:0;padding:12px;width:280px}
    h1{text-align:center;font-size:15px;margin:0 0 4px}
    .center{text-align:center;font-size:11px;color:#555}
    .divider{border:none;border-top:1px dashed #999;margin:8px 0}
    table{width:100%;border-collapse:collapse}
    td{padding:2px 0;vertical-align:top}.r{text-align:right}
    .total-row td{font-weight:bold;font-size:15px;padding-top:6px}
    .footer{text-align:center;margin-top:12px;font-size:11px;color:#555}
  </style></head><body>
  <h1>${storeName}</h1><div class="center">${now}</div>
  <div class="center">${invoiceNumber}</div><hr class="divider">
  <table>${itemRows}</table><hr class="divider">
  <table>
    <tr class="total-row"><td>TOTAL</td><td class="r">${fmt(totalGross)}</td></tr>
    <tr><td>${paymentMethod}</td></tr>
    ${changeDue > 0 ? `<tr><td>Change</td><td class="r">${fmt(changeDue)}</td></tr>` : ''}
  </table>
  <div class="footer">Thank you!</div></body></html>`;
  const w = window.open('', '_blank', 'width=360,height=600');
  if (!w) return;
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => { w.print(); w.close(); }, 300);
}

// ── Product tile ──────────────────────────────────────────────────────────────
function ProductTile({ p, locale, de, onClick }: { p: Product; locale: string; de: boolean; onClick: () => void }) {
  const stock      = p.hasVariants ? null : p.stockQuantity;
  const outOfStock = !p.hasVariants && stock === 0;
  return (
    <ButtonBase
      onClick={onClick}
      disabled={outOfStock}
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper', width: '100%', textAlign: 'left',
        opacity: outOfStock ? 0.4 : 1,
        transition: 'all 0.14s ease',
        '&:hover:not(:disabled)': { borderColor: ACCENT, bgcolor: ACCENT_MUTED, boxShadow: `0 4px 14px rgba(0,0,0,0.08)` },
        '&:active:not(:disabled)': { transform: 'scale(0.98)' },
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, mb: 0.75, color: 'text.primary', width: '100%' }} noWrap>
        {p.name}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%', gap: 0.5 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: ACCENT, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {fmtCents(p.defaultUnitPriceCents, locale)}
        </Typography>
        <Typography sx={{ fontSize: 10, fontWeight: 600, lineHeight: 1, color: outOfStock ? 'error.main' : stock !== null && stock <= p.lowStockThreshold ? 'warning.main' : 'text.disabled' }}>
          {outOfStock ? (de ? 'Leer' : 'N/A') : stock !== null ? `${stock}` : (de ? 'Var.' : 'var.')}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

// ── Cart line row ─────────────────────────────────────────────────────────────
function CartLine({ line, idx, de, locale, onAdjust, onRemove, onDiscount, discountOpen, onDiscountToggle }: {
  line: SaleLine; idx: number; de: boolean; locale: string;
  onAdjust: (d: number) => void; onRemove: () => void;
  onDiscount: (pct: number) => void; discountOpen: boolean; onDiscountToggle: () => void;
}) {
  return (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: 1.5, py: 1.25 }}>
        {/* qty stepper */}
        <Stack direction="row" alignItems="center" sx={{ height: 32, borderRadius: 1.5, bgcolor: 'action.hover', overflow: 'hidden', flexShrink: 0 }}>
          <IconButton size="small" onClick={() => onAdjust(-1)} sx={{ borderRadius: 0, px: 1, height: '100%', color: 'text.secondary', '&:hover': { color: ACCENT, bgcolor: ACCENT_MUTED } }}>
            <RemoveIcon sx={{ fontSize: 13 }} />
          </IconButton>
          <Typography sx={{ minWidth: 28, textAlign: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 14, userSelect: 'none' }}>
            {line.qty}
          </Typography>
          <IconButton size="small" onClick={() => onAdjust(+1)} sx={{ borderRadius: 0, px: 1, height: '100%', color: 'text.secondary', '&:hover': { color: ACCENT, bgcolor: ACCENT_MUTED } }}>
            <AddIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Stack>

        {/* product name + meta */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: 13 }}>{line.product.name}</Typography>
          {line.variant && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
              {Object.values(line.variant.attributes).join(' / ')}
            </Typography>
          )}
          <Stack direction="row" alignItems="center" gap={0.5}>
            <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.secondary' }}>
              {fmtCents(line.unitPriceCents, locale)} · {line.vatRate}%
            </Typography>
            {line.discountPct > 0 && (
              <Chip size="small" label={`-${line.discountPct}%`} color="warning" sx={{ height: 14, fontSize: 9, fontWeight: 700 }} />
            )}
          </Stack>
          <Collapse in={discountOpen}>
            <Stack direction="row" alignItems="center" gap={0.75} mt={0.75}>
              <TextField
                size="small" type="number"
                label={de ? 'Rabatt %' : 'Discount %'}
                value={line.discountPct || ''}
                onChange={e => onDiscount(Number(e.target.value))}
                inputProps={{ min: 0, max: 100, style: { fontFamily: MONO, width: 52 } }}
                sx={{ width: 100, '& .MuiInputBase-root': { height: 28, fontSize: 12 } }}
              />
              {line.discountPct > 0 && (
                <Typography sx={{ fontFamily: MONO, fontSize: 11, color: ACCENT, fontWeight: 700 }}>
                  → {fmtCents(effectivePrice(line), locale)}
                </Typography>
              )}
            </Stack>
          </Collapse>
        </Box>

        {/* discount toggle */}
        <IconButton size="small" onClick={onDiscountToggle} sx={{ color: line.discountPct > 0 ? 'warning.main' : 'text.disabled', '&:hover': { color: 'warning.main' }, p: 0.4 }}>
          <PercentIcon sx={{ fontSize: 13 }} />
        </IconButton>

        {/* line total */}
        <Typography sx={{ minWidth: 72, textAlign: 'right', fontFamily: MONO, fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {fmtCents(effectivePrice(line) * line.qty, locale)}
        </Typography>

        {/* remove */}
        <IconButton size="small" onClick={onRemove} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' }, p: 0.4, ml: -0.5 }}>
          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>
    </Box>
  );
}

export default function OpsSalesPage() {
  const { i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';
  const qc     = useQueryClient();

  // ── cart state ───────────────────────────────────────────────────────────────
  const [lines,           setLines]           = useState<SaleLine[]>([]);
  const [glAccount,       setGlAccount]       = useState<'1000' | '1200'>('1000');
  const [variantProd,     setVariantProd]     = useState<Product | null>(null);
  const [receipt,         setReceipt]         = useState<{
    invoiceNumber: string; invoiceId: string; totalGrossCents: number;
    changeDue: number; paymentMethod: string; isDraft?: boolean; linesSnapshot: SaleLine[];
  } | null>(null);
  const [errMsg,          setErrMsg]          = useState('');
  const [editingDraftId,  setEditingDraftId]  = useState<string | null>(null);
  const [editingDraftNum, setEditingDraftNum] = useState<string | null>(null);
  const [customerId,      setCustomerId]      = useState<string | null>(null);
  const [search,          setSearch]          = useState('');
  const [scanMode,        setScanMode]        = useState(false);
  const [selectedCat,     setSelectedCat]     = useState<string | null>(null);
  const [tenderInput,     setTenderInput]     = useState('');
  const [discountOpen,    setDiscountOpen]    = useState<Record<number, boolean>>({});
  const [emailDialog,     setEmailDialog]     = useState(false);
  const [emailAddress,    setEmailAddress]    = useState('');
  const [emailSending,    setEmailSending]    = useState(false);
  const [emailOk,         setEmailOk]         = useState(false);
  const [returnDialog,    setReturnDialog]    = useState(false);
  const [returnSearch,    setReturnSearch]    = useState('');
  const [returnSearchQ,   setReturnSearchQ]   = useState('');
  const [returnInvoice,   setReturnInvoice]   = useState<SalesInvoice | null>(null);
  const [returnQtys,      setReturnQtys]      = useState<Record<string, number>>({});
  const [returnErr,       setReturnErr]       = useState('');
  const [shiftDialog,     setShiftDialog]     = useState<'open' | 'close' | null>(null);
  const [shiftFloat,      setShiftFloat]      = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  // ── queries ──────────────────────────────────────────────────────────────────
  const { data: productsRaw } = useQuery({
    queryKey: ['ops-products'],
    queryFn:  () => productsApi.list({ active: 'true' }),
  });
  const products = productsRaw ?? [];

  const { data: variantsRaw, isLoading: variantsLoading } = useQuery({
    queryKey: ['ops-variants', variantProd?._id],
    queryFn:  () => productsApi.listVariants(variantProd!._id),
    enabled:  !!variantProd,
  });
  const variantsList = variantsRaw ?? [];

  const { data: customersRaw } = useQuery({
    queryKey: ['ops-customers'],
    queryFn:  () => customersApi.list({ active: true, limit: 200 }),
  });
  const customers = customersRaw?.data.customers ?? [];

  const { data: draftsData } = useQuery({
    queryKey: ['ops-drafts'],
    queryFn:  () => salesInvoicesApi.list({ status: 'draft', limit: 50 }),
    staleTime: 0,
  });
  const openDrafts = draftsData?.data.invoices ?? [];

  const todayFrom = new Date(); todayFrom.setHours(0, 0, 0, 0);
  const todayTo   = new Date(); todayTo.setHours(23, 59, 59, 999);
  const { data: todaySalesData } = useQuery({
    queryKey: ['ops-today-sales'],
    queryFn:  () => salesInvoicesApi.list({ from: todayFrom.toISOString(), to: todayTo.toISOString(), limit: 100 }),
    staleTime: 0,
  });
  // Include returns (negative totalGrossCents) — they net against revenue and get highlighted red
  const todaySales   = (todaySalesData?.data.invoices ?? []).filter(i => i.status === 'paid');
  const todayRevenue = todaySales.reduce((s, i) => s + i.totalGrossCents, 0);

  const { data: shiftData, refetch: refetchShift } = useQuery({
    queryKey: ['ops-shift'],
    queryFn:  () => shiftsApi.current(),
    refetchInterval: 60_000,
  });
  const currentShift: Shift | null = (shiftData?.data) ?? null;

  useEffect(() => {
    const t = setTimeout(() => setReturnSearchQ(returnSearch), 350);
    return () => clearTimeout(t);
  }, [returnSearch]);

  const { data: returnSearchData, isFetching: returnSearching } = useQuery({
    queryKey: ['ops-return-search', returnSearchQ],
    queryFn:  () => salesInvoicesApi.list({ invoiceNumber: returnSearchQ, status: 'paid', limit: 5 }),
    enabled:  returnSearchQ.length >= 3,
    staleTime: 0,
  });
  const returnResults = returnSearchData?.data.invoices ?? [];

  // ── derived product lists ─────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = products.map(p => p.categoryName).filter(Boolean) as string[];
    return [...new Set(cats)].sort();
  }, [products]);

  const displayProducts = useMemo(() => {
    let result = products;
    if (selectedCat) result = result.filter(p => p.categoryName === selectedCat);
    if (search && !scanMode) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [products, selectedCat, search, scanMode]);

  // ── cart helpers ──────────────────────────────────────────────────────────────
  function addProduct(p: Product) {
    if (p.hasVariants) { setVariantProd(p); return; }
    upsertLine(p, undefined);
  }
  function addVariant(p: Product, v: ProductVariant) {
    setVariantProd(null);
    upsertLine(p, v);
  }
  function upsertLine(product: Product, variant?: ProductVariant) {
    const key   = variant ? variant._id : product._id;
    const price = variant?.unitPriceCents && variant.unitPriceCents > 0
      ? variant.unitPriceCents : product.defaultUnitPriceCents;
    setLines(prev => {
      const idx = prev.findIndex(l => (l.variant?._id ?? l.product._id) === key);
      if (idx >= 0) return prev.map((l, i) => i === idx ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { product, variant, qty: 1, unitPriceCents: price, vatRate: product.vatRate, discountPct: 0 }];
    });
  }
  function adjustQty(idx: number, delta: number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: Math.max(1, l.qty + delta) } : l));
  }
  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx));
    setDiscountOpen(prev => { const n = { ...prev }; delete n[idx]; return n; });
  }
  function setDiscount(idx: number, pct: number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, discountPct: Math.min(100, Math.max(0, pct)) } : l));
  }

  // ── totals ────────────────────────────────────────────────────────────────────
  const totalGross = lines.reduce((s, l) => s + effectivePrice(l) * l.qty, 0);
  const totalNet   = lines.reduce((s, l) => {
    const gross = effectivePrice(l) * l.qty;
    return s + Math.round(gross / (1 + l.vatRate / 100));
  }, 0);
  const totalVat   = totalGross - totalNet;
  const tenderCents = Math.round(parseFloat(tenderInput.replace(',', '.') || '0') * 100);
  const changeDue   = glAccount === '1000' && tenderCents >= totalGross ? tenderCents - totalGross : 0;

  // ── scan ──────────────────────────────────────────────────────────────────────
  const handleScanSubmit = useCallback((sku: string) => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    const match = products.find(p => p.sku?.toLowerCase() === trimmed.toLowerCase());
    if (match) { addProduct(match); setSearch(''); }
    else { setErrMsg(de ? `SKU nicht gefunden: ${trimmed}` : `SKU not found: ${trimmed}`); setSearch(''); }
  }, [products, de]);

  // ── draft load ────────────────────────────────────────────────────────────────
  function loadDraftIntoCart(inv: SalesInvoice) {
    const saleLines: SaleLine[] = inv.lineItems.map(l => ({
      product: {
        _id: l.productId ?? '', name: l.description, unit: l.unit, vatRate: l.vatRate,
        defaultUnitPriceCents: l.unitPriceCents, hasVariants: false, isActive: true,
        stockQuantity: 0, lowStockThreshold: 0, costPriceCents: 0, categoryName: '',
        variantAttributes: [],
      } as unknown as Product,
      qty: l.quantity, unitPriceCents: l.unitPriceCents, vatRate: l.vatRate, discountPct: 0,
    }));
    setLines(saleLines);
    setEditingDraftId(inv._id);
    setEditingDraftNum(inv.invoiceNumber);
    setErrMsg('');
  }

  // ── mutations ─────────────────────────────────────────────────────────────────
  function buildLineItems(): LineItemInput[] {
    return lines.map(l => ({
      productId:      l.product._id,
      variantId:      l.variant?._id,
      description:    l.variant ? `${l.product.name} (${Object.values(l.variant.attributes).join(' / ')})` : l.product.name,
      unit:           l.product.unit || 'Stk',
      quantity:       l.qty,
      unitPriceCents: effectivePrice(l),
      vatRate:        l.vatRate,
    }));
  }

  const mutation = useMutation({
    mutationFn: (draft: boolean) => {
      const items = buildLineItems();
      if (editingDraftId) {
        return draft
          ? salesInvoicesApi.posUpdate(editingDraftId, items).then(r => ({ ...r, _isDraft: true }))
          : salesInvoicesApi.posPay(editingDraftId, glAccount, items).then(r => ({ ...r, _isDraft: false }));
      }
      return salesInvoicesApi.posSale({
        lineItems: items, glAccount, payLater: false, draft,
        customerId: customerId ?? undefined,
      }).then(r => ({ ...r, _isDraft: draft }));
    },
    onSuccess: (res, draft) => {
      const inv        = res.data;
      const isDraftRes = (res as any)._isDraft ?? draft;
      const linesSnap  = [...lines];
      if (isDraftRes) {
        setLines([]); setEditingDraftId(null); setEditingDraftNum(null); setErrMsg('');
        qc.invalidateQueries({ queryKey: ['ops-drafts'] });
        setReceipt({ invoiceNumber: inv.invoiceNumber, invoiceId: inv._id, totalGrossCents: inv.totalGrossCents, changeDue: 0, paymentMethod: '', isDraft: true, linesSnapshot: linesSnap });
      } else {
        const pm = glAccount === '1000' ? (de ? 'Bar' : 'Cash') : (de ? 'Karte/Bank' : 'Card/Bank');
        setReceipt({ invoiceNumber: inv.invoiceNumber, invoiceId: inv._id, totalGrossCents: inv.totalGrossCents, changeDue, paymentMethod: pm, linesSnapshot: linesSnap });
        setLines([]); setEditingDraftId(null); setEditingDraftNum(null); setErrMsg(''); setTenderInput(''); setCustomerId(null);
        qc.invalidateQueries({ queryKey: ['ops-today-sales'] });
        qc.invalidateQueries({ queryKey: ['ops-drafts'] });
        qc.invalidateQueries({ queryKey: ['ops-shift'] });
        qc.invalidateQueries({ queryKey: ['ops-layout-today'] });
      }
    },
    onError: () => setErrMsg(de ? 'Fehler beim Speichern.' : 'Failed to save.'),
  });

  const openShiftMutation = useMutation({
    mutationFn: () => shiftsApi.open({ openingFloatCents: Math.round(parseFloat(shiftFloat.replace(',', '.') || '0') * 100) }),
    onSuccess: () => { setShiftDialog(null); setShiftFloat(''); refetchShift(); },
  });
  const closeShiftMutation = useMutation({
    mutationFn: () => shiftsApi.close({ closingFloatCents: Math.round(parseFloat(shiftFloat.replace(',', '.') || '0') * 100) }),
    onSuccess: () => { setShiftDialog(null); setShiftFloat(''); refetchShift(); },
  });

  const returnMutation = useMutation({
    mutationFn: () => {
      if (!returnInvoice) throw new Error('No invoice');
      const returnLineItems: LineItemInput[] = returnInvoice.lineItems
        .filter(l => (returnQtys[l._id ?? ''] ?? 0) > 0)
        .map(l => ({
          productId: l.productId, variantId: l.variantId, description: l.description,
          unit: l.unit, quantity: returnQtys[l._id ?? ''] ?? 0, unitPriceCents: l.unitPriceCents, vatRate: l.vatRate,
        }));
      return salesInvoicesApi.posReturn({ originalInvoiceId: returnInvoice._id, returnLineItems, glAccount });
    },
    onSuccess: (res) => {
      setReturnDialog(false); setReturnInvoice(null); setReturnQtys({}); setReturnSearch(''); setReturnErr('');
      qc.invalidateQueries({ queryKey: ['ops-today-sales'] });
      alert(`${de ? 'Rückgabe: ' : 'Return: '} ${res.data.invoiceNumber}`);
    },
    onError: () => setReturnErr(de ? 'Fehler bei der Rückgabe.' : 'Return failed.'),
  });

  const cartCount = lines.reduce((s, l) => s + l.qty, 0);
  const showRight = lines.length > 0 || !!receipt;

  // ── layout ────────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ══ LEFT PANEL — Product catalog ══════════════════════════════════════════ */}
      <Box sx={{
        display: { xs: showRight ? 'none' : 'flex', md: 'flex' },
        flexDirection: 'column',
        width: { xs: '100%', md: '55%' },
        borderRight: { md: '1px solid' },
        borderColor: { md: 'divider' },
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}>

        {/* ── toolbar ── */}
        <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>

          {errMsg && <Alert severity="error" sx={{ mb: 1, borderRadius: 1.5, py: 0.5 }} onClose={() => setErrMsg('')}>{errMsg}</Alert>}

          {/* search / scan row */}
          <Stack direction="row" gap={1} mb={1}>
            <Paper elevation={0} sx={{ flex: 1, borderRadius: 1.5, border: '1px solid', borderColor: scanMode ? ACCENT : 'divider', transition: 'border-color 0.15s' }}>
              <TextField
                inputRef={scanRef}
                fullWidth
                size="small"
                placeholder={scanMode
                  ? (de ? 'Barcode + Enter' : 'Barcode + Enter')
                  : (de ? 'Produkt suchen …' : 'Search products …')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && scanMode) { handleScanSubmit(search); } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      {scanMode
                        ? <QrCodeScannerIcon sx={{ fontSize: 18, color: ACCENT }} />
                        : <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                      }
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-notchedOutline': { border: 'none' }, '& .MuiInputBase-root': { fontSize: 14 } }}
              />
            </Paper>

            <IconButton
              onClick={() => { setScanMode(m => !m); setSearch(''); }}
              sx={{
                borderRadius: 1.5, border: '1px solid', flexShrink: 0,
                borderColor: scanMode ? ACCENT : 'divider',
                bgcolor: scanMode ? ACCENT_MUTED : 'transparent',
                color: scanMode ? ACCENT : 'text.secondary',
                '&:hover': { borderColor: ACCENT, color: ACCENT, bgcolor: ACCENT_MUTED },
              }}
              title={de ? 'Scan-Modus' : 'Scan mode'}
            >
              <QrCodeScannerIcon sx={{ fontSize: 18 }} />
            </IconButton>

            {/* shift badge */}
            {currentShift ? (
              <Chip
                icon={<AccessTimeIcon sx={{ fontSize: '13px !important' }} />}
                label={fmtDuration(currentShift.openedAt)}
                color="success" size="small"
                onClick={() => { setShiftFloat(''); setShiftDialog('close'); }}
                sx={{ fontFamily: MONO, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
              />
            ) : (
              <Button size="small" startIcon={<AccessTimeIcon />}
                onClick={() => { setShiftFloat(''); setShiftDialog('open'); }}
                sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary', flexShrink: 0, whiteSpace: 'nowrap', '&:hover': { color: ACCENT } }}>
                {de ? 'Schicht' : 'Shift'}
              </Button>
            )}

            <Button size="small" startIcon={<UndoIcon />}
              onClick={() => { setReturnDialog(true); setReturnSearch(''); setReturnInvoice(null); setReturnErr(''); }}
              sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary', flexShrink: 0, whiteSpace: 'nowrap', '&:hover': { color: ACCENT } }}>
              {de ? 'Rückgabe' : 'Returns'}
            </Button>
          </Stack>

          {/* customer row */}
          <Stack direction="row" alignItems="center" gap={1}>
            <PersonIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
            <Box sx={{ flex: 1 }}>
              <select
                value={customerId ?? ''}
                onChange={e => setCustomerId(e.target.value || null)}
                style={{
                  width: '100%', border: 'none', background: 'transparent', fontSize: 12,
                  color: 'inherit', outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="">{de ? 'Laufkundschaft (Standard)' : 'Walk-in customer (default)'}</option>
                {customers.map(c => (
                  <option key={c._id} value={c._id}>{c.companyName}{c.customerNumber ? ` · ${c.customerNumber}` : ''}</option>
                ))}
              </select>
            </Box>
            {todayRevenue > 0 && (
              <Stack direction="row" alignItems="center" gap={0.5}>
                <TrendingUpIcon sx={{ fontSize: 13, color: 'success.main' }} />
                <Typography sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {fmtCents(todayRevenue, locale)}
                </Typography>
              </Stack>
            )}
          </Stack>
        </Box>

        {/* ── category chips ── */}
        {categories.length > 0 && (
          <Box sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.75, flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Chip
              size="small"
              icon={<GridViewIcon sx={{ fontSize: '13px !important' }} />}
              label={de ? 'Alle' : 'All'}
              onClick={() => setSelectedCat(null)}
              color={selectedCat === null ? 'primary' : 'default'}
              sx={{ fontSize: 11, height: 24, fontWeight: 600, ...(selectedCat === null ? { bgcolor: ACCENT, '& .MuiChip-icon': { color: '#fff' }, color: '#fff' } : {}) }}
            />
            {categories.map(cat => (
              <Chip
                key={cat}
                size="small"
                label={cat}
                onClick={() => setSelectedCat(cat === selectedCat ? null : cat)}
                sx={{
                  fontSize: 11, height: 24, fontWeight: 600,
                  ...(cat === selectedCat ? { bgcolor: ACCENT, color: '#fff' } : {}),
                }}
              />
            ))}
          </Box>
        )}

        {/* ── product grid ── */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
          {displayProducts.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
              <PointOfSaleIcon sx={{ fontSize: 40, opacity: 0.12, display: 'block', mx: 'auto', mb: 1 }} />
              <Typography variant="body2">{de ? 'Keine Produkte gefunden.' : 'No products found.'}</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 1 }}>
              {displayProducts.map(p => (
                <ProductTile key={p._id} p={p} locale={locale} de={de} onClick={() => addProduct(p)} />
              ))}
            </Box>
          )}

          {/* today's sales at bottom of product panel */}
          {todaySales.length > 0 && !search && (
            <Box sx={{ mt: 3 }}>
              <Stack direction="row" alignItems="center" gap={1} mb={1}>
                <Typography sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'text.secondary', fontWeight: 600 }}>
                  {de ? 'Heutige Verkäufe' : "Today's sales"}
                </Typography>
                <Chip label={todaySales.length} size="small" sx={{ height: 16, fontSize: 10 }} />
              </Stack>
              <Paper elevation={1} sx={{ borderRadius: 1.5, overflow: 'hidden' }}>
                {todaySales.slice(0, 8).map((inv, idx) => {
                  const isReturn = inv.totalGrossCents < 0;
                  return (
                    <Box key={inv._id}>
                      {idx > 0 && <Divider />}
                      <Stack direction="row" alignItems="center" gap={1.5} sx={{
                        px: 1.5, py: 1,
                        borderLeft: '3px solid',
                        borderColor: isReturn ? 'error.main' : 'success.main',
                        bgcolor: isReturn ? 'rgba(211,47,47,0.04)' : 'transparent',
                      }}>
                        <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled', minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtTime(inv.createdAt, locale)}
                        </Typography>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" alignItems="center" gap={0.5} flexWrap="wrap">
                            <Typography sx={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: isReturn ? 'error.main' : 'text.primary' }}>
                              {inv.invoiceNumber}
                            </Typography>
                            {isReturn && (
                              <Chip size="small" label={de ? 'Rückgabe' : 'Return'} color="error"
                                sx={{ height: 13, fontSize: 9, fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }} />
                            )}
                          </Stack>
                          {isReturn && inv.originalInvoiceNumber && (
                            <Typography sx={{ fontFamily: MONO, fontSize: 9, color: 'error.light', lineHeight: 1.4 }}>
                              {de ? 'Ref:' : 'Ref:'} {inv.originalInvoiceNumber}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {inv.customerSnapshot?.companyName ?? (de ? 'Laufkunde' : 'Walk-in')}
                          </Typography>
                        </Box>
                        <Typography sx={{
                          fontFamily: MONO, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                          color: isReturn ? 'error.main' : 'text.primary',
                        }}>
                          {isReturn ? '' : ''}{fmtCents(inv.totalGrossCents, locale)}
                        </Typography>
                      </Stack>
                    </Box>
                  );
                })}
              </Paper>
            </Box>
          )}
        </Box>
      </Box>

      {/* ══ RIGHT PANEL — Cart / Receipt ══════════════════════════════════════════ */}
      <Box sx={{
        display: { xs: showRight ? 'flex' : 'none', md: 'flex' },
        flexDirection: 'column',
        width: { xs: '100%', md: '45%' },
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}>

        {/* ── Receipt screen ── */}
        {receipt ? (
          <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3 }}>
            <Box sx={{
              width: 88, height: 88, borderRadius: '50%', mb: 2.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: receipt.isDraft ? 'info.main' : 'success.main',
              boxShadow: receipt.isDraft ? '0 0 0 16px rgba(2,136,209,0.1)' : '0 0 0 16px rgba(76,175,80,0.1)',
            }}>
              {receipt.isDraft
                ? <EditNoteIcon sx={{ fontSize: 44, color: '#fff' }} />
                : <CheckCircleOutlineIcon sx={{ fontSize: 44, color: '#fff' }} />
              }
            </Box>

            <Typography variant="h6" fontWeight={800} gutterBottom letterSpacing={-0.5} textAlign="center">
              {receipt.isDraft ? (de ? 'Entwurf gespeichert' : 'Draft saved') : (de ? 'Verkauf abgeschlossen' : 'Sale complete')}
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.secondary', mb: 0.75, letterSpacing: 1 }}>
              {receipt.invoiceNumber}
            </Typography>
            <Typography sx={{
              fontFamily: MONO, fontSize: 40, fontWeight: 800, lineHeight: 1, mb: 0.5,
              color: receipt.isDraft ? 'info.main' : 'success.main', fontVariantNumeric: 'tabular-nums',
            }}>
              {fmtCents(receipt.totalGrossCents, locale)}
            </Typography>

            {receipt.changeDue > 0 && (
              <Paper elevation={0} sx={{ bgcolor: 'success.50', border: '1px solid', borderColor: 'success.light', borderRadius: 2, px: 2.5, py: 1.25, mb: 2, textAlign: 'center', minWidth: 200 }}>
                <Typography sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'success.dark', mb: 0.5, fontWeight: 600 }}>
                  {de ? 'Rückgeld' : 'Change'}
                </Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: 'success.main', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {fmtCents(receipt.changeDue, locale)}
                </Typography>
              </Paper>
            )}

            {!receipt.isDraft && (
              <Stack direction="row" gap={1} mb={2} width="100%" maxWidth={320}>
                <Button variant="outlined" fullWidth startIcon={<PrintIcon />}
                  onClick={() => openPrintReceipt({ invoiceNumber: receipt.invoiceNumber, lines: receipt.linesSnapshot, totalGross: receipt.totalGrossCents, paymentMethod: receipt.paymentMethod, changeDue: receipt.changeDue, locale, storeName: `${APP_NAME} Store` })}
                  sx={{ borderRadius: 1.5, py: 1.25, fontWeight: 700 }}>
                  {de ? 'Drucken' : 'Print'}
                </Button>
                <Button variant="outlined" fullWidth startIcon={<EmailIcon />}
                  onClick={() => setEmailDialog(true)}
                  sx={{ borderRadius: 1.5, py: 1.25, fontWeight: 700 }}>
                  {de ? 'E-Mail' : 'Email'}
                </Button>
              </Stack>
            )}

            <Button variant="contained" size="large" fullWidth
              onClick={() => { setReceipt(null); setEmailOk(false); }}
              sx={{
                py: 1.75, fontSize: 15, fontWeight: 800, borderRadius: 2,
                bgcolor: ACCENT, '&:hover': { bgcolor: ACCENT_HOVER },
                boxShadow: `0 4px 18px ${ACCENT}45`, maxWidth: 320,
              }}>
              {de ? 'Neuer Verkauf' : 'New sale'}
            </Button>
          </Box>
        ) : (
          <>
            {/* ── Cart header ── */}
            <Box sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
              <Stack direction="row" alignItems="center" gap={1}>
                {/* mobile: back to products */}
                <IconButton
                  size="small"
                  onClick={() => { setLines([]); setReceipt(null); }}
                  sx={{ display: { xs: 'flex', md: 'none' }, color: 'text.secondary', borderRadius: 1, mr: -0.5 }}
                >
                  <ArrowBackIcon sx={{ fontSize: 18 }} />
                </IconButton>

                <ShoppingCartIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography sx={{ fontWeight: 700, fontSize: 13, flex: 1 }}>
                  {de ? 'Warenkorb' : 'Cart'}
                  {cartCount > 0 && (
                    <Typography component="span" sx={{ ml: 0.75, fontFamily: MONO, fontSize: 12, color: ACCENT, fontWeight: 800 }}>
                      ({cartCount})
                    </Typography>
                  )}
                </Typography>

                {editingDraftId && (
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <EditNoteIcon sx={{ fontSize: 13, color: ACCENT }} />
                    <Typography sx={{ fontSize: 11, fontFamily: MONO, color: ACCENT, fontWeight: 600 }}>{editingDraftNum}</Typography>
                    <Button size="small" onClick={() => { setLines([]); setEditingDraftId(null); setEditingDraftNum(null); }}
                      sx={{ fontSize: 10, color: 'text.secondary', minWidth: 0, px: 0.75 }}>
                      ×
                    </Button>
                  </Stack>
                )}

                {lines.length > 0 && (
                  <Button size="small" onClick={() => { setLines([]); setErrMsg(''); }}
                    sx={{ fontSize: 10, color: 'text.secondary', '&:hover': { color: 'error.main' }, minWidth: 0, px: 1 }}>
                    {de ? 'Leeren' : 'Clear'}
                  </Button>
                )}
              </Stack>
            </Box>

            {/* ── Cart body ── */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {lines.length === 0 ? (
                <Box>
                  <Box sx={{ textAlign: 'center', py: 5, color: 'text.disabled' }}>
                    <ShoppingCartIcon sx={{ fontSize: 40, opacity: 0.1, display: 'block', mx: 'auto', mb: 1 }} />
                    <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: 13 }}>
                      {de ? 'Produkt auswählen, um zu starten' : 'Select a product to start'}
                    </Typography>
                  </Box>

                  {/* open drafts in empty cart */}
                  {openDrafts.length > 0 && (
                    <Box sx={{ px: 1.5, pb: 2 }}>
                      <Stack direction="row" alignItems="center" gap={0.75} mb={1}>
                        <ReceiptLongIcon sx={{ fontSize: 13, color: 'warning.main' }} />
                        <Typography sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'warning.dark', fontWeight: 700 }}>
                          {de ? 'Offene Entwürfe' : 'Open drafts'}
                        </Typography>
                        <Chip label={openDrafts.length} size="small" color="warning" sx={{ height: 16, fontSize: 10, fontWeight: 700 }} />
                      </Stack>
                      <Paper elevation={1} sx={{ borderRadius: 1.5, overflow: 'hidden', border: '1px solid', borderColor: 'warning.light' }}>
                        {openDrafts.map((inv, idx) => (
                          <Box key={inv._id}>
                            {idx > 0 && <Divider sx={{ borderColor: 'warning.light' }} />}
                            <Stack direction="row" alignItems="center" gap={1.5}
                              sx={{ px: 1.5, py: 1.25, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(237,108,2,0.05)' } }}
                              onClick={() => loadDraftIntoCart(inv)}>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: 'warning.dark' }}>{inv.invoiceNumber}</Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>{inv.lineItems.map(l => l.description).join(', ')}</Typography>
                              </Box>
                              <Typography sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'warning.dark', flexShrink: 0 }}>
                                {fmtCents(inv.totalGrossCents, locale)}
                              </Typography>
                            </Stack>
                          </Box>
                        ))}
                      </Paper>
                    </Box>
                  )}
                </Box>
              ) : (
                <>
                  {lines.map((line, idx) => (
                    <CartLine
                      key={idx}
                      line={line} idx={idx} de={de} locale={locale}
                      onAdjust={d => adjustQty(idx, d)}
                      onRemove={() => removeLine(idx)}
                      onDiscount={pct => setDiscount(idx, pct)}
                      discountOpen={!!discountOpen[idx]}
                      onDiscountToggle={() => setDiscountOpen(p => ({ ...p, [idx]: !p[idx] }))}
                    />
                  ))}

                  {/* totals */}
                  <Box sx={{ px: 1.5, py: 1.5, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" justifyContent="space-between" mb={0.4}>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{de ? 'Netto' : 'Net'}</Typography>
                      <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{fmtCents(totalNet, locale)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>MwSt</Typography>
                      <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{fmtCents(totalVat, locale)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline" mt={1}>
                      <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{de ? 'Gesamt' : 'Total'}</Typography>
                      <Typography sx={{ fontFamily: MONO, fontWeight: 800, fontSize: 28, fontVariantNumeric: 'tabular-nums', color: ACCENT, lineHeight: 1 }}>
                        {fmtCents(totalGross, locale)}
                      </Typography>
                    </Stack>
                  </Box>
                </>
              )}
            </Box>

            {/* ── Payment footer ── */}
            <Box sx={{ flexShrink: 0, p: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>

              {/* Cash / Card toggle */}
              <Stack direction="row" gap={1} mb={1.25}>
                <Button
                  fullWidth variant={glAccount === '1000' ? 'contained' : 'outlined'}
                  startIcon={<MoneyIcon />}
                  onClick={() => { setGlAccount('1000'); setTenderInput(''); }}
                  sx={{
                    py: 1.25, fontWeight: 700, fontSize: 13, borderRadius: 1.5,
                    ...(glAccount === '1000' ? { bgcolor: ACCENT, '&:hover': { bgcolor: ACCENT_HOVER }, boxShadow: `0 3px 10px ${ACCENT}40` } : { borderColor: 'divider', color: 'text.secondary' }),
                  }}
                >
                  {de ? 'Bar' : 'Cash'}
                </Button>
                <Button
                  fullWidth variant={glAccount === '1200' ? 'contained' : 'outlined'}
                  startIcon={<AccountBalanceIcon />}
                  onClick={() => { setGlAccount('1200'); setTenderInput(''); }}
                  sx={{
                    py: 1.25, fontWeight: 700, fontSize: 13, borderRadius: 1.5,
                    ...(glAccount === '1200' ? { bgcolor: ACCENT, '&:hover': { bgcolor: ACCENT_HOVER }, boxShadow: `0 3px 10px ${ACCENT}40` } : { borderColor: 'divider', color: 'text.secondary' }),
                  }}
                >
                  {de ? 'Karte' : 'Card'}
                </Button>
              </Stack>

              {/* Cash tender */}
              {glAccount === '1000' && lines.length > 0 && (
                <Paper elevation={0} sx={{ mb: 1.25, px: 1.5, py: 1.25, borderRadius: 1.5, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" alignItems="center" gap={1.5}>
                    <TextField
                      size="small" label={de ? 'Gegeben (€)' : 'Tendered (€)'}
                      value={tenderInput}
                      onChange={e => setTenderInput(e.target.value)}
                      placeholder={`${(totalGross / 100).toFixed(2)}`}
                      inputProps={{ inputMode: 'decimal', style: { fontFamily: MONO, fontSize: 18, fontWeight: 700, width: 100 } }}
                      sx={{ '& .MuiInputBase-root': { height: 42 } }}
                    />
                    {tenderCents >= totalGross && tenderCents > 0 && (
                      <Box sx={{ flex: 1, textAlign: 'right' }}>
                        <Typography sx={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'success.dark', fontWeight: 600 }}>
                          {de ? 'Rückgeld' : 'Change'}
                        </Typography>
                        <Typography sx={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: 'success.main', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                          {fmtCents(changeDue, locale)}
                        </Typography>
                      </Box>
                    )}
                    {tenderCents > 0 && tenderCents < totalGross && (
                      <Box sx={{ flex: 1, textAlign: 'right' }}>
                        <Typography sx={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'error.main', fontWeight: 600 }}>
                          {de ? 'Fehlbetrag' : 'Short'}
                        </Typography>
                        <Typography sx={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: 'error.main', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                          {fmtCents(totalGross - tenderCents, locale)}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </Paper>
              )}

              {/* Draft + Pay */}
              <Stack direction="row" gap={1}>
                <Button
                  variant="outlined" size="large"
                  startIcon={<EditNoteIcon />}
                  disabled={mutation.isPending || lines.length === 0}
                  onClick={() => mutation.mutate(true)}
                  sx={{
                    py: 1.5, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, borderRadius: 1.5,
                    borderStyle: 'dashed', borderColor: 'divider', color: 'text.secondary',
                    '&:hover:not(:disabled)': { borderStyle: 'dashed', borderColor: ACCENT, color: ACCENT, bgcolor: ACCENT_MUTED },
                  }}
                >
                  {de ? 'Entwurf' : 'Draft'}
                </Button>
                <Button
                  variant="contained" fullWidth size="large"
                  startIcon={mutation.isPending ? <CircularProgress size={17} color="inherit" /> : <PointOfSaleIcon />}
                  disabled={mutation.isPending || lines.length === 0 || (glAccount === '1000' && tenderInput.length > 0 && tenderCents < totalGross)}
                  onClick={() => mutation.mutate(false)}
                  sx={{
                    py: 1.5, fontSize: 16, fontWeight: 800, letterSpacing: 0.3, borderRadius: 1.5, fontFamily: MONO,
                    bgcolor: ACCENT, '&:hover': { bgcolor: ACCENT_HOVER },
                    boxShadow: `0 4px 20px ${ACCENT}45`,
                    '&:disabled': { bgcolor: 'action.disabledBackground', boxShadow: 'none' },
                  }}
                >
                  {lines.length === 0
                    ? (de ? 'Bezahlen' : 'Pay')
                    : (de ? `Bezahlen  ${fmtCents(totalGross, locale)}` : `Pay  ${fmtCents(totalGross, locale)}`)
                  }
                </Button>
              </Stack>
            </Box>
          </>
        )}
      </Box>

      {/* ── Variant picker dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!variantProd} onClose={() => setVariantProd(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 15 }}>
          {de ? 'Variante wählen' : 'Select variant'}{variantProd ? ` — ${variantProd.name}` : ''}
        </DialogTitle>
        <DialogContent sx={{ px: 2, pb: 2 }}>
          {variantsLoading ? (
            <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {variantProd?.variantAttributes.map(a => (
                    <TableCell key={a} sx={{ fontWeight: 700, fontSize: 12 }}>{a}</TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12 }}>{de ? 'Preis' : 'Price'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12 }}>{de ? 'Bestand' : 'Stock'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {variantsList.filter(v => v.isActive).map(v => (
                  <TableRow key={v._id} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: ACCENT_MUTED } }}
                    onClick={() => variantProd && addVariant(variantProd, v)}>
                    {variantProd?.variantAttributes.map(a => (
                      <TableCell key={a} sx={{ fontSize: 13 }}>{v.attributes[a] ?? '—'}</TableCell>
                    ))}
                    <TableCell align="right" sx={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600 }}>
                      {fmtCents(v.unitPriceCents > 0 ? v.unitPriceCents : (variantProd?.defaultUnitPriceCents ?? 0), locale)}
                    </TableCell>
                    <TableCell align="right">
                      <Chip size="small" label={v.stockQuantity}
                        color={v.stockQuantity > (v.lowStockThreshold ?? 0) ? 'success' : v.stockQuantity > 0 ? 'warning' : 'error'}
                        sx={{ fontFamily: MONO, fontWeight: 700 }} />
                    </TableCell>
                  </TableRow>
                ))}
                {variantsList.filter(v => v.isActive).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      {de ? 'Keine aktiven Varianten' : 'No active variants'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Returns dialog ────────────────────────────────────────────────────── */}
      <Dialog open={returnDialog} onClose={() => setReturnDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 15 }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <UndoIcon sx={{ color: ACCENT }} />
            {de ? 'Rückgabe verarbeiten' : 'Process return'}
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ px: 2 }}>
          {returnErr && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setReturnErr('')}>{returnErr}</Alert>}
          <TextField
            fullWidth size="small" autoFocus
            placeholder={de ? 'Rechnungsnummer (mind. 3 Zeichen)' : 'Invoice number (min 3 chars)'}
            value={returnSearch}
            onChange={e => { setReturnSearch(e.target.value); setReturnInvoice(null); if (!e.target.value) setReturnSearchQ(''); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }}
            sx={{ mb: 2 }}
          />
          {returnSearching && <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={20} /></Box>}
          {!returnInvoice && returnResults.length > 0 && (
            <Paper elevation={1} sx={{ borderRadius: 1.5, overflow: 'hidden', mb: 2 }}>
              {returnResults.map((inv, idx) => (
                <Box key={inv._id}>
                  {idx > 0 && <Divider />}
                  <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 2, py: 1.25, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                    onClick={() => {
                      setReturnInvoice(inv);
                      const qtys: Record<string, number> = {};
                      inv.lineItems.forEach(l => { if (l._id) qtys[l._id] = l.quantity; });
                      setReturnQtys(qtys);
                    }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{inv.invoiceNumber}</Typography>
                      <Typography variant="caption" color="text.secondary">{new Date(inv.invoiceDate).toLocaleDateString(locale)}</Typography>
                    </Box>
                    <Typography sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{fmtCents(inv.totalGrossCents, locale)}</Typography>
                  </Stack>
                </Box>
              ))}
            </Paper>
          )}
          {returnInvoice && (
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
                <Typography sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: ACCENT }}>{returnInvoice.invoiceNumber}</Typography>
                <Button size="small" onClick={() => { setReturnInvoice(null); setReturnQtys({}); }}>{de ? 'Ändern' : 'Change'}</Button>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>{de ? 'Artikel' : 'Item'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>{de ? 'Preis' : 'Price'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11 }}>{de ? 'Rückgabe' : 'Return qty'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {returnInvoice.lineItems.map(l => (
                    <TableRow key={l._id}>
                      <TableCell sx={{ fontSize: 12 }}>{l.description}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: MONO, fontSize: 12 }}>{fmtCents(l.unitPriceCents, locale)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={0.5}>
                          <IconButton size="small" onClick={() => setReturnQtys(p => ({ ...p, [l._id ?? '']: Math.max(0, (p[l._id ?? ''] ?? 0) - 1) }))}><RemoveIcon sx={{ fontSize: 13 }} /></IconButton>
                          <Typography sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, minWidth: 22, textAlign: 'center' }}>{returnQtys[l._id ?? ''] ?? 0}</Typography>
                          <IconButton size="small" onClick={() => setReturnQtys(p => ({ ...p, [l._id ?? '']: Math.min(l.quantity, (p[l._id ?? ''] ?? 0) + 1) }))}><AddIcon sx={{ fontSize: 13 }} /></IconButton>
                          <Typography variant="caption" color="text.secondary">/ {l.quantity}</Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {Object.values(returnQtys).some(q => q > 0) && (
                <Box sx={{ mt: 2, p: 1.5, bgcolor: 'error.50', borderRadius: 1.5, border: '1px solid', borderColor: 'error.light' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'error.dark' }}>{de ? 'Rückerstattung' : 'Refund total'}</Typography>
                    <Typography sx={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: 'error.main', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCents(returnInvoice.lineItems.reduce((s, l) => s + (returnQtys[l._id ?? ''] ?? 0) * l.unitPriceCents, 0), locale)}
                    </Typography>
                  </Stack>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setReturnDialog(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained"
            disabled={!returnInvoice || !Object.values(returnQtys).some(q => q > 0) || returnMutation.isPending}
            startIcon={returnMutation.isPending ? <CircularProgress size={13} color="inherit" /> : <UndoIcon />}
            onClick={() => returnMutation.mutate()}
            sx={{ bgcolor: 'error.main', '&:hover': { bgcolor: 'error.dark' }, borderRadius: 1.5, fontWeight: 700 }}>
            {de ? 'Rückgabe bestätigen' : 'Confirm return'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Email receipt dialog ───────────────────────────────────────────────── */}
      <Dialog open={emailDialog} onClose={() => setEmailDialog(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 15 }}>{de ? 'Beleg per E-Mail' : 'Email receipt'}</DialogTitle>
        <DialogContent>
          {emailOk
            ? <Alert severity="success">{de ? 'E-Mail gesendet!' : 'Email sent!'}</Alert>
            : <TextField fullWidth autoFocus size="small" label={de ? 'E-Mail-Adresse' : 'Email address'} type="email" value={emailAddress} onChange={e => setEmailAddress(e.target.value)} sx={{ mt: 1 }} />
          }
        </DialogContent>
        {!emailOk && (
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEmailDialog(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
            <Button variant="contained" disabled={!emailAddress || emailSending}
              startIcon={emailSending ? <CircularProgress size={13} color="inherit" /> : undefined}
              onClick={async () => {
                setEmailSending(true);
                try {
                  if (receipt) await salesInvoicesApi.sendEmail(receipt.invoiceId, { to: emailAddress });
                  setEmailOk(true);
                } catch { /* ignore */ } finally { setEmailSending(false); }
              }}
              sx={{ bgcolor: ACCENT, '&:hover': { bgcolor: ACCENT_HOVER } }}>
              {de ? 'Senden' : 'Send'}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      {/* ── Shift dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={!!shiftDialog} onClose={() => setShiftDialog(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 14 }}>
          {shiftDialog === 'open' ? (de ? 'Schicht starten' : 'Start shift') : (de ? 'Schicht abschließen' : 'Close shift')}
        </DialogTitle>
        <DialogContent>
          {shiftDialog === 'close' && currentShift && (
            <Box sx={{ mb: 2, p: 1.25, bgcolor: 'action.hover', borderRadius: 1.5 }}>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                {de ? 'Gestartet' : 'Started'}: {fmtTime(currentShift.openedAt, locale)}
                {'  ·  '}
                {de ? 'Float' : 'Opening float'}: {fmtCents(currentShift.openingFloatCents, locale)}
              </Typography>
            </Box>
          )}
          <TextField fullWidth size="small" autoFocus
            label={shiftDialog === 'open' ? (de ? 'Kassenfloat (€)' : 'Opening float (€)') : (de ? 'Kassenstand (€)' : 'Closing cash (€)')}
            value={shiftFloat}
            onChange={e => setShiftFloat(e.target.value)}
            inputProps={{ inputMode: 'decimal', style: { fontFamily: MONO, fontSize: 18, fontWeight: 700 } }}
            placeholder="0,00" sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setShiftDialog(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained"
            disabled={openShiftMutation.isPending || closeShiftMutation.isPending}
            onClick={() => shiftDialog === 'open' ? openShiftMutation.mutate() : closeShiftMutation.mutate()}
            sx={{ bgcolor: shiftDialog === 'close' ? 'error.main' : ACCENT, '&:hover': { bgcolor: shiftDialog === 'close' ? 'error.dark' : ACCENT_HOVER }, borderRadius: 1.5, fontWeight: 700 }}>
            {shiftDialog === 'open' ? (de ? 'Starten' : 'Start') : (de ? 'Schließen' : 'Close')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
