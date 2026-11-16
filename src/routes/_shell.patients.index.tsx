import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpDown,
  BarChart3,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardCard } from "@/components/app/DashboardCard";
import { DisclaimerBanner } from "@/components/app/DisclaimerBanner";
import { PageHeader } from "@/components/app/PagePlaceholder";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/States";
import { RiskBadge } from "@/components/app/RiskBadge";
import { Modal } from "@/components/app/Modal";
import { PatientForm } from "@/components/app/PatientForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  normalizeRiskLevel,
  useCreatePatient,
  useDeletePatient,
  useLatestRiskByPatient,
  usePatients,
  useUpdatePatient,
  type PatientInput,
  type PatientRecord,
} from "@/lib/patients";

export const Route = createFileRoute("/_shell/patients/")({
  head: () => ({
    meta: [
      { title: "Patients — HealthRisk AI" },
      {
        name: "description",
        content:
          "Search, filter and manage the synthetic patient cohort in the HealthRisk AI research workspace.",
      },
      { property: "og:title", content: "Patients — HealthRisk AI" },
      { property: "og:description", content: "Synthetic patient cohort management workspace." },
    ],
  }),
  component: PatientsPage,
});

type SortKey =
  | "patient_code"
  | "age"
  | "bmi"
  | "glucose"
  | "cholesterol"
  | "risk"
  | "updated_at";

const PAGE_SIZE = 10;

function ageBand(age: number) {
  if (age < 30) return "18-29";
  if (age < 40) return "30-39";
  if (age < 50) return "40-49";
  if (age < 60) return "50-59";
  if (age < 70) return "60-69";
  return "70+";
}

