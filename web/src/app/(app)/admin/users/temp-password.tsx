"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Shows a temporary password once, with a copy button. */
export function TempPassword({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm">
        Temporary password for <span className="font-medium">{email}</span>:
      </p>
      <div className="flex gap-2">
        <Input readOnly value={password} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={copy} aria-label="Copy password">
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Alert>
        <AlertDescription>
          This is shown only once. Send it to the person privately. They must set a new password when they
          first sign in.
        </AlertDescription>
      </Alert>
    </div>
  );
}
