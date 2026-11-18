import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, TextField, Stack, Paper, Chip, Collapse,
  IconButton, InputAdornment, CircularProgress, Divider,
} from '@mui/material';
import SearchIcon       from '@mui/icons-material/Search';
import ExpandMoreIcon   from '@mui/icons-material/ExpandMore';
import ExpandLessIcon   from '@mui/icons-material/ExpandLess';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { inventoryApi } from '../../api/inventory';
import { useTranslation } from 'react-i18next';

const MONO = '"JetBrains Mono", "Courier New", monospace';

function fmtCents(cents: number, locale = 'de-DE') {
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
}

function StockBadge({ qty, threshold }: { qty: number; threshold: number }) {
  if (qty === 0) return (
    <Chip size="small" color="error" icon={<ErrorOutlineIcon />} label="0"
      sx={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, height: 28, px: 0.5 }}
    />
  );
  if (qty <= threshold) return (
    <Chip size="small" color="warning" icon={<WarningAmberIcon />} label={qty}
      sx={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, height: 28, px: 0.5 }}
    />
  );
  return (
    <Chip size="small" color="success" label={qty}
      sx={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, height: 28, px: 0.5 }}
    />
  );
}

function urgencyScore(stock: number, threshold: number): number {
  if (stock === 0) return 0;
  if (stock <= threshold) return 1;
  return 2;
}

