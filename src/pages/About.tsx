import { TextLink } from '@/design/components/TextLink'

/** The licence file that the build writes at the site's root (scripts/pages/third-party-licenses.ts), under the base the site is served at. */
const LICENCES = `${import.meta.env.BASE_URL ?? '/'}third-party-licenses.txt`
/** The folder of the typefaces' licence texts (public/fonts/), under the same base: the text names the folder where the site serves it. */
const FONTS = `${import.meta.env.BASE_URL ?? '/'}fonts/`

export function Component() {
  return (
    <>
      <h1>About</h1>
      <p>This page is not built yet.</p>
      <p>
        The licences of the third-party code in this site are in <TextLink file={LICENCES}>third-party-licenses.txt</TextLink>; the typefaces are under the SIL Open Font License 1.1 (Permanent Marker, the Apache
        License 2.0), and the text of each is a file in <code>{FONTS}</code>.
      </p>
    </>
  )
}
