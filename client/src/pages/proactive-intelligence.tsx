import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Zap, AlertTriangle, CheckCircle2, Clock, RefreshCw, ArrowRight } from "lucide-react";

type Priority = "critical"|"high"|"medium"|"low";
type ActionType = "run_ingestion"|"retry_artifact"|"seed_checklist"|"create_bid_project"|"compliance_review"|"follow_up";

interface ProactiveTask { id: string; title: string; description: string; priority: Priority; source: "ai"|"system"; actionType: ActionType; dueAt?: string; sourceEntityType?: string; createdAt: string; completedAt?: string; }

const PRIORITY_COLOR: Record<Priority,string> = { critical:"bg-red-100 text-red-800 border-red-200", high:"bg-orange-100 text-orange-800 border-orange-200", medium:"bg-yellow-100 text-yellow-800 border-yellow-200", low:"bg-blue-100 text-blue-800 border-blue-200" };
const ACTION_LABEL: Record<ActionType,string> = { run_ingestion:"Run Ingestion", retry_artifact:"Retry Artifact", seed_checklist:"Seed Checklist", create_bid_project:"Create Bid Project", compliance_review:"Compliance Review", follow_up:"Follow Up" };

const MOCK_TASKS: ProactiveTask[] = [
  { id:"1", title:"Ingest 3 pending RFI documents", description:"3 RFI documents are awaiting ingestion for the Riverside Medical project.", priority:"critical", source:"ai", actionType:"run_ingestion", dueAt:"2026-04-24T09:00:00Z", sourceEntityType:"bid_project", createdAt:"2026-04-23T08:00:00Z" },
  { id:"2", title:"Retry failed BidJacket artifact extraction", description:"Artifact extraction failed for BidJacket #BJ-2024-089. Retry recommended.", priority:"high", source:"system", actionType:"retry_artifact", sourceEntityType:"bid_jacket", createdAt:"2026-04-23T07:30:00Z" },
  { id:"3", title:"Seed compliance checklist for Harbor Bridge project", description:"New bid project detected without compliance checklist. Auto-seeding recommended.", priority:"high", source:"ai", actionType:"seed_checklist", dueAt:"2026-04-25T12:00:00Z", createdAt:"2026-04-23T06:00:00Z" },
  { id:"4", title:"Schedule follow-up with Pinnacle Development", description:"Opportunity has been idle for 14 days. Schedule follow-up to maintain engagement.", priority:"medium", source:"ai", actionType:"follow_up", sourceEntityType:"opportunity", createdAt:"2026-04-22T15:00:00Z" },
  { id:"5", title:"Review compliance for Downtown Office Tower", description:"Compliance review due in 3 days for Downtown Office Tower bid.", priority:"medium", source:"system", actionType:"compliance_review", dueAt:"2026-04-26T17:00:00Z", createdAt:"2026-04-23T05:00:00Z" },
  { id:"6", title:"Create bid project for Federal Transit Authority RFP", description:"New opportunity detected matching active bid criteria.", priority:"low", source:"ai", actionType:"create_bid_project", createdAt:"2026-04-23T04:00:00Z" },
];

export default function ProactiveIntelligenceCenter() {
  const [filter, setFilter] = useState<"all"|Priority>("all");
  const tasks = MOCK_TASKS;
  const filtered = filter === "all" ? tasks : tasks.filter(t => t.priority === filter);
  const counts = { critical: tasks.filter(t=>t.priority==="critical").length, high: tasks.filter(t=>t.priority==="high").length, medium: tasks.filter(t=>t.priority==="medium").length, low: tasks.filter(t=>t.priority==="low").length };
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Brain className="h-7 w-7 text-purple-600" /><div><h1 className="text-2xl font-bold text-gray-900">Proactive Intelligence Center</h1><p className="text-sm text-gray-500">AI-generated action items and system recommendations</p></div></div>
        <Button variant="outline" size="sm" className="gap-2"><RefreshCw className="h-4 w-4" />Refresh</Button>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-red-200"><CardContent className="pt-4"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" /><div><div className="text-2xl font-bold text-red-600">{counts.critical}</div><div className="text-xs text-gray-500">Critical</div></div></div></CardContent></Card>
        <Card className="border-orange-200"><CardContent className="pt-4"><div className="flex items-center gap-2"><Zap className="h-5 w-5 text-orange-500" /><div><div className="text-2xl font-bold text-orange-600">{counts.high}</div><div className="text-xs text-gray-500">High</div></div></div></CardContent></Card>
        <Card className="border-yellow-200"><CardContent className="pt-4"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-yellow-500" /><div><div className="text-2xl font-bold text-yellow-600">{counts.medium}</div><div className="text-xs text-gray-500">Medium</div></div></div></CardContent></Card>
        <Card className="border-blue-200"><CardContent className="pt-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-blue-500" /><div><div className="text-2xl font-bold text-blue-600">{counts.low}</div><div className="text-xs text-gray-500">Low</div></div></div></CardContent></Card>
      </div>
      <div className="flex gap-2">{(["all","critical","high","medium","low"] as const).map(f => (<Button key={f} variant={filter===f?"default":"outline"} size="sm" onClick={()=>setFilter(f)} className="capitalize">{f==="all"?"All Tasks":f}</Button>))}</div>
      <div className="space-y-3">
        {filtered.map(task => (
          <Card key={task.id} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs font-semibold border ${PRIORITY_COLOR[task.priority]}`}>{task.priority}</Badge>
                    <Badge variant="outline" className="text-xs">{ACTION_LABEL[task.actionType]}</Badge>
                    <Badge variant="outline" className="text-xs text-gray-500">{task.source === "ai" ? "🤖 AI" : "⚙️ System"}</Badge>
                  </div>
                  <h3 className="font-semibold text-gray-900">{task.title}</h3>
                  <p className="text-sm text-gray-500">{task.description}</p>
                  {task.dueAt && (<div className="flex items-center gap-1 text-xs text-gray-400"><Clock className="h-3 w-3" /><span>Due: {new Date(task.dueAt).toLocaleDateString()}</span></div>)}
                </div>
                <Button size="sm" variant="outline" className="gap-1 flex-shrink-0"><ArrowRight className="h-4 w-4" />Take Action</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (<div className="text-center py-12 text-gray-400"><Brain className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No tasks for this priority.</p></div>)}
      </div>
    </div>
  );
}