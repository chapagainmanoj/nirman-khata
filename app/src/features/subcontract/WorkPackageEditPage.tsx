// Create or edit a work package (req §13): who does what on which project, the agreed value
// (lump sum or rate x quantity), planned dates, status and progress. The agreed value is
// financial: only users with finance access see or set it; others keep what is there.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, ErrorBanner, Field, FormActions, Input, PageHeader, Select, Spinner, type Crumb } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { PACKAGE_STATUS } from '../../lib/labels'
import { formatNPR, lineAmount, paisaToInput, parseNPR } from '../../lib/money'
import { useUnits } from '../catalog/api'
import { useHeadings, useProjects } from '../projects/api'
import { projectChoices, useWorkingOnDefault } from '../projects/current'
import { rpc } from '../supply/api'
import { PARTY } from '../parties/kinds'
import { useSubcontractors, useWorkPackage } from './api'

type Pkg = NonNullable<ReturnType<typeof useWorkPackage>['data']>

export function WorkPackageEditPage() {
  const { packageId = '' } = useParams()
  const pkg = useWorkPackage(packageId)
  if (packageId && pkg.isPending) return <Spinner />
  if (packageId && (pkg.error || !pkg.data)) return <ErrorBanner>{pkg.error ? friendlyError(pkg.error) : 'Work package not found.'}</ErrorBanner>
  return <PackageForm initial={pkg.data ?? null} />
}

