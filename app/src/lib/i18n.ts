// All user-facing labels go through t() so a Nepali UI can be added later (req §3.3).
// v1 ships English only.
const en = {
  'app.name': 'NirmanKhata',
  'nav.projects': 'Projects',
  'nav.staff': 'Staff',
  'nav.catalog': 'Catalog',
  'nav.settings': 'Settings',
  'nav.signOut': 'Sign out',
  'auth.login': 'Sign in',
  'auth.loginId': 'Mobile number or email',
  'auth.password': 'Password',
  'auth.register': 'Register your company',
  'auth.forgot': 'Forgot your password? Ask your company admin to reset it.',
  'auth.noCompany': 'Your login is not active in any company',
  'auth.noCompanyHelp': 'Ask your company admin to reactivate your account.',
  'projects.title': 'Projects',
  'projects.new': 'New project',
  'projects.empty': 'No projects yet',
  'project.details': 'Details',
  'project.amounts': 'Contract and budget',
  'project.team': 'Assigned staff',
  'project.revisions': 'Revision history',
  'staff.title': 'Staff',
  'staff.add': 'Add staff',
  'catalog.title': 'Catalog',
  'settings.title': 'Settings',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.notAvailable': 'Not available',
} as const

export type MessageKey = keyof typeof en

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v))
  return text
}
