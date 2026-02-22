import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BrainCircuit,
  Sparkles,
  MessageCircle,
  Package,
  AlertCircle,
  SmilePlus,
  Meh,
  Frown,
  RefreshCw,
  TrendingUp,
  Inbox,
  ExternalLink,
  User,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ConversationDetail {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  summary: string;
}

interface AnalysisResult {
  total_analyzed: number;
  top_reasons: { reason: string; count: number; conversation_ids?: string[] }[];
  top_products: { product: string; count: number; conversation_ids?: string[] }[];
  top_objections: { objection: string; count: number; conversation_ids?: string[] }[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    positive_ids?: string[];
    neutral_ids?: string[];
    negative_ids?: string[];
  };
  key_insights: string;
  conversations_detail?: ConversationDetail[];
}

const SENTIMENT_COLORS = {
  positive: "hsl(142, 70%, 45%)",
  neutral: "hsl(215, 20%, 55%)",
  negative: "hsl(0, 72%, 51%)",
};

const BAR_COLOR = "hsl(142, 70%, 45%)";

const PERIOD_OPTIONS = [
  { value: "1", label: "Últimas 24 horas" },
  { value: "2", label: "Últimas 48 horas" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
];

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-sm shadow-lg">
        <p className="text-muted-foreground mb-1 max-w-[200px] whitespace-normal">{label}</p>
        <p className="font-semibold text-foreground">{payload[0].value} conversa{payload[0].value !== 1 ? "s" : ""}</p>
      </div>
    );
  }
  return null;
};

