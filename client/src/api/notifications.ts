import apiClient from './client';

export interface Notification {
  _id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: () => apiClient.get<{ notifications: Notification[]; unreadCount: number }>('/notifications'),
  count: () => apiClient.get<{ unreadCount: number }>('/notifications/count'),
  markRead: (id: string) => apiClient.patch(`/notifications/${id}/read`),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
};