function PackageForm({ initial }: { initial: Pkg | null }) {
  const auth = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const projects = useProjects(auth.companyId)
  const subs = useSubcontractors(auth.companyId)
  const headings = useHeadings(auth.companyId)
  const units = useUnits(auth.companyId)
  const [error, setError] = useState('')
  const t = initial?.terms
  const [v, setV] = useState({
    id: initial?.id ?? newId(),
    project_id: initial?.project_id ?? params.get('project') ?? '',
    subcontractor_id: initial?.subcontractor_id ?? params.get('subcontractor') ?? '',
    heading_id: initial?.heading_id ?? '',
    scope: initial?.scope ?? '',
    rate_basis: initial?.rate_basis ?? 'lump_sum',
    unit_id: initial?.unit_id ?? '',
    rate: paisaToInput(t?.rate_paisa),
    quantity: t?.quantity != null ? String(t.quantity) : '',
    agreed: paisaToInput(t?.agreed_value_paisa),
    planned_start: initial?.planned_start ?? '',
    planned_end: initial?.planned_end ?? '',
    status: initial?.status ?? 'planned',
    progress: initial ? String(Number(initial.progress_pct)) : '0',
    notes: initial?.notes ?? '',
  })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  // A new package with no project in the link starts on the Working on project.
  useWorkingOnDefault(v.project_id, (id) => setV((x) => ({ ...x, project_id: id })), !!initial || params.has('project'))
  const subHeadings = headings.data?.filter((h) => h.kind === 'subcontract' && (h.active || h.id === v.heading_id)) ?? []
  const rate = parseNPR(v.rate)
  const qty = Number(v.quantity)
  const byRate = v.rate_basis === 'rate' && rate !== null && qty > 0
  const agreedPaisa = byRate ? lineAmount(rate, v.quantity) : parseNPR(v.agreed)

  const save = useMutation({
    mutationFn: () => rpc('save_work_package', { p_package: {
      id: v.id, project_id: v.project_id, subcontractor_id: v.subcontractor_id, heading_id: v.heading_id || null,
      scope: v.scope.trim(), rate_basis: v.rate_basis, unit_id: v.rate_basis === 'rate' ? v.unit_id || null : null,
      planned_start: v.planned_start || null, planned_end: v.planned_end || null, status: v.status,
      progress_pct: Number(v.progress) || 0, notes: v.notes.trim() || null,
      // Without finance access the terms key is left out, so the server keeps the agreed value.
      ...(auth.canSeeFinance
        ? { terms: agreedPaisa === null ? null : {
            agreed_value_paisa: agreedPaisa, rate_paisa: byRate ? rate : null, quantity: byRate ? qty : null,
          } }
        : {}),
    } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['work-packages'] })
      await queryClient.invalidateQueries({ queryKey: ['work-package', v.id] })
      await queryClient.invalidateQueries({ queryKey: ['package-figures'] })
      navigate(`/work/${v.id}`, { replace: true })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const progress = Number(v.progress)
    const problem =
      !v.project_id ? 'Choose the project.'
      : !v.subcontractor_id ? 'Choose the subcontractor.'
      : !v.scope.trim() ? 'Describe the work, e.g. Plaster, ground floor.'
      : v.rate_basis === 'rate' && !v.unit_id ? 'Choose the unit the rate is per, e.g. sq.ft.'
      // A rate and quantity that cannot be multiplied would save no agreed value, removing the old one.
      : auth.canSeeFinance && v.rate_basis === 'rate' && v.rate.trim() && rate === null ? 'The rate is not a valid amount.'
      : auth.canSeeFinance && v.rate_basis === 'rate' && v.quantity.trim() && lineAmount(0, v.quantity) === null
        ? 'Expected quantity: a number with at most 3 decimals, e.g. 120.5.'
      : byRate && agreedPaisa === null ? 'Rate times quantity is too large.'
      : Number.isNaN(progress) || progress < 0 || progress > 100 ? 'Progress is a number from 0 to 100.'
      : v.planned_start && v.planned_end && v.planned_end < v.planned_start ? 'The planned end is before the start.'
      : ''
    setError(problem)
    if (!problem) save.mutate()
  }

  // Where it was started from: the package itself, a subcontractor, a project, or Parties.
  const fromSub = params.get('subcontractor')
  const fromProject = params.get('project')
  const subsCrumbs: Crumb[] = [{ to: '/parties', label: 'Parties' }, { to: PARTY.subcontractor.path, label: PARTY.subcontractor.many }]
  const crumbs: Crumb[] = initial
    ? [...subsCrumbs, { to: `/work/${initial.id}`, label: initial.scope }]
    : fromSub
      ? [...subsCrumbs, { to: `${PARTY.subcontractor.path}/${fromSub}`, label: subs.data?.find((s) => s.id === fromSub)?.name ?? PARTY.subcontractor.one }]
      : fromProject
        ? [{ to: '/projects', label: 'Projects' }, { to: `/projects/${fromProject}`, label: projects.data?.find((p) => p.id === fromProject)?.name ?? 'Project' }]
        : subsCrumbs

  return (
    <>
      <PageHeader title={initial ? 'Edit work package' : 'New work package'} crumbs={crumbs} subtitle="Work given to a subcontractor on one project." />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project" htmlFor="wp-project">
              <Select id="wp-project" value={v.project_id} onChange={set('project_id')} disabled={!!initial}>
                <option value="">Choose project</option>
                {projectChoices(projects.data, 'site', [initial?.project_id]).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label="Subcontractor" htmlFor="wp-sub">
              <Select id="wp-sub" value={v.subcontractor_id} onChange={set('subcontractor_id')} disabled={!!initial}>
                <option value="">Choose subcontractor</option>
                {subs.data?.filter((s) => s.active || s.id === v.subcontractor_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Work" htmlFor="wp-scope" hint="e.g. Plaster, ground floor inside walls">
              <Input id="wp-scope" value={v.scope} onChange={set('scope')} />
            </Field>
            <Field label="Cost heading" htmlFor="wp-heading">
              <Select id="wp-heading" value={v.heading_id} onChange={set('heading_id')}>
                <option value="">Subcontract Work</option>
                {subHeadings.filter((h) => h.parent_id).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            </Field>
            <Field label="Planned start" htmlFor="wp-start">
              <DateInput id="wp-start" value={v.planned_start} onChange={(d) => setV({ ...v, planned_start: d })} display={auth.dateDisplay} allowEmpty />
            </Field>
            <Field label="Planned end" htmlFor="wp-end">
              <DateInput id="wp-end" value={v.planned_end} onChange={(d) => setV({ ...v, planned_end: d })} display={auth.dateDisplay} allowEmpty />
            </Field>
            {initial && (
              <>
                <Field label="Status" htmlFor="wp-status">
                  <Select id="wp-status" value={v.status} onChange={set('status')}>
                    {Object.entries(PACKAGE_STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
                  </Select>
                </Field>
                <Field label="Progress (%)" htmlFor="wp-progress">
                  <Input id="wp-progress" inputMode="decimal" value={v.progress} onChange={set('progress')} />
                </Field>
              </>
            )}
            <Field label="Notes" htmlFor="wp-notes"><Input id="wp-notes" value={v.notes} onChange={set('notes')} /></Field>
          </div>
        </Card>

        <Card title="Agreed value">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="How it is priced" htmlFor="wp-basis">
              <Select id="wp-basis" value={v.rate_basis} onChange={set('rate_basis')}>
                <option value="lump_sum">Lump sum (thekka)</option>
                <option value="rate">Rate x quantity</option>
              </Select>
            </Field>
            {v.rate_basis === 'rate' && (
              <Field label="Rate per" htmlFor="wp-unit">
                <Select id="wp-unit" value={v.unit_id} onChange={set('unit_id')}>
                  <option value="">Choose unit</option>
                  {units.data?.filter((u) => u.active || u.id === v.unit_id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
            )}
            {auth.canSeeFinance && v.rate_basis === 'rate' && (
              <>
                <Field label="Rate" htmlFor="wp-rate"><MoneyInput id="wp-rate" value={v.rate} onChange={set('rate')} /></Field>
                <Field label="Expected quantity" htmlFor="wp-qty"><Input id="wp-qty" inputMode="decimal" value={v.quantity} onChange={set('quantity')} /></Field>
              </>
            )}
            {auth.canSeeFinance && v.rate_basis === 'lump_sum' && (
              <Field label="Agreed amount" htmlFor="wp-agreed"><MoneyInput id="wp-agreed" value={v.agreed} onChange={set('agreed')} /></Field>
            )}
          </div>
          {auth.canSeeFinance
            ? <p className="mt-2 text-sm text-subtle">{agreedPaisa !== null ? `Agreed value ${formatNPR(agreedPaisa)}.` : 'Optional. Leave empty if not agreed yet.'} It is not cost; cost comes from approved claims.</p>
            : <p className="mt-2 text-sm text-subtle">Amounts are entered by staff with finance access.</p>}
        </Card>

        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <FormActions>
          <Button type="submit" busy={save.isPending}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        </FormActions>
      </form>
    </>
  )
}
