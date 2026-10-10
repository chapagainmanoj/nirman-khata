// The company's own logo where it has one, otherwise the NirmanKhata house mark. Logos sit on a
// white tile with a hairline edge so transparent and dark logos both read. Decorative: the link
// beside it names the company.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { BrandMark } from './icons'

const logoUrl = (path: string) => supabase.storage.from('logos').getPublicUrl(path).data.publicUrl

export function CompanyMark({ logoPath, size = 28, className }: { logoPath: string | null | undefined; size?: number; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!logoPath || failed === logoPath) return <BrandMark size={size} className={className} />
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-white ${className ?? ''}`}
      style={{ width: size, height: size }}>
      <img src={logoUrl(logoPath)} alt="" className="size-full object-contain p-0.5" onError={() => setFailed(logoPath)} />
    </span>
  )
}