function PatientsPage() {
  const navigate = useNavigate();
  const { canWriteResearch, hasRole } = useAuth();
  const canDelete = hasRole("admin");
  const { data, isLoading, isError, refetch } = usePatients();
  const { data: riskMap } = useLatestRiskByPatient();

  const createPatient = useCreatePatient();
  const updatePatient = useUpdatePatient();
  const deletePatient = useDeletePatient();

  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("all");
  const [band, setBand] = useState("all");
  const [level, setLevel] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("patient_code");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PatientRecord | null>(null);
  const [viewing, setViewing] = useState<PatientRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PatientRecord | null>(null);

  const loggedCohort = useRef(false);
  useEffect(() => {
    if (!data || loggedCohort.current) return;
    loggedCohort.current = true;
    void logAudit("patients.view_cohort", { record_count: data.length });
  }, [data]);

  useEffect(() => {
    setPage(1);
  }, [search, gender, band, level]);

  const genders = useMemo(
    () => Array.from(new Set((data ?? []).map((p) => p.gender).filter(Boolean))).sort(),
    [data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (data ?? []).filter((p) => {
      if (term && !p.patient_code.toLowerCase().includes(term)) return false;
      if (gender !== "all" && p.gender !== gender) return false;
      if (band !== "all" && ageBand(p.age) !== band) return false;
      if (level !== "all") {
        const risk = riskMap?.get(p.id);
        if (normalizeRiskLevel(risk?.risk_level) !== level) return false;
      }
      return true;
    });

    const value = (p: PatientRecord) => {
      switch (sortKey) {
        case "age":
          return p.age;
        case "bmi":
          return p.bmi ?? -1;
        case "glucose":
          return p.glucose ?? -1;
        case "cholesterol":
          return p.cholesterol ?? -1;
        case "risk":
          return riskMap?.get(p.id)?.overall_risk ?? -1;
        case "updated_at":
          return new Date(p.updated_at).getTime();
        default:
          return p.patient_code;
      }
    };

    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp =
        typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
      return sortAsc ? cmp : -cmp;
    });
  }, [data, riskMap, search, gender, band, level, sortKey, sortAsc]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setGender("all");
    setBand("all");
    setLevel("all");
  };

  const openView = (patient: PatientRecord) => {
    setViewing(patient);
    void logAudit("patient.view", { patient_id: patient.id, patient_code: patient.patient_code });
  };

  const handleSubmit = (input: PatientInput) => {
    if (editing) {
      updatePatient.mutate(
        { id: editing.id, input },
        {
          onSuccess: () => {
            toast.success(`Patient ${input.patient_name || editing.patient_code} updated`);
            setFormOpen(false);
            setEditing(null);
          },
          onError: (error) => toast.error(error.message),
        },
      );
      return;
    }
    createPatient.mutate(input, {
      onSuccess: (record) => {
        toast.success(`Patient ${record.patient_code} added`);
        setFormOpen(false);
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    deletePatient.mutate(
      { id: target.id, patient_code: target.patient_code },
      {
        onSuccess: () => toast.success(`Patient ${target.patient_code} removed`),
        onError: (error) => toast.error(error.message),
      },
    );
    setPendingDelete(null);
  };

  const header = (label: string, key?: SortKey) => (
    <th className="py-2 pr-4 font-medium whitespace-nowrap">
      {key ? (
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="hover:text-foreground inline-flex items-center gap-1 uppercase"
        >
          {label}
          <ArrowUpDown className="size-3" />
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Patient records"
          description="Synthetic and anonymized patient records used for research experiments."
          icon={Users}
        />
        <div className="flex items-center gap-3">
          <span className="border-primary/30 bg-primary-soft text-primary rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide uppercase">
            Demo mode — synthetic research data
          </span>
          {canWriteResearch && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> Add patient
            </Button>
          )}
        </div>
      </div>

      <DisclaimerBanner />

      <DashboardCard title="Filters" description="Narrow the cohort before exporting or analyzing.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="patient-search">Search</Label>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="patient-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient name…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All genders</SelectItem>
                {genders.map((g) => (
                  <SelectItem key={g} value={g} className="capitalize">
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Age band</Label>
            <Select value={band} onValueChange={setBand}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["all", "18-29", "30-39", "40-49", "50-59", "60-69", "70+"].map((b) => (
                  <SelectItem key={b} value={b}>
                    {b === "all" ? "All ages" : b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Risk level</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="moderate">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="unknown">Not scored</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard
        title="Cohort table"
        description={
          data ? `${rows.length} of ${data.length} synthetic records` : "Loading cohort"
        }
      >
        {isLoading ? (
          <LoadingSkeleton rows={5} />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No patient records match"
            description="Adjust the search or filters to see synthetic records."
            action={
              <Button variant="outline" onClick={resetFilters}>
                Reset filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="text-muted-foreground border-border border-b text-left text-xs uppercase">
                  <tr>
                    {header("Patient Name", "patient_code")}
                    {header("Age", "age")}
                    {header("Gender")}
                    {header("BMI", "bmi")}
                    {header("Glucose", "glucose")}
                    {header("Blood pressure")}
                    {header("Cholesterol", "cholesterol")}
                    {header("Risk score", "risk")}
                    {header("Risk level")}
                    {header("Last updated", "updated_at")}
                    {header("Actions")}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p) => {
                    const risk = riskMap?.get(p.id);
                    const normalized = normalizeRiskLevel(risk?.risk_level);
                    return (
                      <tr key={p.id} className="border-border/60 hover:bg-muted/50 border-b last:border-0">
                        <td className="py-2.5 pr-4 font-medium">{p.patient_code}</td>
                        <td className="py-2.5 pr-4">{p.age}</td>
                        <td className="py-2.5 pr-4 capitalize">{p.gender}</td>
                        <td className="py-2.5 pr-4">{p.bmi ?? "—"}</td>
                        <td className="py-2.5 pr-4">{p.glucose ?? "—"}</td>
                        <td className="py-2.5 pr-4">{p.blood_pressure ?? "—"}</td>
                        <td className="py-2.5 pr-4">{p.cholesterol ?? "—"}</td>
                        <td className="py-2.5 pr-4">
                          {risk ? `${Number(risk.overall_risk).toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2.5 pr-4">
                          <RiskBadge level={normalized} />
                        </td>
                        <td className="text-muted-foreground py-2.5 pr-4 whitespace-nowrap">
                          {new Date(p.updated_at).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`View ${p.patient_code}`}
                              onClick={() => openView(p)}
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Analyze ${p.patient_code}`}
                              onClick={() => {
                                void logAudit("patient.analyze", { patient_id: p.id });
                                void navigate({
                                  to: "/patients/$patientId",
                                  params: { patientId: p.id },
                                });
                              }}
                            >
                              <BarChart3 className="size-4" />
                            </Button>
                            {canWriteResearch && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Edit ${p.patient_code}`}
                                  onClick={() => {
                                    setEditing(p);
                                    setFormOpen(true);
                                  }}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                {canDelete && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={`Delete ${p.patient_code}`}
                                    onClick={() => setPendingDelete(p)}
                                  >
                                    <Trash2 className="text-destructive size-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground text-xs">
                Page {currentPage} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </DashboardCard>

      <Modal
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        title={editing ? `Edit ${editing.patient_code}` : "Add patient"}
        description="Synthetic research record — never enter real personal or clinical data."
      >
        <PatientForm
          patient={editing}
          submitting={createPatient.isPending || updatePatient.isPending}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={handleSubmit}
        />
      </Modal>

      <Modal
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing ? `Patient ${viewing.patient_code}` : ""}
        description="Synthetic record — not a real person and not a diagnosis."
        footer={
          viewing ? (
            <Button
              onClick={() => {
                const id = viewing.id;
                setViewing(null);
                void navigate({ to: "/patients/$patientId", params: { patientId: id } });
              }}
            >
              Open full profile
            </Button>
          ) : undefined
        }
      >
        {viewing && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {[
              ["Age", String(viewing.age)],
              ["Gender", viewing.gender],
              ["Height", viewing.height_cm ? `${viewing.height_cm} cm` : "—"],
              ["Weight", viewing.weight_kg ? `${viewing.weight_kg} kg` : "—"],
              ["BMI", viewing.bmi ?? "—"],
              ["Blood pressure", viewing.blood_pressure ?? "—"],
              ["Heart rate", viewing.heart_rate ?? "—"],
              ["Glucose", viewing.glucose ?? "—"],
              ["Cholesterol", viewing.cholesterol ?? "—"],
              ["Smoking", viewing.smoking_status ?? "—"],
              ["Exercise", viewing.exercise_level ?? "—"],
              ["Family history", viewing.family_history ? "Yes" : "No"],
            ].map(([label, value]) => (
              <div key={label} className="border-border/60 flex flex-col border-b pb-2">
                <dt className="text-muted-foreground text-xs tracking-wide uppercase">{label}</dt>
                <dd className="font-medium capitalize">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.patient_code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the synthetic record and its linked measurements and
              predictions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
