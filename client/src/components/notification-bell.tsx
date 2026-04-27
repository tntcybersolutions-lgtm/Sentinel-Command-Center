import { useState } from "react";
import { Link } from "wouter";
import { Bell, ShieldAlert, AlertTriangle, Info, CheckCheck } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface NotificationRow {
  id: string;
  type: string;
  title: string | null;
  message: string;
  priority: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
}

function notifIcon(type: string) {
  if (type === "coi_expiry_alert")
    return <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />;
  if (type.endsWith("_alert") || type.includes("urgent"))
    return <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />;
  return <Info className="h-4 w-4 text-blue-500 shrink-0" />;
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery<NotificationRow[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30_000,
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const recent = notifications.slice(0, 12);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notifications"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-4 min-w-4 p-0 flex items-center justify-center text-[10px]"
              data-testid="badge-unread-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 p-0"
        data-testid="popover-notifications"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              data-testid="btn-mark-all-read"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {recent.length === 0 ? (
            <div
              className="px-4 py-8 text-center text-sm text-muted-foreground"
              data-testid="text-no-notifications"
            >
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {recent.map((n) => {
                const Inner = (
                  <div
                    className={`flex gap-3 px-4 py-3 hover-elevate cursor-pointer ${
                      !n.read ? "bg-accent/40" : ""
                    }`}
                    onClick={() => {
                      if (!n.read) markRead.mutate(n.id);
                      setOpen(false);
                    }}
                    data-testid={`notification-row-${n.id}`}
                  >
                    {notifIcon(n.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium truncate" data-testid={`text-notif-title-${n.id}`}>
                          {n.title || n.message}
                        </div>
                        {!n.read && (
                          <span className="h-2 w-2 bg-primary rounded-full mt-1.5 shrink-0" />
                        )}
                      </div>
                      <div
                        className="text-xs text-muted-foreground line-clamp-2 mt-0.5"
                        data-testid={`text-notif-msg-${n.id}`}
                      >
                        {n.message}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {relTime(n.createdAt)}
                        </span>
                        {n.priority && n.priority !== "normal" && (
                          <Badge
                            variant={n.priority === "urgent" ? "destructive" : "secondary"}
                            className="text-[9px] h-4 px-1"
                          >
                            {n.priority}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
                return n.actionUrl ? (
                  <Link key={n.id} href={n.actionUrl}>
                    {Inner}
                  </Link>
                ) : (
                  <div key={n.id}>{Inner}</div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="border-t px-4 py-2">
          <Link href="/notifications">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => setOpen(false)}
              data-testid="btn-view-all-notifications"
            >
              View all notifications
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
