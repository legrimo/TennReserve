import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { fetchIdentity, saveIdentity, testNotifications, type IdentityUi } from "@/lib/api";

const empty: IdentityUi = {
  cardNumberMasked: "",
  cardCvvSet: false,
  cardExpMonth: "",
  cardExpYear: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  billingAddress: "",
  billingCity: "",
  billingState: "NY",
  billingZip: "",
  partyPermits: "2",
};

export function SettingsPage() {
  const [form, setForm] = useState<IdentityUi>(empty);
  const [cardNumber, setCardNumber] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchIdentity().then(setForm).catch((e) => toast.error(e.message));
  }, []);

  const update = (key: keyof IdentityUi, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const payload = {
        cardExpMonth: form.cardExpMonth,
        cardExpYear: form.cardExpYear,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        billingAddress: form.billingAddress,
        billingApt: form.billingApt,
        billingCity: form.billingCity,
        billingState: form.billingState,
        billingZip: form.billingZip,
        partyPermits: form.partyPermits,
        permitNumber: form.permitNumber,
        player2Name: form.player2Name,
        player2Permit: form.player2Permit,
        ...(cardNumber ? { cardNumber } : {}),
        ...(cardCvv ? { cardCvv } : {}),
      };
      const saved = await saveIdentity(payload);
      setForm(saved);
      setCardNumber("");
      setCardCvv("");
      toast.success("Payment details saved");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onTestNotify = async () => {
    try {
      const { channels, errors } = await testNotifications();
      if (errors.length) {
        toast.error(errors.join("; "));
      }
      if (channels.length) {
        toast.success(`Sent via: ${channels.join(", ")}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Payment and identity for Payflow checkout. Billing address must match your virtual card (AVS).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Virtual card</CardTitle>
          <CardDescription>Use a capped, merchant-locked card (e.g. Privacy.com)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Card number</Label>
            <Input
              placeholder={form.cardNumberMasked || "••••4242"}
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Exp month</Label>
            <Input value={form.cardExpMonth} onChange={(e) => update("cardExpMonth", e.target.value)} />
          </div>
          <div>
            <Label>Exp year</Label>
            <Input value={form.cardExpYear} onChange={(e) => update("cardExpYear", e.target.value)} />
          </div>
          <div>
            <Label>CVV</Label>
            <Input
              type="password"
              placeholder={form.cardCvvSet ? "••••" : "CVV"}
              value={cardCvv}
              onChange={(e) => setCardCvv(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>First name</Label>
            <Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
          </div>
          <div>
            <Label>Last name</Label>
            <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Party permits on file</Label>
            <Select
              value={form.partyPermits}
              onChange={(e) => update("partyPermits", e.target.value as IdentityUi["partyPermits"])}
            >
              <option value="2">2 (both players — $15 total)</option>
              <option value="1">1</option>
              <option value="none">None</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Street</Label>
            <Input value={form.billingAddress} onChange={(e) => update("billingAddress", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Apt (optional)</Label>
            <Input value={form.billingApt ?? ""} onChange={(e) => update("billingApt", e.target.value)} />
          </div>
          <div>
            <Label>City</Label>
            <Input value={form.billingCity} onChange={(e) => update("billingCity", e.target.value)} />
          </div>
          <div>
            <Label>State</Label>
            <Input value={form.billingState} onChange={(e) => update("billingState", e.target.value)} />
          </div>
          <div>
            <Label>ZIP</Label>
            <Input value={form.billingZip} onChange={(e) => update("billingZip", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            iMessage uses IMESSAGE_TO if set, otherwise your PHONE above. Grant Automation permission
            for Terminal/Node → Messages in System Settings. Email needs NOTIFY_EMAIL and SMTP_* in
            .env.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onTestNotify}>
            Send test notification
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
