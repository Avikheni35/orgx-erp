import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Chip, CircularProgress, Alert,
  Card, CardContent, CardActionArea, IconButton, Tabs, Tab, Tooltip,
} from '@mui/material';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import CheckIcon from '@mui/icons-material/Check';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { useTranslation } from 'react-i18next';
import { notificationsApi, type Notification } from '../../../api/notifications';

function timeAgo(dateStr: string, de: boolean): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return de ? 'Gerade eben' : 'Just now';
  if (mins < 60)  return de ? `vor ${mins} Min.` : `${mins}m ago`;
  if (hours < 24) return de ? `vor ${hours} Std.` : `${hours}h ago`;
  return de ? `vor ${days} Tag${days === 1 ? '' : 'en'}` : `${days}d ago`;
}

export default function NotificationsPage() {
  const { i18n }  = useTranslation();
  const de        = i18n.language === 'de';
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const { data, isLoading, isError } = useQuery({
    queryKey:       ['erp-notifications'],
    queryFn:        () => notificationsApi.list(),
    refetchInterval: 30000,
  });

  const notifications: Notification[] = data?.data?.notifications ?? [];
  const unreadCount: number           = data?.data?.unreadCount   ?? 0;

  const displayed = tab === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['erp-notifications'] });
  }

  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess:  invalidate,
  });

  const markAllMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess:  invalidate,
  });

  function handleCardClick(n: Notification) {
    if (!n.read) markReadMut.mutate(n._id);
    if (n.link)  navigate(n.link);
  }

  return (
    <Box maxWidth={760}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Benachrichtigungen' : 'Notifications'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {unreadCount > 0
              ? (de ? `${unreadCount} ungelesen` : `${unreadCount} unread`)
              : (de ? 'Alle gelesen' : 'All caught up')}
          </Typography>
        </Box>
        {unreadCount > 0 && (
          <Tooltip title={de ? 'Alle als gelesen markieren' : 'Mark all as read'}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DoneAllIcon />}
              disabled={markAllMut.isPending}
              onClick={() => markAllMut.mutate()}
            >
              {de ? 'Alle gelesen' : 'Mark all read'}
            </Button>
          </Tooltip>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="all"    label={de ? 'Alle' : 'All'} />
        <Tab
          value="unread"
          label={
            <Stack direction="row" gap={0.5} alignItems="center">
              {de ? 'Ungelesen' : 'Unread'}
              {unreadCount > 0 && (
                <Chip size="small" label={unreadCount} color="primary" sx={{ height: 18, fontSize: 11 }} />
              )}
            </Stack>
          }
        />
      </Tabs>

      {isLoading && (
        <Box display="flex" justifyContent="center" mt={6}>
          <CircularProgress />
        </Box>
      )}

      {isError && (
        <Alert severity="error">
          {de ? 'Fehler beim Laden der Benachrichtigungen.' : 'Failed to load notifications.'}
        </Alert>
      )}

      {!isLoading && !isError && displayed.length === 0 && (
        <Box display="flex" flexDirection="column" alignItems="center" gap={2} mt={8} color="text.disabled">
          <NotificationsNoneIcon sx={{ fontSize: 56 }} />
          <Typography variant="body1">
            {tab === 'unread'
              ? (de ? 'Keine ungelesenen Benachrichtigungen.' : 'No unread notifications.')
              : (de ? 'Keine Benachrichtigungen vorhanden.' : 'No notifications yet.')}
          </Typography>
        </Box>
      )}

      <Stack gap={1.5}>
        {displayed.map(n => (
          <Card
            key={n._id}
            variant="outlined"
            sx={{
              borderLeft: n.read ? undefined : '4px solid',
              borderLeftColor: n.read ? undefined : 'primary.main',
              bgcolor: n.read ? 'background.paper' : 'action.hover',
              transition: 'background-color 0.2s',
            }}
          >
            <Stack direction="row" alignItems="stretch">
              <CardActionArea
                onClick={() => handleCardClick(n)}
                sx={{ flex: 1, display: 'block', textAlign: 'left' }}
              >
                <CardContent sx={{ py: '10px !important' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                    <Typography
                      variant="body2"
                      fontWeight={n.read ? 400 : 600}
                      sx={{ flex: 1 }}
                    >
                      {n.title}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap', mt: 0.2 }}>
                      {timeAgo(n.createdAt, de)}
                    </Typography>
                  </Stack>
                  {n.body && (
                    <Typography variant="body2" color="text.secondary" mt={0.25}>
                      {n.body}
                    </Typography>
                  )}
                  {n.link && (
                    <Typography variant="caption" color="primary.main" mt={0.5} display="block">
                      {de ? 'Zum Eintrag →' : 'View →'}
                    </Typography>
                  )}
                </CardContent>
              </CardActionArea>

              {!n.read && (
                <Box display="flex" alignItems="center" pr={1}>
                  <Tooltip title={de ? 'Als gelesen markieren' : 'Mark as read'}>
                    <IconButton
                      size="small"
                      onClick={e => { e.stopPropagation(); markReadMut.mutate(n._id); }}
                      disabled={markReadMut.isPending}
                    >
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
