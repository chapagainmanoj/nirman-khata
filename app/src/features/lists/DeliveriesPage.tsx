// What arrived at site, newest first, for the current project (or all); searchable by challan,
// supplier and date.
import { useCompany } from '../../auth/AuthProvider'
import { ButtonLink, PageHeader } from '../../components/ui'
import { DeliveryList } from '../supply/DeliveryList'
import { canEnter } from '../supply/permissions'
import { useListFilters } from './ListFilters'
import { useProjectFilter } from './ProjectFilter'

export function DeliveriesPage() {
  const auth = useCompany()
  const { projectId, chip, empty, recordProject } = useProjectFilter()
  const { filter, active, bar, noMatch } = useListFilters({ placeholder: 'Search challan or supplier' })
  return (
    <>
      <PageHeader title="Deliveries"
        actions={canEnter(auth) && <ButtonLink variant="tonal" to={recordProject ? `/deliveries/new?project=${recordProject}` : '/deliveries/new'}>Record delivery</ButtonLink>} />
      {chip}
      {bar}
      <DeliveryList key={projectId ?? 'all'} filter={{ ...(projectId ? { projectId } : {}), ...filter }}
        empty={active ? noMatch('deliveries') : empty('deliveries', undefined)} />
    </>
  )
}
