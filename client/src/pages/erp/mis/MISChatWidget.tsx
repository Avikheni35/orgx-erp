import { useState, useRef, useEffect } from 'react';
import {
  Box, Fab, Paper, Typography, Stack, IconButton, TextField,
  CircularProgress, Tooltip, Divider, Avatar,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonIcon from '@mui/icons-material/Person';
import { useTranslation } from 'react-i18next';
import { misApi } from '../../../api/mis';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function renderMessage(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Strip markdown bold (**text** or __text__)
    const clean = line
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\*(.+?)\*/g, '$1');

    // Numbered list line: "1. foo" or "1) foo"
    const numbered = clean.match(/^(\d+)[.)]\s+(.+)/);
    if (numbered) {
      return (
        <Box key={i} sx={{ display: 'flex', gap: 1, mt: i === 0 ? 0 : 0.5 }}>
          <Box sx={{ minWidth: 20, fontWeight: 600, opacity: 0.6, fontSize: '0.78rem' }}>{numbered[1]}.</Box>
          <Box sx={{ fontSize: '0.82rem' }}>{numbered[2]}</Box>
        </Box>
      );
    }

    // Bullet line: "- foo" or "• foo"
    const bullet = clean.match(/^[-•]\s+(.+)/);
    if (bullet) {
      return (
        <Box key={i} sx={{ display: 'flex', gap: 1, mt: i === 0 ? 0 : 0.5 }}>
          <Box sx={{ opacity: 0.5, fontSize: '0.7rem', mt: '3px' }}>●</Box>
          <Box sx={{ fontSize: '0.82rem' }}>{bullet[1]}</Box>
        </Box>
      );
    }

    // Empty line → small spacer
    if (!clean.trim()) return <Box key={i} sx={{ height: 4 }} />;

    // Normal line
    return <Box key={i} sx={{ fontSize: '0.82rem', mt: i === 0 ? 0 : 0.3 }}>{clean}</Box>;
  });
}

const SUGGESTED = [
  'Welche Produkte verkaufen sich am besten?',
  'Welche Artikel müssen bald nachbestellt werden?',
  'Was ist unsere marge stärkste Produkt?',
  'Welche Kunden haben am meisten gekauft?',
];

export default function MISChatWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    const next: Message[] = [...messages, { role: 'user', content: msg }];
    setMessages(next);
    setLoading(true);
    try {
      const { data } = await misApi.aiChat(msg, messages.slice(-8));
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: t('mis.chatError') }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <Tooltip title={t('mis.chatTooltip')} placement="left">
        <Fab
          onClick={() => setOpen(v => !v)}
          sx={{
            position: 'fixed', bottom: 28, right: 28, zIndex: 1300,
            background: 'linear-gradient(135deg, #4a148c, #7b1fa2)',
            color: '#fff',
            '&:hover': { background: 'linear-gradient(135deg, #38006b, #6a1b9a)' },
            boxShadow: '0 4px 20px rgba(74,20,140,0.4)',
          }}
        >
          {open ? <CloseIcon /> : <SmartToyIcon />}
        </Fab>
      </Tooltip>

      {/* Chat panel */}
      {open && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed', bottom: 96, right: 28, zIndex: 1299,
            width: { xs: 'calc(100vw - 56px)', sm: 380 },
            height: 520, display: 'flex', flexDirection: 'column',
            borderRadius: 3, overflow: 'hidden',
            border: '1px solid', borderColor: 'divider',
          }}
        >
          {/* Header */}
          <Box sx={{
            px: 2, py: 1.5,
            background: 'linear-gradient(135deg, #4a148c, #7b1fa2)',
            color: '#fff',
          }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={1}>
                <SmartToyIcon sx={{ fontSize: 20 }} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} lineHeight={1.2}>
                    {t('mis.chatTitle')}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75, fontSize: '0.65rem' }}>
                    {t('mis.chatSubtitle')}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row">
                {messages.length > 0 && (
                  <Tooltip title={t('mis.chatClear')}>
                    <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.7)' }} onClick={() => setMessages([])}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.7)' }} onClick={() => setOpen(false)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          </Box>

          <Divider />

          {/* Messages */}
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {messages.length === 0 && (
              <Box>
                <Box sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2,
                }}>
                  <Avatar sx={{ width: 28, height: 28, bgcolor: '#7b1fa2', flexShrink: 0 }}>
                    <SmartToyIcon sx={{ fontSize: 16 }} />
                  </Avatar>
                  <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, px: 1.5, py: 1, maxWidth: '85%' }}>
                    <Typography variant="body2">{t('mis.chatWelcome')}</Typography>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.disabled" sx={{ pl: 4.5, display: 'block', mb: 1 }}>
                  {t('mis.chatSuggestions')}
                </Typography>
                <Stack gap={0.75} sx={{ pl: 4.5 }}>
                  {SUGGESTED.map(s => (
                    <Box
                      key={s}
                      onClick={() => send(s)}
                      sx={{
                        px: 1.5, py: 0.75, borderRadius: 2, cursor: 'pointer',
                        border: '1px solid', borderColor: 'divider',
                        bgcolor: 'background.paper',
                        '&:hover': { bgcolor: 'action.hover' },
                        fontSize: '0.78rem', color: 'text.secondary',
                      }}
                    >
                      {s}
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {messages.map((m, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-end', gap: 0.75,
                }}
              >
                <Avatar sx={{
                  width: 26, height: 26, flexShrink: 0,
                  bgcolor: m.role === 'user' ? 'primary.main' : '#7b1fa2',
                }}>
                  {m.role === 'user'
                    ? <PersonIcon sx={{ fontSize: 14 }} />
                    : <SmartToyIcon sx={{ fontSize: 14 }} />}
                </Avatar>
                <Box sx={{
                  maxWidth: '78%', px: 1.5, py: 1, borderRadius: 2,
                  bgcolor: m.role === 'user' ? 'primary.main' : 'action.hover',
                  color: m.role === 'user' ? '#fff' : 'text.primary',
                }}>
                  <Typography variant="body2" component="div" sx={{ lineHeight: 1.6 }}>
                    {renderMessage(m.content)}
                  </Typography>
                </Box>
              </Box>
            ))}

            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75 }}>
                <Avatar sx={{ width: 26, height: 26, bgcolor: '#7b1fa2', flexShrink: 0 }}>
                  <SmartToyIcon sx={{ fontSize: 14 }} />
                </Avatar>
                <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, px: 1.5, py: 1 }}>
                  <CircularProgress size={14} />
                </Box>
              </Box>
            )}
            <div ref={bottomRef} />
          </Box>

          <Divider />

          {/* Input */}
          <Box sx={{ p: 1.5, bgcolor: 'background.paper' }}>
            <Stack direction="row" spacing={1} alignItems="flex-end">
              <TextField
                size="small" fullWidth multiline maxRows={3}
                placeholder={t('mis.chatPlaceholder')}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                disabled={loading}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <IconButton
                onClick={() => send()}
                disabled={!input.trim() || loading}
                sx={{
                  bgcolor: 'primary.main', color: '#fff', flexShrink: 0,
                  '&:hover': { bgcolor: 'primary.dark' },
                  '&:disabled': { bgcolor: 'action.disabledBackground' },
                }}
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Box>
        </Paper>
      )}
    </>
  );
}
