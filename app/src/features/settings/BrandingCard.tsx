// Settings › Logo and colour (admins). The logo shows in the menu and on printed reports; the
// accent is one of a short list checked for contrast (lib/accents.ts). Picking a colour previews
// it straight away; leaving without saving puts the company's colour back.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { CompanyMark } from '../../components/CompanyMark'
import { TrashIcon } from '../../components/icons'
import { Button, Card, ErrorBanner, Notice, Status } from '../../components/ui'
import { ACCENT_KEYS, ACCENTS, applyAccent, isAccent, type AccentKey } from '../../lib/accents'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { resizeLogo } from '../../lib/images'
import { supabase } from '../../lib/supabase'

export function BrandingCard() {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const company = auth.company
  const saved = isAccent(company.accent) ? company.accent : 'teal'
  const [accent, setAccent] = useState<AccentKey>(saved)
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)

  // Leaving the page with an unsaved preview puts the saved colour back.
  const savedRef = useRef(saved)
  useEffect(() => { savedRef.current = saved }, [saved])
  useEffect(() => () => applyAccent(savedRef.current), [])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['me'] })

  const setLogo = useMutation({
    mutationFn: async (picked: File | null) => {
      const old = company.logo_path
      let path: string | null = null
      if (picked) {
        const { blob, ext } = await resizeLogo(picked)
        path = `${company.id}/${newId()}.${ext}`
        const up = await supabase.storage.from('logos').upload(path, blob, { contentType: blob.type || `image/${ext}`, cacheControl: '31536000' })
        if (up.error) throw up.error
      }
      const { error } = await supabase.from('companies').update({ logo_path: path }).eq('id', company.id)
      if (error) throw error
      // The old file is no longer used; failing to remove it only leaves a stray file behind.
      if (old) await supabase.storage.from('logos').remove([old])
    },
    onSuccess: async (_, picked) => {
      await refresh()
      setNote(picked ? 'Logo saved.' : 'Logo removed.')
    },
  })

  const saveAccent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('companies').update({ accent }).eq('id', company.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await refresh()
      setNote('Colour saved.')
    },
  })

  return (
    <Card title="Logo and colour">
      <div className="flex flex-col gap-5">
        <section aria-label="Logo" className="flex items-center gap-4">
          <CompanyMark logoPath={company.logo_path} size={56} />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm text-subtle">
              {company.logo_path ? 'Shown in the menu and on printed reports.' : 'No logo yet. The NirmanKhata mark is shown instead.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Logo file"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setNote(''); setLogo.mutate(f) } }} />
              <Button type="button" variant="secondary" busy={setLogo.isPending} onClick={() => file.current?.click()}>
                {company.logo_path ? 'Change logo' : 'Upload logo'}
              </Button>
              {company.logo_path && (
                <Button type="button" variant="ghost" disabled={setLogo.isPending} onClick={() => { setNote(''); setLogo.mutate(null) }}>
                  <TrashIcon size={16} />Remove logo
                </Button>
              )}
            </div>
          </div>
        </section>

        <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
          <legend className="float-left mb-1 text-sm font-semibold text-ink">Colour</legend>
          <div className="clear-left grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ACCENT_KEYS.map((k) => {
              const a = ACCENTS[k]
              const on = accent === k
              return (
                <label key={k}
                  className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm outline-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${on ? 'border-ink bg-muted font-semibold text-ink' : 'border-line text-ink hover:bg-muted'}`}>
                  <input type="radio" name="accent" value={k} checked={on} className="sr-only"
                    onChange={() => { setNote(''); setAccent(k); applyAccent(k) }} />
                  <span aria-hidden className="size-5 shrink-0 rounded-full" style={{ background: a.brand }} />
                  {a.label}
                </label>
              )
            })}
          </div>
          <p className="text-xs text-subtle">
            Buttons, links, counts and the selected menu item use this colour. Red, yellow and green are kept for
            errors, pending and paid, so they are not offered.
          </p>
          <div>
            <Button type="button" busy={saveAccent.isPending} disabled={accent === saved} onClick={() => { setNote(''); saveAccent.mutate() }}>
              Save colour
            </Button>
          </div>
        </fieldset>

        <ErrorBanner>{(setLogo.error && friendlyError(setLogo.error)) || (saveAccent.error && friendlyError(saveAccent.error))}</ErrorBanner>
        <Status>{note && <Notice>{note}</Notice>}</Status>
      </div>
    </Card>
  )
}
