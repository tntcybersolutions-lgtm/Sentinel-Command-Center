// Public owner / customer portal — no auth, token in URL is the secret.
// URL: /portal/:token
// Renders project hero + progress + photos + milestones, sanitized server-side.
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, CheckCircle2, Circle, AlertCircle, Calendar } from "lucide-react";

interface PortalProject {
  id: string;
  name: string;
  projectNumber?: string;
  status: string;
  completionPercentage: number;
  startDate?: string;
  expectedEndDate?: string;
  contractValueShown: boolean;
}
interface PortalPhoto {
  id: string;
  url: string;
  thumbnail: string;
  caption?: string | null;
  capturedAt?: string | null;
  isHero?: boolean;
}
interface PortalMilestone {
  id: string;
  name: string;
  status: string;
  targetDate?: string | null;
  completedDate?: string | null;
}
interface PortalPayload {
  project: PortalProject;
  photos: PortalPhoto[];
  milestones: PortalMilestone[];
}

export default function PortalPublicPage() {
  const [, params] = useRoute("/portal/:token");
  const token = params?.token || "";

  const { data, isLoading, error } = useQuery<PortalPayload>({
    queryKey: [`/api/portal/${token}`],
    queryFn: async () => {
      const r = await fetch(`/api/portal/${token}`);
      if (!r.ok) {
        if (r.status === 410) throw new Error("This share link has expired.");
        if (r.status === 404) throw new Error("This share link is no longer valid.");
        throw new Error("Unable to load portal.");
      }
      return r.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 text-zinc-700">
        <div className="max-w-3xl mx-auto animate-pulse">
          <div className="h-48 bg-zinc-200 rounded-lg mb-4" />
          <div className="h-6 bg-zinc-200 rounded w-1/2 mb-2" />
          <div className="h-4 bg-zinc-200 rounded w-1/3" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 text-zinc-700">
        <div className="max-w-md text-center">
          <AlertCircle className="h-10 w-10 text-zinc-400 mx-auto mb-3" />
          <div className="text-lg font-semibold mb-1">{(error as Error).message}</div>
          <p className="text-sm text-zinc-500">Please contact your project manager for a new link.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { project, photos, milestones } = data;
  const hero = photos.find(p => p.isHero) || photos[0];
  const completed = milestones.filter(m => m.status === "completed").length;
  const total = milestones.length;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-800">
      {/* Hero */}
      <div className="relative">
        {hero ? (
          <img src={hero.url} alt={project.name} className="w-full h-72 md:h-96 object-cover" />
        ) : (
          <div className="w-full h-72 md:h-96 bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center">
            <Building2 className="h-20 w-20 text-white/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 p-6 text-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-xs uppercase tracking-wider opacity-70">{project.projectNumber || project.status}</div>
            <h1 className="text-2xl md:text-4xl font-bold mt-1">{project.name}</h1>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8">
        {/* Progress */}
        <section className="bg-white rounded-lg border border-zinc-200 p-5 shadow-sm">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-semibold text-zinc-700">Project Progress</h2>
            <div className="text-2xl font-bold text-zinc-800">{project.completionPercentage}%</div>
          </div>
          <div className="h-3 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.max(2, Math.min(100, project.completionPercentage))}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <Stat label="Status" value={prettyStatus(project.status)} />
            {project.startDate && <Stat label="Started" value={fmtDate(project.startDate)} />}
            {project.expectedEndDate && <Stat label="Expected complete" value={fmtDate(project.expectedEndDate)} />}
            <Stat label="Milestones" value={`${completed} of ${total} complete`} />
          </div>
        </section>

        {/* Milestones */}
        {milestones.length > 0 && (
          <section>
            <h2 className="font-semibold text-zinc-700 mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Milestones
            </h2>
            <ol className="space-y-2">
              {milestones.map((m) => (
                <li key={m.id} className="flex items-start gap-3 bg-white border border-zinc-200 rounded-md p-3">
                  {m.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
                  ) : (
                    <Circle className="h-5 w-5 text-zinc-300 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{m.name}</div>
                    <div className="text-xs text-zinc-500">
                      {m.completedDate
                        ? `Completed ${fmtDate(m.completedDate)}`
                        : m.targetDate
                        ? `Target ${fmtDate(m.targetDate)}`
                        : prettyStatus(m.status)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <section>
            <h2 className="font-semibold text-zinc-700 mb-3">Photos ({photos.length})</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map((p) => (
                <div key={p.id} className="aspect-square rounded-md overflow-hidden border border-zinc-200 bg-zinc-100">
                  <img src={p.thumbnail || p.url} alt={p.caption || ""} loading="lazy" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="pt-6 mt-8 border-t border-zinc-200 text-center text-xs text-zinc-500">
          Shared by your project team via Sentinel Command Center.
          This page is read-only and does not require a login.
        </footer>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="font-medium text-zinc-800">{value}</div>
    </div>
  );
}

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}
function prettyStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

