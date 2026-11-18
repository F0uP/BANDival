"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { ImagePlus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/display";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/feedback";
import { previewNumber, type InvoiceSettings } from "@/components/finance/invoice-shared";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SettingsForm({ bandId, initial, onSaved, onClose }: { bandId: string; initial: InvoiceSettings; onSaved: () => void; onClose: () => void }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const set = <K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) => setValues((current) => ({ ...current, [key]: value }));
  const text = (key: keyof InvoiceSettings) => ({
    value: String(values[key] ?? ""),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, event.target.value as never),
  });

  const save = async () => {
    setSaving(true);
    try {
      const { logoUrl: _logo, ...payload } = values;
      void _logo;
      await api.put(`/api/bands/${bandId}/invoice-settings`, payload);
      toast.success("Rechnungsdaten gespeichert.");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api.post<{ logoUrl: string }>(`/api/bands/${bandId}/invoice-settings/logo`, form);
      set("logoUrl", result.logoUrl);
      setLogoVersion((version) => version + 1);
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeLogo = async () => {
    await api.delete(`/api/bands/${bandId}/invoice-settings/logo`).catch((error) => toast.error(errorMessage(error)));
    set("logoUrl", null);
    onSaved();
  };

  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <Section title="Absender" description="Erscheint im Briefkopf und in der Fußzeile jeder Rechnung.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name / Band (Rechnungssteller)">{(id) => <Input id={id} {...text("issuerName")} required />}</Field>
          <Field label="Inhaber:in / Ansprechpartner:in" optional hint="z. B. bei GbR: vertretungsberechtigte Person">{(id) => <Input id={id} {...text("issuerContact")} />}</Field>
          <Field label="Straße und Hausnummer" className="sm:col-span-2">{(id) => <Input id={id} {...text("street")} autoComplete="street-address" />}</Field>
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 sm:col-span-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="PLZ">{(id) => <Input id={id} {...text("zip")} autoComplete="postal-code" />}</Field>
            <Field label="Ort">{(id) => <Input id={id} {...text("city")} autoComplete="address-level2" />}</Field>
            <Field label="Land" className="col-span-2 sm:col-span-1">{(id) => <Input id={id} {...text("country")} />}</Field>
          </div>
          <Field label="E-Mail" optional>{(id) => <Input id={id} type="email" {...text("email")} />}</Field>
          <Field label="Telefon" optional>{(id) => <Input id={id} type="tel" {...text("phone")} />}</Field>
          <Field label="Website" optional className="sm:col-span-2">{(id) => <Input id={id} {...text("website")} placeholder="www.eure-band.de" />}</Field>
        </div>
      </Section>

      <Section title="Steuer" description="Pflicht: Steuernummer oder USt-IdNr. (§ 14 Abs. 4 Nr. 2 UStG).">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Steuernummer">{(id) => <Input id={id} {...text("taxNumber")} placeholder="12/345/67890" />}</Field>
          <Field label="USt-IdNr." optional>{(id) => <Input id={id} {...text("vatId")} placeholder="DE123456789" />}</Field>
        </div>
        <Switch
          checked={values.smallBusiness}
          onChange={(value) => set("smallBusiness", value)}
          label="Kleinunternehmer (§ 19 UStG)"
          description="Keine Umsatzsteuer auf der Rechnung – der vorgeschriebene Hinweis wird automatisch gedruckt."
        />
        {!values.smallBusiness ? (
          <Field label="Standard-Steuersatz" hint="Konzertgagen ausübender Künstler:innen sind meist mit 7 % ermäßigt (§ 12 Abs. 2 Nr. 7a UStG) – im Zweifel Steuerberatung fragen.">
            {(id) => (
              <Select id={id} value={String(values.defaultVatRate)} onChange={(event) => set("defaultVatRate", Number(event.target.value))}>
                <option value="19">19 %</option>
                <option value="7">7 % (ermäßigt)</option>
                <option value="0">0 %</option>
              </Select>
            )}
          </Field>
        ) : null}
      </Section>

      <Section title="Bankverbindung" description="Für Zahlungshinweis und GiroCode (QR zum Bezahlen per Banking-App).">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kontoinhaber:in" optional hint="leer = Name des Rechnungsstellers">{(id) => <Input id={id} {...text("accountHolder")} />}</Field>
          <Field label="Bank" optional>{(id) => <Input id={id} {...text("bankName")} />}</Field>
          <Field label="IBAN">{(id) => <Input id={id} {...text("iban")} placeholder="DE00 0000 0000 0000 0000 00" autoComplete="off" />}</Field>
          <Field label="BIC" optional>{(id) => <Input id={id} {...text("bic")} autoComplete="off" />}</Field>
        </div>
      </Section>

      <Section title="Rechnung & Layout">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rechnungsnummer" hint={<>Platzhalter: {"{YYYY}"} Jahr, {"{MM}"} Monat, {"{NNN}"} laufende Nummer · Vorschau: <strong>{previewNumber(values.numberFormat, new Date())}</strong></>}>
            {(id) => <Input id={id} {...text("numberFormat")} required />}
          </Field>
          <Field label="Zahlungsziel (Tage)">
            {(id) => <Input id={id} type="number" min={0} max={120} value={values.paymentTermDays} onChange={(event) => set("paymentTermDays", Math.max(0, Math.min(120, Number(event.target.value) || 0)))} />}
          </Field>
        </div>
        <Field label="Einleitungstext">{(id) => <Textarea id={id} rows={2} {...text("intro")} />}</Field>
        <Field label="Fußzeile" optional hint="z. B. Gerichtsstand, Vereinsregister oder ein Dankeschön">{(id) => <Textarea id={id} rows={2} {...text("footer")} />}</Field>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium">Logo</span>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-36 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface-2">
                {values.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/bands/${bandId}/invoice-settings/logo?v=${logoVersion}`} alt="Logo" className="max-h-12 max-w-32 object-contain" />
                ) : <span className="text-xs text-subtle">PNG oder JPG</span>}
              </div>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(event) => void uploadLogo(event.target.files?.[0])} />
              <Button type="button" size="sm" icon={<ImagePlus />} loading={uploading} onClick={() => fileInput.current?.click()}>{values.logoUrl ? "Ersetzen" : "Hochladen"}</Button>
              {values.logoUrl ? <Button type="button" size="sm" variant="ghost" icon={<Trash2 />} onClick={() => void removeLogo()} aria-label="Logo entfernen" /> : null}
            </div>
          </div>
          <Field label="Akzentfarbe">
            {(id) => (
              <div className="flex items-center gap-2">
                <input id={id} type="color" value={values.accentColor} onChange={(event) => set("accentColor", event.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-surface p-1" />
                <span className="font-mono text-xs text-muted">{values.accentColor}</span>
              </div>
            )}
          </Field>
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-surface px-1 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
        <Button type="submit" variant="primary" loading={saving}>Speichern</Button>
      </div>
    </form>
  );
}

export function InvoiceSettingsDialog({ bandId, open, onClose, onSaved }: { bandId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { data, mutate } = useSWR<{ settings: InvoiceSettings }>(open ? `/api/bands/${bandId}/invoice-settings` : null);
  return (
    <Dialog open={open} onClose={onClose} title="Rechnungsdaten" description="Einmal ausfüllen – gilt für alle neuen Rechnungen der Band." size="lg">
      {data ? (
        <SettingsForm
          key={JSON.stringify(data.settings)}
          bandId={bandId}
          initial={data.settings}
          onClose={onClose}
          onSaved={() => { void mutate(); onSaved(); }}
        />
      ) : <Skeleton className="h-96" />}
    </Dialog>
  );
}
