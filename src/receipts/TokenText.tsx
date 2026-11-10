import { Fragment, type Ref } from 'react'

/*
 * A challenge token as text that wraps where it can be read. The token is one run of characters with no space (A§8.4), so a narrow box
 * would break it mid-word. A break opportunity after each colon lets it break between its six parts, and `overflow-wrap: anywhere` in
 * the stylesheet is the last resort for a part wider than the box. `<wbr>` adds no character: the text that is selected and copied is
 * the token as it was issued.
 */
export function TokenText({ token, innerRef, className }: { token: string; innerRef?: Ref<HTMLSpanElement>; className?: string }) {
  const parts = token.split(':')
  return (
    <span ref={innerRef} className={className}>
      {parts.map((part, at) => (
        <Fragment key={at}>
          {part}
          {at < parts.length - 1 ? (
            <>
              :<wbr />
            </>
          ) : null}
        </Fragment>
      ))}
    </span>
  )
}