export default function OpsStockPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: stockData, isLoading } = useQuery({
    queryKey: ['ops-inventory'],
    queryFn:  () => inventoryApi.listItems(),
    refetchInterval: 120_000,
  });

  const products = stockData?.data?.products ?? [];
  const variants = stockData?.data?.variants ?? [];

  const { filtered, outOfStock, lowStock } = useMemo(() => {
    const q = search.toLowerCase();
    const matched = !q ? products : products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.categoryName && p.categoryName.toLowerCase().includes(q)),
    );

    const pvMap = new Map<string, typeof variants>();
    variants.forEach(v => {
      const arr = pvMap.get(v.productId) ?? [];
      arr.push(v);
      pvMap.set(v.productId, arr);
    });

    const withStock = matched.map(p => {
      const pvs    = p.hasVariants ? (pvMap.get(p._id) ?? []) : [];
      const stock  = p.hasVariants ? pvs.reduce((s, v) => s + v.stockQuantity, 0) : p.stockQuantity;
      const thresh = p.hasVariants
        ? Math.max(...pvs.map(v => v.lowStockThreshold ?? 0), 0)
        : p.lowStockThreshold;
      return { ...p, _pvs: pvs, _totalStock: stock, _threshold: thresh };
    });

    withStock.sort((a, b) => urgencyScore(a._totalStock, a._threshold) - urgencyScore(b._totalStock, b._threshold));

    const outOfStock = withStock.filter(p => p._totalStock === 0).length;
    const lowStock   = withStock.filter(p => p._totalStock > 0 && p._totalStock <= p._threshold).length;

    return { filtered: withStock, outOfStock, lowStock, pvMap };
  }, [products, variants, search]);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: { xs: 1.5, sm: 2.5 } }}>
    <Box sx={{ maxWidth: 680, mx: 'auto' }}>

      {/* alert banner */}
      {(outOfStock > 0 || lowStock > 0) && (
        <Paper elevation={2} sx={{ mb: 2.5, borderRadius: 2, overflow: 'hidden' }}>
          {outOfStock > 0 && (
            <Stack direction="row" alignItems="center" gap={1.5} sx={{
              px: 2, py: 1.5,
              bgcolor: 'error.light',
              borderLeft: '4px solid',
              borderColor: 'error.main',
            }}>
              <ErrorOutlineIcon sx={{ color: 'error.dark', flexShrink: 0 }} />
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'error.dark' }}>
                  {outOfStock} {de ? 'Artikel ausverkauft' : outOfStock === 1 ? 'item out of stock' : 'items out of stock'}
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'error.dark', opacity: 0.72 }}>
                  {de ? 'Nachbestellung erforderlich' : 'Reorder required'}
                </Typography>
              </Box>
            </Stack>
          )}
          {lowStock > 0 && (
            <Stack direction="row" alignItems="center" gap={1.5} sx={{
              px: 2, py: 1.5,
              bgcolor: 'warning.light',
              borderLeft: '4px solid',
              borderColor: 'warning.main',
              borderTop: outOfStock > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
            }}>
              <WarningAmberIcon sx={{ color: 'warning.dark', flexShrink: 0 }} />
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'warning.dark' }}>
                  {lowStock} {de ? 'Artikel fast ausverkauft' : lowStock === 1 ? 'item running low' : 'items running low'}
                </Typography>
              </Box>
            </Stack>
          )}
        </Paper>
      )}

      {/* search */}
      <Paper elevation={2} sx={{ mb: 2.5, borderRadius: 2, overflow: 'hidden' }}>
        <TextField
          fullWidth
          size="medium"
          placeholder={de ? 'Produkt suchen (Name, SKU …)' : 'Search (name, SKU …)'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            '& .MuiInputBase-root': { fontSize: 15 },
          }}
        />
      </Paper>

      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
          <Typography>{de ? 'Keine Produkte gefunden.' : 'No products found.'}</Typography>
        </Box>
      ) : (
        <Paper elevation={2} sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {filtered.map((p, idx) => {
            const pvs    = p._pvs;
            const isOpen = expanded.has(p._id);
            const stock  = p._totalStock;

            const rowBg = stock === 0
              ? 'rgba(211,47,47,0.04)'
              : stock <= p._threshold
                ? 'rgba(237,108,2,0.04)'
                : 'transparent';

            return (
              <Box key={p._id}>
                {idx > 0 && <Divider />}

                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1.5}
                  sx={{
                    px: 2, py: 1.75,
                    cursor: p.hasVariants ? 'pointer' : 'default',
                    bgcolor: rowBg,
                    transition: 'background 0.1s',
                    '&:hover': p.hasVariants ? { bgcolor: 'action.hover' } : {},
                    borderLeft: '3px solid',
                    borderColor: stock === 0 ? 'error.main' : stock <= p._threshold ? 'warning.main' : 'transparent',
                  }}
                  onClick={() => p.hasVariants && toggle(p._id)}
                >
                  {p.hasVariants && (
                    <IconButton size="small" onClick={e => { e.stopPropagation(); toggle(p._id); }} sx={{ flexShrink: 0, color: 'text.secondary' }}>
                      {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>
                  )}

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" fontWeight={600} noWrap sx={{ lineHeight: 1.3 }}>{p.name}</Typography>
                    <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" mt={0.25}>
                      {p.sku && (
                        <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.secondary' }}>{p.sku}</Typography>
                      )}
                      {p.categoryName && (
                        <Chip label={p.categoryName} size="small" sx={{ height: 16, fontSize: 10, fontWeight: 500 }} />
                      )}
                      {p.hasVariants && (
                        <Typography variant="caption" color="text.secondary">
                          {pvs.length} {de ? 'Var.' : 'var.'}
                        </Typography>
                      )}
                    </Stack>
                  </Box>

                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    {p.hasVariants ? (
                      <Chip
                        size="small"
                        label={`${stock} ${p.unit || 'Stk'}`}
                        color={stock === 0 ? 'error' : stock <= p._threshold ? 'warning' : 'success'}
                        sx={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, height: 26 }}
                      />
                    ) : (
                      <StockBadge qty={p.stockQuantity} threshold={p.lowStockThreshold} />
                    )}
                    {p.costPriceCents > 0 && (
                      <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.secondary', display: 'block', mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCents(p.costPriceCents, locale)}
                      </Typography>
                    )}
                  </Box>
                </Stack>

                {/* variant rows */}
                {p.hasVariants && (
                  <Collapse in={isOpen}>
                    <Divider />
                    {pvs.length === 0 ? (
                      <Typography variant="caption" color="text.secondary" sx={{ pl: 5, py: 1.5, display: 'block' }}>
                        {de ? 'Keine Varianten' : 'No variants'}
                      </Typography>
                    ) : pvs.map((v, vi) => (
                      <Box key={v._id}>
                        {vi > 0 && <Divider sx={{ ml: 4 }} />}
                        <Stack direction="row" alignItems="center" gap={1.5} sx={{
                          pl: 5, pr: 2, py: 1.25,
                          bgcolor: v.stockQuantity === 0 ? 'rgba(211,47,47,0.04)' : v.stockQuantity <= (v.lowStockThreshold ?? 0) ? 'rgba(237,108,2,0.04)' : 'transparent',
                        }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={500} color="text.secondary">
                              {Object.values(v.attributes).join(' / ')}
                            </Typography>
                            {v.sku && (
                              <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled' }}>{v.sku}</Typography>
                            )}
                          </Box>
                          <StockBadge qty={v.stockQuantity} threshold={v.lowStockThreshold ?? 0} />
                        </Stack>
                      </Box>
                    ))}
                  </Collapse>
                )}
              </Box>
            );
          })}
        </Paper>
      )}
    </Box>
    </Box>
  );
}
