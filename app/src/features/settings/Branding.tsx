// Settings › Company: the logo and the colour (admins). The logo shows in the menu and on printed
// reports and is saved as soon as it is picked; the accent is one of a short list checked for
// contrast (lib/accents.ts), previewed straight away and saved with the rest of the company card.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { CompanyMark } from '../../components/CompanyMark'
import { TrashIcon } from '../../components/icons'
import { Button, ErrorBanner, Notice, Status } from '../../components/ui'
import { ACCENT_KEYS, ACCENTS, applyAccent, type AccentKey } from '../../lib/accents'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { resizeLogo } from '../../lib/images'
import { supabase } from '../../lib/supabase'
import { t } from '../../lib/i18n'

export function LogoField() {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const company = auth.company
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)

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
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      setNote(picked ? t('branding.logoSaved') : t('branding.logoRemoved'))
    },
  })

  return (
    <section aria-label={t('branding.logo')} className="flex items-center gap-4">
      <CompanyMark logoPath={company.logo_path} size={56} />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm text-subtle">
          {company.logo_path ? t('branding.shownInTheMenu') : t('branding.noLogoYetThe')}
        </p>
        <div className="flex flex-wrap gap-2">
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t('branding.logoFile')}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setNote(''); setLogo.mutate(f) } }} />
          <Button type="button" variant="secondary" busy={setLogo.isPending} onClick={() => file.current?.click()}>
            {company.logo_path ? t('branding.changeLogo') : t('branding.uploadLogo')}
          </Button>
          {company.logo_path && (
            <Button type="button" variant="ghost" disabled={setLogo.isPending} onClick={() => { setNote(''); setLogo.mutate(null) }}>
              <TrashIcon size={16} />{t('branding.removeLogo')}</Button>
          )}
        </div>
        <ErrorBanner>{setLogo.error && friendlyError(setLogo.error)}</ErrorBanner>
        <Status>{note && <Notice>{note}</Notice>}</Status>
      </div>
    </section>
  )
}

/** The accent choices. Picking one previews it at once; the card saves it. */
export function ColourField({ value, onChange }: { value: AccentKey; onChange: (k: AccentKey) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="float-left mb-1 text-sm font-medium text-ink">{t('branding.colour')}</legend>
      <div className="clear-left grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ACCENT_KEYS.map((k) => {
          const a = ACCENTS[k]
          const on = value === k
          return (
            <label key={k}
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm outline-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${on ? 'border-ink bg-muted font-semibold text-ink' : 'border-line text-ink hover:bg-muted'}`}>
              <input type="radio" name="accent" value={k} checked={on} className="sr-only"
                onChange={() => { onChange(k); applyAccent(k) }} />
              <span aria-hidden className="size-5 shrink-0 rounded-full" style={{ background: a.brand }} />
              {t(a.label)}
            </label>
          )
        })}
      </div>
      <p className="text-sm text-subtle">
        {t('branding.buttonsLinksCountsAnd')}</p>
    </fieldset>
  )
}
