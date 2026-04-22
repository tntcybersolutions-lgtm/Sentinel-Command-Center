import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Mail,
  Phone,
  Building2,
  MoreVertical,
  Edit,
  Trash2,
  MessageSquare,
  Star,
  StarOff,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ContactData {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  type: "client" | "vendor" | "subcontractor" | "government" | "internal";
  status: "active" | "inactive";
  starred: boolean;
  lastContact?: string;
}

export default function Contacts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const { toast } = useToast();

  const handleImportContacts = () => {
    toast({
      title: "Import Contacts",
      description: "Preparing contact import wizard. Supports CSV, Excel, and vCard formats.",
    });
  };

  const handleAddContact = () => {
    toast({
      title: "Add Contact",
      description: "Opening new contact form...",
    });
  };

  const { data: contacts, isLoading: contactsLoading } = useQuery<ContactData[]>({
    queryKey: ["/api/contacts"],
  });

  const displayContacts = contacts || [];
  const displayStats = { totalContacts: 0, government: 0, vendors: 0, subcontractors: 0 };

  const filteredContacts = displayContacts.filter((contact) => {
    const matchesSearch = contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.company.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === "all" || contact.type === typeFilter;
    
    if (selectedTab === "all") return matchesSearch && matchesType;
    if (selectedTab === "starred") return matchesSearch && matchesType && contact.starred;
    if (selectedTab === "active") return matchesSearch && matchesType && contact.status === "active";
    if (selectedTab === "inactive") return matchesSearch && matchesType && contact.status === "inactive";
    return matchesSearch && matchesType;
  });

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "government": return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Government</Badge>;
      case "vendor": return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Vendor</Badge>;
      case "subcontractor": return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">Subcontractor</Badge>;
      case "client": return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Client</Badge>;
      case "internal": return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Internal</Badge>;
      default: return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase();
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-contacts">Contacts</h1>
          <p className="text-muted-foreground">Manage clients, vendors, and government contacts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleImportContacts} data-testid="button-import-contacts">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button onClick={handleAddContact} data-testid="button-add-contact">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="stat-card-total-contacts">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            {contactsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{displayStats.totalContacts}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="stat-card-government">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Government</CardTitle>
            <Building2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {contactsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-blue-500">{displayStats.government}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="stat-card-vendors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendors</CardTitle>
            <Building2 className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {contactsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-purple-500">{displayStats.vendors}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="stat-card-subcontractors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subcontractors</CardTitle>
            <Building2 className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {contactsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-orange-500">{displayStats.subcontractors}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-contacts-list">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle>All Contacts</CardTitle>
              <CardDescription>View and manage your contact directory</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  className="pl-8 w-[200px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-contacts"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="government">Government</SelectItem>
                  <SelectItem value="vendor">Vendors</SelectItem>
                  <SelectItem value="subcontractor">Subcontractors</SelectItem>
                  <SelectItem value="client">Clients</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList data-testid="tabs-contacts">
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="starred" data-testid="tab-starred">Starred</TabsTrigger>
              <TabsTrigger value="active" data-testid="tab-active">Active</TabsTrigger>
              <TabsTrigger value="inactive" data-testid="tab-inactive">Inactive</TabsTrigger>
            </TabsList>
            <TabsContent value={selectedTab} className="mt-4">
              <div className="space-y-2">
                {contactsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))
                ) : filteredContacts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No contacts found
                  </div>
                ) : (
                  filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-4 p-3 rounded-lg border hover-elevate"
                      data-testid={`contact-row-${contact.id}`}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{getInitials(contact.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium" data-testid={`contact-name-${contact.id}`}>{contact.name}</p>
                          {contact.starred && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {contact.title} at {contact.company}
                        </p>
                      </div>
                      <div className="hidden md:flex flex-col items-end gap-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {contact.email}</span>
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {contact.phone}</span>
                      </div>
                      {getTypeBadge(contact.type)}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${contact.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem data-testid={`action-email-${contact.id}`}>
                            <Mail className="mr-2 h-4 w-4" /> Send Email
                          </DropdownMenuItem>
                          <DropdownMenuItem data-testid={`action-call-${contact.id}`}>
                            <Phone className="mr-2 h-4 w-4" /> Call
                          </DropdownMenuItem>
                          <DropdownMenuItem data-testid={`action-message-${contact.id}`}>
                            <MessageSquare className="mr-2 h-4 w-4" /> Message
                          </DropdownMenuItem>
                          <DropdownMenuItem data-testid={`action-star-${contact.id}`}>
                            {contact.starred ? <StarOff className="mr-2 h-4 w-4" /> : <Star className="mr-2 h-4 w-4" />}
                            {contact.starred ? "Unstar" : "Star"}
                          </DropdownMenuItem>
                          <DropdownMenuItem data-testid={`action-edit-${contact.id}`}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" data-testid={`action-delete-${contact.id}`}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
