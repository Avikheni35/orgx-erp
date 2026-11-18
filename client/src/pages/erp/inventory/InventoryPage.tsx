import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Stack, TextField, CircularProgress, Alert, InputAdornment,
  Tabs, Tab, Tooltip, Collapse, IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslation } from 'react-i18next';
import { inventoryApi, type InventoryMovement, type StockVariant } from '../../../api/inventory';

function fmtMoney(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €';
}
function fmtDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === 'de-DE' ? 'de-DE' : 'en-GB');
}

function StockChip({ qty, threshold }: { qty: number; threshold: number }) {
  if (qty === 0)         return <Chip size="small" color="error"   label="0 – leer" />;
  if (qty <= threshold)  return <Chip size="small" color="warning" icon={<WarningAmberIcon />} label={qty} />;
  return <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>{qty}</Typography>;
}

function MovTypeChip({ type, de }: { type: InventoryMovement['type']; de: boolean }) {
  if (type === 'purchase') return <Chip size="small" color="success" icon={<TrendingUpIcon />}   label={de ? 'Einkauf'  : 'Purchase'} />;
  if (type === 'sale')     return <Chip size="small" color="primary" icon={<TrendingDownIcon />} label={de ? 'Verkauf'  : 'Sale'} />;
  return                          <Chip size="small"                 icon={<SwapHorizIcon />}    label={de ? 'Korrektur': 'Adjustment'} />;
}

function sourceLink(m: InventoryMovement): string {
  if (m.sourceType === 'VendorInvoice')  return `/erp/einkauf/eingangsrechnungen/${m.sourceId}`;
  if (m.sourceType === 'PurchaseOrder')  return `/erp/einkauf/bestellungen/${m.sourceId}`;
  return `/erp/verkauf/rechnungen/${m.sourceId}`;
}

