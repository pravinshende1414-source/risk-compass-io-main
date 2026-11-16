import {
  LayoutDashboard,
  Users,
  Activity,
  Stethoscope,
  Brain,
  FileText,
  ClipboardList,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  group: "Overview" | "Intelligence" | "Workspace";
};

export const navItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, group: "Overview" },
  { label: "Patients", to: "/patients", icon: Users, group: "Overview" },
  { label: "Risk Prediction", to: "/prediction", icon: Activity, group: "Intelligence" },
  { label: "Disease Analysis", to: "/disease-analysis", icon: Stethoscope, group: "Intelligence" },
  { label: "Explainable AI", to: "/explainable-ai", icon: Brain, group: "Intelligence" },
  { label: "NLP Report Analyzer", to: "/nlp", icon: FileText, group: "Intelligence" },
  { label: "Reports", to: "/reports", icon: ClipboardList, group: "Workspace" },
  { label: "Settings", to: "/settings", icon: Settings, group: "Workspace" },
];

export const navGroups = ["Overview", "Intelligence", "Workspace"] as const;
