import { FrontPage } from '@/front/FrontPage'

/*
 * `/` (ARCHITECTURE §3.1, §6.11): the front page, built in src/front (TRACKER W0-T18). Its loader reads the course index before the
 * page renders, so the menu is printed in the first render, as it is in the static HTML the build writes from the same page.
 */
export function Component() {
  return <FrontPage />
}

// eslint-disable-next-line react-refresh/only-export-components -- React Router takes a lazy route's loader from its module, beside the page
export { loader } from '@/front/menu'
