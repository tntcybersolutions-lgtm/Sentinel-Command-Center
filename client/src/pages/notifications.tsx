import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  MessageSquare,
  Calendar,
  FileText,
  DollarSign,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface NotificationData {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  category: "opportunity" | "approval" | "deadline" | "system" | "message";
  read: boolean;
  timestamp: string;
  actionUrl?: string;
}

const mockNotifications: NotificationData[] = [
  { id: "notif-1", title: "Urgent Approval Required", message: "GSA HVAC bid decision requires your approval within 18 hours", type: "warning", category: "approval", read: false, timestamp: "2026-01-27T03:00:00", actionUrl: "/approvals" },
  { id: "notif-2", title: "New High-Fit Opportunity", message: "Federal Building HVAC Modernization matches 92% of your profile criteria", type: "info", category: "opportunity", read: false, timestamp: "2026-01-27T02:30:00", actionUrl: "/opportunities" },
  { id: "notif-3", title: "Deadline Approaching", message: "DoD Infrastructure Repair bid submission due in 9 days", type: "warning", category: "deadline", read: false, timestamp: "2026-01-27T02:00:00", actionUrl: "/bids" },
  { id: "notif-4", title: "Amendment Posted", message: "Amendment 003 posted for VA Hospital Renovation project", type: "info", category: "opportunity", read: true, timestamp: "2026-01-27T01:30:00" },
  { id: "notif-5", title: "Payment Received", message: "Pay Application #6 for DoD project has been approved - $156,000", type: "success", category: "system", read: true, timestamp: "2026-01-26T18:00:00" },
  { id: "notif-6", title: "SAM.gov Sync Complete", message: "12 new opportunities detected, 4 match your profile", type: "info", category: "system", read: true, timestamp: "2026-01-26T12:00:00" },
  { id: "notif-7", title: "CMMC Compliance Alert", message: "2 security controls require evidence update by Feb 15", type: "error", category: "system", read: false, timestamp: "2026-01-26T10:00:00", actionUrl: "/compliance" },
  { id: "notif-8", title: "New Message", message: "Contracting officer responded to your RFI question", type: "info", category: "message", read: true, timestamp: "2026-01-25T16:00:00" },
];

const mockStats = {
  total: 24,
  unread: 4,
  urgent: 2,
};

export default function Notifications() {
  const [selectedTab, setSelectedTab] = useState("all");
  const [notifications, setNotifications] = useState(mockNotifications);
  const { toast } = useToast();

  const handleSettings = () => {
    toast({ title: "Notification Settings", description: "Opening notification preferences..." });
  };

  const { isLoading: notificationsLoading } = useQuery({
    queryKey: ["/api/notifications"],
  });

  const displayStats = mockStats;

  const filteredNotifications = notifications.filter((notif) => {
    if (selectedTab === "all") return true;
    if (selectedTab === "unread") return !notif.read;
    if (selectedTab === "urgent") return notif.type === "warning" || notif.type === "error";
    return notif.category === selectedTab;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "error": return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "warning": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "success": return <Check className="h-4 w-4 text-green-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "opportunity": return <FileText className="h-4 w-4" />;
      case "approval": return <Check className="h-4 w-4" />;
      case "deadline": return <Calendar className="h-4 w-4" />;
      case "message": return <MessageSquare className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-notifications">Notifications</h1>
          <p className="text-muted-foreground">Stay updated on opportunities, approvals, and system events</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={markAllAsRead} data-testid="button-mark-all-read">
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark All Read
          </Button>
          <Button variant="outline" size="sm" onClick={handleSettings} data-testid="button-notification-settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="stat-card-total-notifications">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Notifications</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayStats.total}</div>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-unread">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unread</CardTitle>
            <Info className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{displayStats.unread}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-urgent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{displayStats.urgent}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2" data-testid="card-notifications-list">
          <CardHeader>
            <CardTitle>Recent Notifications</CardTitle>
            <CardDescription>Your latest alerts and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList data-testid="tabs-notifications">
                <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                <TabsTrigger value="unread" data-testid="tab-unread">Unread</TabsTrigger>
                <TabsTrigger value="urgent" data-testid="tab-urgent">Urgent</TabsTrigger>
                <TabsTrigger value="opportunity" data-testid="tab-opportunities">Opportunities</TabsTrigger>
                <TabsTrigger value="system" data-testid="tab-system">System</TabsTrigger>
              </TabsList>
              <TabsContent value={selectedTab} className="mt-4">
                <div className="space-y-2">
                  {notificationsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))
                  ) : filteredNotifications.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <BellOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No notifications
                    </div>
                  ) : (
                    filteredNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`flex items-start gap-4 p-4 rounded-lg border hover-elevate ${!notif.read ? "bg-muted/50" : ""}`}
                        data-testid={`notification-${notif.id}`}
                      >
                        <div className="flex-shrink-0 mt-1">
                          {getTypeIcon(notif.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`font-medium ${!notif.read ? "text-foreground" : "text-muted-foreground"}`} data-testid={`notification-title-${notif.id}`}>
                              {notif.title}
                            </p>
                            {!notif.read && (
                              <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">New</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{notif.message}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {getCategoryIcon(notif.category)}
                            <span className="capitalize">{notif.category}</span>
                            <span>•</span>
                            <span>{formatTimestamp(notif.timestamp)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!notif.read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => markAsRead(notif.id)}
                              data-testid={`button-mark-read-${notif.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteNotification(notif.id)}
                            data-testid={`button-delete-${notif.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card data-testid="card-notification-preferences">
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>Configure your notification settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-notifications">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive notifications via email</p>
              </div>
              <Switch id="email-notifications" defaultChecked data-testid="switch-email-notifications" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="opportunity-alerts">Opportunity Alerts</Label>
                <p className="text-sm text-muted-foreground">New matching opportunities</p>
              </div>
              <Switch id="opportunity-alerts" defaultChecked data-testid="switch-opportunity-alerts" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="deadline-reminders">Deadline Reminders</Label>
                <p className="text-sm text-muted-foreground">Upcoming bid deadlines</p>
              </div>
              <Switch id="deadline-reminders" defaultChecked data-testid="switch-deadline-reminders" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="approval-requests">Approval Requests</Label>
                <p className="text-sm text-muted-foreground">Pending approval notifications</p>
              </div>
              <Switch id="approval-requests" defaultChecked data-testid="switch-approval-requests" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="system-updates">System Updates</Label>
                <p className="text-sm text-muted-foreground">Sync status and system alerts</p>
              </div>
              <Switch id="system-updates" data-testid="switch-system-updates" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
