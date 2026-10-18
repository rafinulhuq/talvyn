import {
  ArrowRight,
  BarChart2,
  Brain,
  CheckCircle,
  Clock,
  Code2,
  FileText,
  Layers,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

export function cmsIcon(key: string) {
  return (
    {
      "arrow-right": ArrowRight,
      "bar-chart": BarChart2,
      brain: Brain,
      "check-circle": CheckCircle,
      clock: Clock,
      code: Code2,
      "file-text": FileText,
      layers: Layers,
      shield: Shield,
      sparkles: Sparkles,
      target: Target,
      "trending-up": TrendingUp,
      trophy: Trophy,
      users: Users,
      zap: Zap,
    }[key] ?? Sparkles
  );
}
