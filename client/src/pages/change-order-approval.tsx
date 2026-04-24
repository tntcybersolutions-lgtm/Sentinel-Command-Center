import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardCheck, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";
interface CO{id:string;changeOrderNumber?:string;change_order_number?:string;title?:string;description?:string;status:string;amount?:number;reason?:string;createdAt?:string;created_at?:string;}
function fmt(n?:number){if(!n&&n!==0)return"—";return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);}
function SP({status}:{status:string}){const s=status?.toLowerCase()||"";const c=s==="pending_approval"||s==="pending"?"bg-amber-500/10 border-amber-500/30 text-amber-400":s==="approved"?"bg-emerald-500/10 border-emerald-500/30 text-emerald-400":s==="rejected"?"bg-red-500/10 border-red-500/30 text-red-400":"bg-white/5 border-white/10 text-zinc-400";return <span className={"inline-flex px-2 py-0.5 rounded text-xs border font-mono "+c}>{status}</span>;}
export default function ChangeOrderApprovalCenter(){
  const qc=useQueryClient();
  const [exp,setExp]=useState<Set<string>>(new Set());
  const [proc,setProc]=useState<string|null>(null);
  const [res,setRes]=useState<string|null>(null);
  const {data:cos,isLoading}=useQuery<CO[]>({queryKey:["/api/change-orders"],queryFn:()=>fetch("/api/change-orders").then(r=>r.json()).then(d=>Array.isArray(d)?d:d.rows||d.changeOrders||[])});
  const pending=(cos||[]).filter(c=>{const s=c.status?.toLowerCase();return s==="pending_approval"||s==="pending"||s==="submitted";});
  const done=(cos||[]).filter(c=>{const s=c.status?.toLowerCase();return s!=="pending_approval"&&s!=="pending"&&s!=="submitted";});
  const act=async(id:string,a:"approve"|"reject")=>{setProc(id);try{await fetch("/api/change-orders/"+id+"/"+a,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes:"Via Approval Center"})});setRes(a);qc.invalidateQueries({queryKey:["/api/change-orders"]});setTimeout(()=>setRes(null),3000);}finally{setProc(null);}};
  const tog=(id:string)=>{const n=new Set(exp);n.has(id)?n.delete(id):n.add(id);setExp(n);};
  const tot=pending.reduce((s,c)=>s+(c.amount||0),0);
  return(
    <div className="min-h-screen bg-black text-white p-6" data-testid="change-order-approval-center">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3"><ClipboardCheck className="w-7 h-7 text-purple-400"/><div><h1 className="text-2xl font-bold">Change Order Approval Center</h1><p className="text-zinc-400 text-sm">Review and approve or reject pending change orders</p></div></div>
        {res&&<div className={"px-4 py-2 rounded border text-sm "+(res==="approve"?"bg-emerald-500/10 border-emerald-500/30 text-emerald-400":"bg-red-500/10 border-red-500/30 text-red-400")}>{res==="approve"?"✓ Approved":"✗ Rejected"}</div>}
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-amber-500/30 rounded-lg p-4"><div className="text-xs text-zinc-400 mb-1">Pending</div><div className="text-3xl font-bold text-amber-400 font-mono" data-testid="stat-pending">{isLoading?"…":pending.length}</div></div>
          <div className="border border-blue-500/30 rounded-lg p-4"><div className="text-xs text-zinc-400 mb-1">Total Value</div><div className="text-2xl font-bold text-blue-400 font-mono">{fmt(tot)}</div></div>
          <div className="border border-white/10 rounded-lg p-4"><div className="text-xs text-zinc-400 mb-1">Total COs</div><div className="text-3xl font-bold font-mono">{isLoading?"…":(cos||[]).length}</div></div>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400"/>Awaiting Approval ({pending.length})</h2>
          {isLoading?<div className="text-zinc-400 text-sm">Loading...</div>:pending.length===0?<div className="border border-white/10 rounded-lg p-6 text-center text-zinc-500 text-sm">No change orders pending approval</div>:(
            <div className="space-y-2" data-testid="list-pending-cos">
              {pending.map(co=>(
                <div key={co.id} className="border border-amber-500/20 rounded-lg overflow-hidden" data-testid={"co-row-"+co.id}>
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02]" onClick={()=>tog(co.id)}>
                    <div className="flex items-center gap-3">{exp.has(co.id)?<ChevronDown className="w-4 h-4 text-zinc-400"/>:<ChevronRight className="w-4 h-4 text-zinc-400"/>}<span className="font-mono text-zinc-300 text-sm">{co.changeOrderNumber||co.change_order_number||co.id.slice(0,8)}</span><span className="font-medium truncate max-w-xs">{co.title||co.description||"Untitled"}</span></div>
                    <div className="flex items-center gap-2"><span className="text-blue-400 font-mono text-sm">{fmt(co.amount)}</span><SP status={co.status}/><button onClick={e=>{e.stopPropagation();act(co.id,"approve");}} disabled={proc===co.id} data-testid={"btn-approve-co-"+co.id} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"><CheckCircle className="w-3 h-3"/>Approve</button><button onClick={e=>{e.stopPropagation();act(co.id,"reject");}} disabled={proc===co.id} data-testid={"btn-reject-co-"+co.id} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50"><XCircle className="w-3 h-3"/>Reject</button></div>
                  </div>
                  {exp.has(co.id)&&<div className="px-4 pb-3 pt-2 border-t border-amber-500/10 bg-amber-500/5">{co.description&&<p className="text-zinc-300 text-sm mb-1">{co.description}</p>}{co.reason&&<p className="text-zinc-400 text-xs">Reason: {co.reason}</p>}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        {done.length>0&&<div><h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-zinc-400"/>Decided ({done.length})</h2><div className="border border-white/10 rounded-lg overflow-hidden"><table className="w-full text-sm" data-testid="table-co-decisions"><thead><tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase font-mono"><th className="py-2 px-3">#</th><th className="py-2 px-3">Title</th><th className="py-2 px-3">Amount</th><th className="py-2 px-3">Status</th></tr></thead><tbody>{done.slice(0,20).map(co=><tr key={co.id} className="border-b border-white/5 hover:bg-white/[0.02]"><td className="py-2 px-3 font-mono text-zinc-300 text-xs">{co.changeOrderNumber||co.change_order_number||co.id.slice(0,8)}</td><td className="py-2 px-3 truncate max-w-xs">{co.title||"—"}</td><td className="py-2 px-3 font-mono text-zinc-400">{fmt(co.amount)}</td><td className="py-2 px-3"><SP status={co.status}/></td></tr>)}</tbody></table></div></div>}
      </div>
    </div>
  );
}