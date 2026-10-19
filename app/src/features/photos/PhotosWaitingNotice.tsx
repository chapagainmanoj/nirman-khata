// The "photos waiting" notice above every page (components/Layout). Its own file, so the frame does
// not load the Waiting photos page with it: that page stays a separate chunk.
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { listQueuedOwners, photoQueueKey } from '../../components/Attachments'
import { Notice } from '../../components/ui'
import { t } from '../../lib/i18n'

/** Records with photos waiting on this device, for this user and company. */
export function useQueuedOwners() {
  const auth = useCompany()
  const ids = { userId: auth.userId, companyId: auth.companyId }
  return useQuery({ queryKey: photoQueueKey(ids), queryFn: () => listQueuedOwners(ids) })
}

/** Shown above every page while photos are waiting, so none is forgotten on the phone. */
export function PhotosWaitingNotice() {
  const queued = useQueuedOwners()
  const { pathname } = useLocation()
  const { refetch } = queued
  // Forms add to the queue without telling this list; look again on every page change.
  useEffect(() => { void refetch() }, [pathname, refetch])
  const n = queued.data?.reduce((sum, q) => sum + q.count, 0) ?? 0
  if (!n || pathname === '/photos-waiting') return null
  return (
    <div className="mb-4">
      <Notice>
        {n === 1 ? t('waitingPhotos.aPhotoHas') : t('waitingPhotos.nPhotosHave', { n })} {t('waitingPhotos.notUploadedYet')}{' '}<Link className="font-semibold text-slate" to="/photos-waiting">{t('waitingPhotos.see')}{' '}{n === 1 ? 'it' : 'them'}</Link>
      </Notice>
    </div>
  )
}
