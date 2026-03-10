"use client";

import { useState } from "react";
import { useStrategies, useConfigRaw } from "@/hooks/use-dashboard";
import { useSaveConfig } from "@/hooks/use-mutations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/dashboard/loading-skeleton";
import { Settings, Save, RotateCcw, AlertCircle } from "lucide-react";

export default function ConfigPage() {
  const { data: strategies } = useStrategies();
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const profileFile = selectedProfile ? `strategies/${selectedProfile}.yaml` : null;

  return (
    <Tabs defaultValue={0}>
      <TabsList>
        <TabsTrigger value={0}>Global Strategy</TabsTrigger>
        <TabsTrigger value={1}>Paper Scenarios</TabsTrigger>
        <TabsTrigger value={2}>Strategy Profiles</TabsTrigger>
      </TabsList>

      <TabsContent value={0}>
        <ConfigEditor file="strategy.yaml" title="Global Strategy Config" />
      </TabsContent>

      <TabsContent value={1}>
        <ConfigEditor file="paper.yaml" title="Paper Scenarios Config" />
      </TabsContent>

      <TabsContent value={2}>
        <Card className="bg-card border-border mb-4">
          <CardContent className="pt-4 pb-3">
            <label className="text-xs text-muted-foreground block mb-2">Select Strategy Profile</label>
            <select
              className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedProfile ?? ""}
              onChange={(e) => setSelectedProfile(e.target.value || null)}
            >
              <option value="">-- select --</option>
              {(strategies ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
        {profileFile && (
          <ConfigEditor key={profileFile} file={profileFile} title={`Strategy: ${selectedProfile}`} />
        )}
        {!profileFile && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Settings className="w-6 h-6" />
            <p className="text-sm">Select a strategy profile to edit</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function ConfigEditor({ file, title }: { file: string; title: string }) {
  const { data, isLoading, refetch } = useConfigRaw(file);
  const save = useSaveConfig();
  const [edits, setEdits] = useState<string | null>(null);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [prevServerContent, setPrevServerContent] = useState<string>("");

  // Reset edits when server content changes (after save/refetch)
  const serverContent = data?.content ?? "";
  if (prevServerContent !== serverContent) {
    setPrevServerContent(serverContent);
    setEdits(null);
    setYamlError(null);
  }

  const content = edits ?? serverContent;

  function handleRevert() {
    setEdits(null);
    setYamlError(null);
  }

  function validateAndSet(text: string) {
    setEdits(text);
    if (text.includes("\t")) {
      setYamlError("YAML files should not contain tabs - use spaces for indentation");
    } else {
      setYamlError(null);
    }
  }

  function handleSave() {
    save.mutate(
      { file, content },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          void refetch();
        },
        onError: (err) => {
          setYamlError(err.message);
          setConfirmOpen(false);
        },
      },
    );
  }

  if (isLoading) return <TableSkeleton rows={8} />;

  const isDirty = edits !== null && edits !== serverContent;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>{title}</span>
          {data?.updatedAt && (
            <span className="text-[11px] text-muted-foreground font-normal">
              Last modified: {new Date(data.updatedAt).toLocaleString()}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 space-y-3">
        <textarea
          className="w-full min-h-[400px] rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          value={content}
          onChange={(e) => validateAndSet(e.target.value)}
          spellCheck={false}
        />

        {yamlError && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="font-mono">{yamlError}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={!isDirty || save.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!isDirty}
            onClick={handleRevert}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Revert
          </Button>
          {save.isPending && (
            <span className="text-xs text-muted-foreground">Saving...</span>
          )}
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Configuration</DialogTitle>
              <DialogDescription>
                This will overwrite <code className="bg-muted px-1 py-0.5 rounded text-xs">{file}</code>.
                A backup (.bak) will be created automatically.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" size="sm" />}>
                Cancel
              </DialogClose>
              <Button size="sm" onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? "Saving..." : "Confirm Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
