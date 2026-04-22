import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ListChecks, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RowActionMenu } from "@/features/row-actions/RowActionMenu";

interface ProjectTask {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  assignees: string | null;
  status: string;
  priority: string;
  labels: string | null;
  dueDate: string | null;
  source: string;
  createdAt: string;
  projectName: string | null;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "completed":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Completed</Badge>;
    case "in_progress":
      return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">In Progress</Badge>;
    case "not_started":
      return <Badge variant="secondary">Not Started</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case "high":
      return <Badge variant="destructive">High</Badge>;
    case "medium":
      return <Badge variant="secondary">Medium</Badge>;
    case "low":
      return <Badge variant="outline">Low</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

export default function ExecutionTasks() {
  const [, setLocation] = useLocation();
  const { data: tasks, isLoading } = useQuery<ProjectTask[]>({
    queryKey: ["/api/project-tasks"],
  });

  const totalTasks = tasks?.length || 0;
  const completedTasks = tasks?.filter(t => t.status === "completed").length || 0;
  const inProgressTasks = tasks?.filter(t => t.status === "in_progress").length || 0;
  const notStartedTasks = tasks?.filter(t => t.status === "not_started").length || 0;

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto" data-testid="page-execution-tasks">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Project Tasks</h1>
        <p className="text-muted-foreground">Manage and track all project tasks</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-total-tasks">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : totalTasks}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-completed-tasks">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : completedTasks}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-in-progress-tasks">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : inProgressTasks}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-not-started-tasks">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Not Started</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : notStartedTasks}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table data-testid="table-tasks" className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Assignees</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks && tasks.length > 0 ? tasks.map((task) => (
                  <TableRow key={task.id} data-testid={`row-task-${task.id}`} className="cursor-pointer hover-elevate" onClick={() => setLocation(`/entity/task/${task.id}`)}>
                    <TableCell className="font-medium max-w-[300px]">
                      <div className="truncate" data-testid={`text-task-name-${task.id}`}>{task.name}</div>
                      {task.description && (
                        <div className="text-xs text-muted-foreground truncate">{task.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="truncate text-sm" data-testid={`text-task-project-${task.id}`}>
                        {task.projectName || "-"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{task.assignees || "-"}</TableCell>
                    <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                    <TableCell>{getStatusBadge(task.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div onClick={(e) => e.stopPropagation()}>
                        <RowActionMenu entityType="task" entity={task} listQueryKey={["/api/project-tasks"]} />
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No tasks found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
