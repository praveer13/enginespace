import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { UNBUILT } from '@/unbuilt/copy'
import { Unbuilt } from '@/unbuilt/Unbuilt'

/** The licence file that the build writes at the site's root (scripts/pages/third-party-licenses.ts), under the base the site is served at. */
const LICENCES = `${import.meta.env.BASE_URL ?? '/'}third-party-licenses.txt`
/** The folder of the typefaces' licence texts (public/fonts/), under the same base: the text names the folder where the site serves it. */
const FONTS = `${import.meta.env.BASE_URL ?? '/'}fonts/`

/*
 * `/about` (ARCHITECTURE §3.1): what each world models and ignores, the claims and their sources, the privacy promise and the licences.
 * W3-T15 builds all of it. Today the page holds the licences of the third-party code and the typefaces, which the build already
 * writes, and it says what is still to come and which task brings it (src/unbuilt/copy.ts). Its lead is its meta description's
 * sentence (scripts/pages/plan.ts), and says only what is here.
 */
export function Component() {
  return (
    <Unbuilt {...UNBUILT.about}>
      <Ticket as="section" width="wide" title="Licences" titleAs="h2">
        <p>
          The licences of the third-party code in this site are in <TextLink file={LICENCES}>third-party-licenses.txt</TextLink>; the typefaces are under the SIL Open Font License 1.1 (Permanent Marker, the Apache
          License 2.0), and the text of each is a file in <code>{FONTS}</code>.
        </p>
      </Ticket>
    </Unbuilt>
  )
}
