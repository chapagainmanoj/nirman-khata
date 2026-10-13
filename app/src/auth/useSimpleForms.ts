import { useCompany } from './AuthProvider'

/** Company setting: fold the less-used form fields under "More" (components/More.tsx). */
export function useSimpleForms(): boolean {
  return useCompany().company?.simple_forms ?? false
}