export default function InventoryPage() {
  const { i18n } = useTranslation();
  const navigate  = useNavigate();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [tab,        setTab]        = useState(0);
  const [search,     setSearch]     = useState('');
  const [movSearch,  setMovSearch]  = useState('');
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn:  () => inventoryApi.listItems(),
  });
  const { data: movData, isLoading: movLoading } = useQuery({
    queryKey: ['inventory-movements'],
    queryFn:  () => inventoryApi.listMovements({ limit: 200 }),
  });

  const products     = stockData?.data?.products     ?? [];
  const variants     = stockData?.data?.variants     ?? [];
  const serviceItems = stockData?.data?.serviceItems ?? [];
  const movements    = movData?.data?.movements      ?? [];

  const variantsByProduct = (productId: string): StockVariant[] =>
    variants.filter(v => v.productId === productId);

  const toggleExpand = (id: string) =>
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const q = search.trim().toLowerCase();
  const filteredProducts = q
    ? products.filter(p => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || (p.categoryName ?? '').toLowerCase().includes(q))
    : products;
  const filteredServices = q
    ? serviceItems.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
    : serviceItems;

  const mq = movSearch.trim().toLowerCase();
  const filteredMov = mq
    ? movements.filter(m =>
        m.itemName.toLowerCase().includes(mq) ||
        m.sourceNumber.toLowerCase().includes(mq) ||
        m.itemCategory.toLowerCase().includes(mq)
      )
    : movements;

  const productCategories = Array.from(new Set(filteredProducts.map(p => p.categoryName || (de ? 'Sonstige' : 'Other')))).sort();
  const serviceCategories = Array.from(new Set(filteredServices.map(s => s.category    || (de ? 'Sonstige' : 'Other')))).sort();

  const lowStockCount = products.filter(p => !p.hasVariants && p.stockQuantity <= p.lowStockThreshold).length
    + variants.filter(v => v.stockQuantity <= v.lowStockThreshold).length;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Lagerverwaltung' : 'Inventory'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de
              ? `${products.length} Produkte · ${serviceItems.length} Leistungen · ${movements.length} Bewegungen`
              : `${products.length} products · ${serviceItems.length} services · ${movements.length} movements`}
          </Typography>
        </Box>
        {lowStockCount > 0 && (
          <Chip
            color="warning"
            icon={<WarningAmberIcon />}
            label={de ? `${lowStockCount} Artikel unter Mindestbestand` : `${lowStockCount} items below threshold`}
          />
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={de ? 'Produkte' : 'Products'} />
        <Tab label={de ? 'Leistungen' : 'Services'} />
        <Tab label={de ? 'Alle Bewegungen' : 'All movements'} />
      </Tabs>

      {/* ── Products stock tab ─────────────────────────────────────── */}
      {tab === 0 && (
        <>
          <Card sx={{ mb: 2, p: 2 }}>
            <TextField
              size="small"
              placeholder={de ? 'Produkt, SKU oder Kategorie suchen…' : 'Search product, SKU or category…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              sx={{ maxWidth: 340 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
          </Card>

          {stockLoading
            ? <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>
            : filteredProducts.length === 0
              ? <Alert severity="info">{de ? 'Keine aktiven Produkte vorhanden.' : 'No active products found.'}</Alert>
              : (
                <Card>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 32 }} />
                        <TableCell>{de ? 'Produkt' : 'Product'}</TableCell>
                        <TableCell>SKU</TableCell>
                        <TableCell>{de ? 'Einheit' : 'Unit'}</TableCell>
                        <TableCell align="right">{de ? 'Bestand' : 'Stock'}</TableCell>
                        <TableCell align="right">{de ? 'Mindestbest.' : 'Threshold'}</TableCell>
                        <TableCell align="right">{de ? 'EK-Preis' : 'Cost price'}</TableCell>
                        <TableCell align="right">{de ? 'Lagerwert' : 'Stock value'}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {productCategories.map(cat => {
                        const catProds = filteredProducts.filter(p => (p.categoryName || (de ? 'Sonstige' : 'Other')) === cat);
                        if (!catProds.length) return null;
                        return (
                          <>
                            <TableRow key={`cat-${cat}`}>
                              <TableCell colSpan={8} sx={{ bgcolor: 'action.hover', py: 0.75 }}>
                                <Typography variant="caption" fontWeight={700} textTransform="uppercase" letterSpacing={0.8} color="text.secondary">
                                  {cat} ({catProds.length})
                                </Typography>
                              </TableCell>
                            </TableRow>
                            {catProds.map(p => {
                              const pvs      = variantsByProduct(p._id);
                              const isOpen   = expanded.has(p._id);
                              const stockVal = p.hasVariants
                                ? pvs.reduce((s, v) => s + v.stockQuantity * v.costPriceCents, 0)
                                : p.stockQuantity * p.costPriceCents;
                              const totalStock = p.hasVariants ? pvs.reduce((s, v) => s + v.stockQuantity, 0) : p.stockQuantity;
                              return (
                                <>
                                  <TableRow
                                    key={p._id}
                                    hover
                                    sx={{ cursor: p.hasVariants ? 'default' : 'pointer' }}
                                    onClick={() => p.hasVariants ? toggleExpand(p._id) : navigate(`/erp/products/${p._id}`)}
                                  >
                                    <TableCell sx={{ width: 32, px: 0.5 }}>
                                      {p.hasVariants && (
                                        <IconButton size="small" onClick={e => { e.stopPropagation(); toggleExpand(p._id); }}>
                                          {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                        </IconButton>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2" fontWeight={500}>{p.name}</Typography>
                                      {p.hasVariants && (
                                        <Typography variant="caption" color="text.secondary">
                                          {pvs.length} {de ? 'Varianten' : 'variants'}
                                        </Typography>
                                      )}
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.sku || '—'}</TableCell>
                                    <TableCell>{p.unit}</TableCell>
                                    <TableCell align="right">
                                      {p.hasVariants
                                        ? <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{totalStock}</Typography>
                                        : <StockChip qty={p.stockQuantity} threshold={p.lowStockThreshold} />}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                                      {p.hasVariants ? '—' : p.lowStockThreshold}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                      {!p.hasVariants && p.costPriceCents > 0 ? fmtMoney(p.costPriceCents, locale) : '—'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                      {stockVal > 0 ? fmtMoney(stockVal, locale) : '—'}
                                    </TableCell>
                                  </TableRow>
                                  {p.hasVariants && (
                                    <TableRow key={`${p._id}-variants`}>
                                      <TableCell colSpan={8} sx={{ p: 0, borderBottom: 0 }}>
                                        <Collapse in={isOpen} unmountOnExit>
                                          <Table size="small">
                                            <TableBody>
                                              {pvs.map(v => {
                                                const attrLabel = Object.values(v.attributes ?? {}).join(' / ') || v.sku;
                                                return (
                                                  <TableRow key={v._id} hover sx={{ cursor: 'pointer', bgcolor: 'action.hover' }}
                                                    onClick={() => navigate(`/erp/products/${p._id}`)}>
                                                    <TableCell sx={{ width: 32 }} />
                                                    <TableCell sx={{ pl: 4 }}>
                                                      <Typography variant="body2" color="text.secondary">{attrLabel}</Typography>
                                                    </TableCell>
                                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{v.sku || '—'}</TableCell>
                                                    <TableCell>{p.unit}</TableCell>
                                                    <TableCell align="right">
                                                      <StockChip qty={v.stockQuantity} threshold={v.lowStockThreshold} />
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                                                      {v.lowStockThreshold}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                                      {v.costPriceCents > 0 ? fmtMoney(v.costPriceCents, locale) : '—'}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                                      {v.stockQuantity * v.costPriceCents > 0 ? fmtMoney(v.stockQuantity * v.costPriceCents, locale) : '—'}
                                                    </TableCell>
                                                  </TableRow>
                                                );
                                              })}
                                            </TableBody>
                                          </Table>
                                        </Collapse>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </>
                              );
                            })}
                          </>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              )}
        </>
      )}

      {/* ── Service items tab ──────────────────────────────────────── */}
      {tab === 1 && (
        <>
          <Card sx={{ mb: 2, p: 2 }}>
            <TextField
              size="small"
              placeholder={de ? 'Artikel oder Kategorie suchen…' : 'Search items or categories…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              sx={{ maxWidth: 320 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
          </Card>

          {stockLoading
            ? <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>
            : filteredServices.length === 0
              ? <Alert severity="info">{de ? 'Keine Leistungen vorhanden.' : 'No service items found.'}</Alert>
              : (
                <Card>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{de ? 'Artikel' : 'Item'}</TableCell>
                        <TableCell>{de ? 'Kategorie' : 'Category'}</TableCell>
                        <TableCell>{de ? 'Einheit' : 'Unit'}</TableCell>
                        <TableCell align="right">{de ? 'Bestand' : 'Stock'}</TableCell>
                        <TableCell align="right">{de ? 'EK (netto)' : 'Cost'}</TableCell>
                        <TableCell align="right">{de ? 'Lagerwert' : 'Stock value'}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {serviceCategories.map(cat => {
                        const catItems = filteredServices.filter(s => (s.category || (de ? 'Sonstige' : 'Other')) === cat);
                        if (!catItems.length) return null;
                        return (
                          <>
                            <TableRow key={`scat-${cat}`}>
                              <TableCell colSpan={6} sx={{ bgcolor: 'action.hover', py: 0.75 }}>
                                <Typography variant="caption" fontWeight={700} textTransform="uppercase" letterSpacing={0.8} color="text.secondary">
                                  {cat} ({catItems.length})
                                </Typography>
                              </TableCell>
                            </TableRow>
                            {catItems.map(item => {
                              const stockVal = item.stockQuantity * item.costPriceCents;
                              return (
                                <TableRow key={item._id} hover sx={{ cursor: 'pointer' }}
                                  onClick={() => navigate(`/erp/lager/${item._id}`)}>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight={500}>{item.name}</Typography>
                                    {item.description && (
                                      <Typography variant="caption" color="text.secondary">{item.description}</Typography>
                                    )}
                                  </TableCell>
                                  <TableCell>{item.category || '—'}</TableCell>
                                  <TableCell>{item.unit}</TableCell>
                                  <TableCell align="right">
                                    <Tooltip title={item.stockQuantity === 0 ? (de ? 'Ausverkauft' : 'Out of stock') : ''}>
                                      <Typography variant="body2" fontWeight={600}
                                        color={item.stockQuantity === 0 ? 'error.main' : 'text.primary'}
                                        sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {item.stockQuantity}
                                      </Typography>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {item.costPriceCents > 0 ? fmtMoney(item.costPriceCents, locale) : '—'}
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {stockVal > 0 ? fmtMoney(stockVal, locale) : '—'}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              )}
        </>
      )}

      {/* ── Movements tab ──────────────────────────────────────────── */}
      {tab === 2 && (
        <>
          <Card sx={{ mb: 2, p: 2 }}>
            <TextField
              size="small"
              placeholder={de ? 'Artikel, Kategorie oder Belegnummer suchen…' : 'Search item, category or document…'}
              value={movSearch}
              onChange={e => setMovSearch(e.target.value)}
              sx={{ maxWidth: 380 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
          </Card>

          {movLoading && <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>}

          {!movLoading && (
            <Card>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                    <TableCell>{de ? 'Art' : 'Type'}</TableCell>
                    <TableCell>{de ? 'Artikel' : 'Item'}</TableCell>
                    <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                    <TableCell>{de ? 'Beleg' : 'Source'}</TableCell>
                    <TableCell align="right">{de ? 'Menge' : 'Qty'}</TableCell>
                    <TableCell align="right">{de ? 'Bestand danach' : 'Stock after'}</TableCell>
                    <TableCell align="right">{de ? 'Wert (netto)' : 'Value (net)'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredMov.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          {de ? 'Keine Lagerbewegungen vorhanden.' : 'No inventory movements yet.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : filteredMov.map(m => (
                    <TableRow key={m._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(sourceLink(m))}>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtDate(m.createdAt, locale)}
                      </TableCell>
                      <TableCell><MovTypeChip type={m.type} de={de} /></TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{m.itemName}</Typography>
                        {m.itemCategory && <Typography variant="caption" color="text.secondary">{m.itemCategory}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{m.lineDescription}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={m.sourceNumber} />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}
                          color={m.quantity > 0 ? 'success.main' : 'error.main'}
                          sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{m.stockAfter}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmtMoney(Math.abs(m.totalCents), locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {!movLoading && filteredMov.length === 0 && !movSearch && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {de
                ? 'Lagerbewegungen werden automatisch erstellt, wenn Bestellungen eingehen oder Rechnungen gebucht werden.'
                : 'Inventory movements are created automatically when purchase orders are received or invoices are posted.'}
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}
