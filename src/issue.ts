import { log, run } from './run.js'

export interface Issue {
  number: number
  title: string
  url: string
}

/** `Ma tâche: écran d'accueil` -> `ma-tache-ecran-d-accueil`: ASCII, 5 words at most. */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 5)
    .join('-')
    .slice(0, 40)
    .replace(/-+$/, '')
}

export const branchName = (issue: Pick<Issue, 'number' | 'title'>) => `${issue.number}-${slugify(issue.title)}`

export const repoSlug = (cwd: string) => run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd })

const toIssue = (raw: { number: number; title: string; html_url?: string; url: string }): Issue => ({ number: raw.number, title: raw.title, url: raw.html_url ?? raw.url })

export function createIssue(cwd: string, title: string, type: string, body = ''): Issue {
  const repo = repoSlug(cwd)
  const create = (extra: string[]) => toIssue(JSON.parse(run('gh', ['api', `repos/${repo}/issues`, '-f', `title=${title}`, '-f', `body=${body}`, ...extra], { cwd })))
  try {
    return create(['-f', `type=${type}`])
  } catch (err) {
    // Issue types are org-level: a repo owned by a user has none.
    log(`issue type "${type}" refused (${(err as Error).message.split('\n').at(-1)}), created without a type`)
    return create([])
  }
}

export function setIssueBody(cwd: string, number: number, body: string): void {
  run('gh', ['api', '-X', 'PATCH', `repos/${repoSlug(cwd)}/issues/${number}`, '-f', `body=${body}`], { cwd })
}

export const getIssue = (cwd: string, number: string): Issue => toIssue(JSON.parse(run('gh', ['issue', 'view', number, '--json', 'number,title,url'], { cwd })))
