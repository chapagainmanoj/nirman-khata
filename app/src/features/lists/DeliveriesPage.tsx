// What arrived at site, newest first, for the current project (or all).
import { useCompany } from '../../auth/AuthProvider'
import { ButtonLink, PageHeader } from '../../components/ui'
import { DeliveryList } from '../supply/DeliveryList'
import { canEnter } from '../supply/permissions'
import { useProjectFilter } from './ProjectFilter'

export function DeliveriesPage() {
  const auth = useCompany()
  const { projectId, chip } = useProjectFilter()
  return (
    <>
      <PageHeader title="Deliveries"
        actions={canEnter(auth) && <ButtonLink to={projectId ? `/deliveries/new?project=${projectId}` : '/deliveries/new'}>Record delivery</ButtonLink>} />
      {chip}
      <DeliveryList key={projectId ?? 'all'} filter={projectId ? { projectId } : {}} />
    </>
  )
}