function ConversationDetailDialog({
  open,
  onOpenChange,
  title,
  conversationIds,
  allDetails,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  conversationIds: string[];
  allDetails: ConversationDetail[];
}) {
  const filtered = allDetails.filter(d => conversationIds.includes(d.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma conversa encontrada</p>
          ) : (
            <div className="flex flex-col">
              {filtered.map((conv, idx) => {
                const phone = conv.contact_phone?.replace(/\D/g, "") || "";
                const waLink = phone ? `https://wa.me/${phone}` : null;
                const displayName = conv.contact_name || phone || "Desconhecido";
                let formattedDate = "";
                try {
                  formattedDate = format(new Date(conv.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                } catch {
                  formattedDate = conv.created_at;
                }

                return (
                  <div key={conv.id}>
                    {idx > 0 && <Separator className="my-3" />}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <User className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
                        </div>
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                          >
                            <ExternalLink className="w-3 h-3" />
                            WhatsApp
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formattedDate}
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed mt-0.5">{conv.summary}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function Intelligence() {
  const [periodDays, setPeriodDays] = useState("30");
  const [selectedInbox, setSelectedInbox] = useState("all");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; title: string; ids: string[] }>({
    open: false,
    title: "",
    ids: [],
  });

  const { data: inboxes } = useQuery({
    queryKey: ["inboxes-for-intelligence"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inboxes").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: summaryCount } = useQuery({
    queryKey: ["summary-count", selectedInbox, periodDays],
    queryFn: async () => {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - parseInt(periodDays));

      let query = supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .not("ai_summary", "is", null)
        .gte("created_at", sinceDate.toISOString());

      if (selectedInbox !== "all") {
        query = query.eq("inbox_id", selectedInbox);
      }

      const { count } = await query;
      return count || 0;
    },
  });

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setAnalysis(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-summaries`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            inbox_id: selectedInbox === "all" ? null : selectedInbox,
            period_days: parseInt(periodDays),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          toast.error("Limite de IA atingido. Tente novamente em alguns minutos.");
        } else if (response.status === 402) {
          toast.error("Créditos de IA insuficientes. Adicione créditos ao workspace.");
        } else {
          toast.error(data.error || "Erro ao gerar análise.");
        }
        return;
      }

      setAnalysis(data);
    } catch (err) {
      console.error("[Intelligence] Error:", err);
      toast.error("Erro inesperado ao gerar análise.");
    } finally {
      setLoading(false);
    }
  }, [selectedInbox, periodDays]);

  const openDetail = (title: string, ids: string[]) => {
    if (ids.length > 0) {
      setDetailDialog({ open: true, title, ids });
    }
  };

  const sentimentData = analysis
    ? [
        { name: "Positivo", value: analysis.sentiment.positive, color: SENTIMENT_COLORS.positive },
        { name: "Neutro", value: analysis.sentiment.neutral, color: SENTIMENT_COLORS.neutral },
        { name: "Negativo", value: analysis.sentiment.negative, color: SENTIMENT_COLORS.negative },
      ].filter((d) => d.value > 0)
    : [];

  const dominantSentiment = analysis
    ? analysis.sentiment.positive >= analysis.sentiment.neutral &&
      analysis.sentiment.positive >= analysis.sentiment.negative
      ? "positive"
      : analysis.sentiment.neutral >= analysis.sentiment.negative
      ? "neutral"
      : "negative"
    : null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Detail Dialog */}
      <ConversationDetailDialog
        open={detailDialog.open}
        onOpenChange={(open) => setDetailDialog(prev => ({ ...prev, open }))}
        title={detailDialog.title}
        conversationIds={detailDialog.ids}
        allDetails={analysis?.conversations_detail || []}
      />

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <BrainCircuit className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inteligência de Negócios</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Análise estratégica extraída dos resumos de IA das conversas de atendimento
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Período
              </label>
              <Select value={periodDays} onValueChange={setPeriodDays}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Caixa de entrada
              </label>
              <Select value={selectedInbox} onValueChange={setSelectedInbox}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as caixas</SelectItem>
                  {(inboxes || []).map((inbox) => (
                    <SelectItem key={inbox.id} value={inbox.id}>
                      {inbox.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="h-5" />
              <Button
                onClick={handleAnalyze}
                disabled={loading || (summaryCount !== undefined && summaryCount === 0)}
                className="gap-2 bg-primary hover:bg-primary/90"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {loading ? `Analisando ${summaryCount} conversas...` : "Gerar Análise"}
              </Button>
            </div>

            {summaryCount !== undefined && (
              <div className="flex items-center gap-2 mt-auto">
                <Badge
                  variant={summaryCount === 0 ? "destructive" : summaryCount < 5 ? "secondary" : "default"}
                  className="text-xs"
                >
                  {summaryCount} resumo{summaryCount !== 1 ? "s" : ""} disponível{summaryCount !== 1 ? "is" : ""}
                </Badge>
                {summaryCount > 0 && summaryCount < 5 && (
                  <span className="text-xs text-muted-foreground">
                    Poucos dados — análise pode não ser representativa
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {!loading && !analysis && summaryCount === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Inbox className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Nenhum resumo disponível</p>
            <p className="text-sm text-muted-foreground mt-1">
              Não há conversas com resumo de IA no período e caixa selecionados.
              <br />
              Ajuste os filtros ou gere resumos nas conversas do helpdesk.
            </p>
          </div>
        </div>
      )}

      {/* Initial state */}
      {!loading && !analysis && summaryCount !== undefined && summaryCount > 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <BrainCircuit className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Pronto para analisar</p>
            <p className="text-sm text-muted-foreground mt-1">
              {summaryCount} conversa{summaryCount !== 1 ? "s" : ""} com resumo disponível
              {summaryCount !== 1 ? "s" : ""} para análise.
              <br />
              Clique em <strong>Gerar Análise</strong> para extrair insights de negócio.
            </p>
          </div>
          <Button onClick={handleAnalyze} className="gap-2 mt-2">
            <Sparkles className="w-4 h-4" />
            Gerar análise de inteligência
          </Button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="pt-5">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-full mb-2" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
          <Card className="col-span-full bg-card border-border">
            <CardContent className="pt-5">
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results */}
      {analysis && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Top reason */}
            <Card className="bg-card border-border">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                      Principal motivo
                    </p>
                    {analysis.top_reasons[0] ? (
                      <>
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-3">
                          {analysis.top_reasons[0].reason}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-muted-foreground">
                            {analysis.top_reasons[0].count} ocorrência{analysis.top_reasons[0].count !== 1 ? "s" : ""}
                          </p>
                          {(analysis.top_reasons[0].conversation_ids?.length || 0) > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-primary hover:text-primary"
                              onClick={() => openDetail(
                                `Principal motivo: ${analysis.top_reasons[0].reason}`,
                                analysis.top_reasons[0].conversation_ids || []
                              )}
                            >
                              Abrir
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum dado</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top product */}
            <Card className="bg-card border-border">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                      Produto mais citado
                    </p>
                    {analysis.top_products[0] ? (
                      <>
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-3">
                          {analysis.top_products[0].product}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-muted-foreground">
                            {analysis.top_products[0].count} menção{analysis.top_products[0].count !== 1 ? "ões" : ""}
                          </p>
                          {(analysis.top_products[0].conversation_ids?.length || 0) > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-primary hover:text-primary"
                              onClick={() => openDetail(
                                `Produto: ${analysis.top_products[0].product}`,
                                analysis.top_products[0].conversation_ids || []
                              )}
                            >
                              Abrir
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum produto identificado</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top objection */}
            <Card className="bg-card border-border">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-warning" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                      Principal objeção
                    </p>
                    {analysis.top_objections[0] ? (
                      <>
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-3">
                          {analysis.top_objections[0].objection}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-muted-foreground">
                            {analysis.top_objections[0].count} ocorrência{analysis.top_objections[0].count !== 1 ? "s" : ""}
                          </p>
                          {(analysis.top_objections[0].conversation_ids?.length || 0) > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-primary hover:text-primary"
                              onClick={() => openDetail(
                                `Objeção: ${analysis.top_objections[0].objection}`,
                                analysis.top_objections[0].conversation_ids || []
                              )}
                            >
                              Abrir
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma objeção identificada</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sentiment */}
            <Card className="bg-card border-border">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background:
                        dominantSentiment === "positive"
                          ? "hsl(142 70% 45% / 0.1)"
                          : dominantSentiment === "negative"
                          ? "hsl(0 72% 51% / 0.1)"
                          : "hsl(215 20% 55% / 0.1)",
                    }}
                  >
                    {dominantSentiment === "positive" ? (
                      <SmilePlus className="w-4 h-4 text-primary" />
                    ) : dominantSentiment === "negative" ? (
                      <Frown className="w-4 h-4 text-destructive" />
                    ) : (
                      <Meh className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                      Sentimento geral
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {dominantSentiment === "positive"
                        ? `${analysis.sentiment.positive}% Positivo`
                        : dominantSentiment === "negative"
                        ? `${analysis.sentiment.negative}% Negativo`
                        : `${analysis.sentiment.neutral}% Neutro`}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">
                        {analysis.total_analyzed} conversa{analysis.total_analyzed !== 1 ? "s" : ""} analisada{analysis.total_analyzed !== 1 ? "s" : ""}
                      </p>
                      {(() => {
                        const sentIds = dominantSentiment === "positive"
                          ? analysis.sentiment.positive_ids
                          : dominantSentiment === "negative"
                          ? analysis.sentiment.negative_ids
                          : analysis.sentiment.neutral_ids;
                        const sentLabel = dominantSentiment === "positive"
                          ? "Positivo"
                          : dominantSentiment === "negative"
                          ? "Negativo"
                          : "Neutro";
                        return (sentIds?.length || 0) > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-primary hover:text-primary"
                            onClick={() => openDetail(
                              `Sentimento ${sentLabel}`,
                              sentIds || []
                            )}
                          >
                            Abrir
                          </Button>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Top reasons chart */}
            <Card className="lg:col-span-2 bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  Principais motivos de contato
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.top_reasons.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={analysis.top_reasons.map((r) => ({
                        name: r.reason.length > 30 ? r.reason.slice(0, 30) + "…" : r.reason,
                        fullName: r.reason,
                        count: r.count,
                      }))}
                      layout="vertical"
                      margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 18%)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(215 20% 55%)" }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        tick={{ fontSize: 11, fill: "hsl(215 20% 55%)" }}
                      />
                      <Tooltip content={<CustomBarTooltip />} />
                      <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                    Nenhum dado disponível
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sentiment pie */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <SmilePlus className="w-4 h-4 text-primary" />
                  Distribuição de sentimento
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sentimentData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={sentimentData}
                        cx="50%"
                        cy="45%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {sentimentData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) => [`${value}%`, ""]}
                        contentStyle={{
                          background: "hsl(220 18% 10%)",
                          border: "1px solid hsl(220 16% 18%)",
                          borderRadius: "8px",
                          color: "hsl(210 40% 98%)",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        formatter={(value) => (
                          <span style={{ color: "hsl(215 20% 55%)", fontSize: "12px" }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                    Nenhum dado disponível
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Second charts row: products + objections */}
          {(analysis.top_products.length > 0 || analysis.top_objections.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Products */}
              {analysis.top_products.length > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-400" />
                      Produtos e serviços mais citados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={analysis.top_products.map((p) => ({
                          name: p.product.length > 25 ? p.product.slice(0, 25) + "…" : p.product,
                          fullName: p.product,
                          count: p.count,
                        }))}
                        layout="vertical"
                        margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 18%)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(215 20% 55%)" }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={140}
                          tick={{ fontSize: 11, fill: "hsl(215 20% 55%)" }}
                        />
                        <Tooltip content={<CustomBarTooltip />} />
                        <Bar dataKey="count" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Objections */}
              {analysis.top_objections.length > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-warning" />
                      Principais objeções dos clientes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={analysis.top_objections.map((o) => ({
                          name: o.objection.length > 25 ? o.objection.slice(0, 25) + "…" : o.objection,
                          fullName: o.objection,
                          count: o.count,
                        }))}
                        layout="vertical"
                        margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 18%)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(215 20% 55%)" }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={140}
                          tick={{ fontSize: 11, fill: "hsl(215 20% 55%)" }}
                        />
                        <Tooltip content={<CustomBarTooltip />} />
                        <Bar dataKey="count" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Key insights */}
          {analysis.key_insights && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary mb-1.5 uppercase tracking-wider">
                      Insights estratégicos
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">{analysis.key_insights}</p>
                    <p className="text-xs text-muted-foreground mt-3">
                      Baseado em {analysis.total_analyzed} conversa{analysis.total_analyzed !== 1 ? "s" : ""} com resumo de IA
                      {" · "}{PERIOD_OPTIONS.find((p) => p.value === periodDays)?.label.toLowerCase()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
